"""M2 traffic module tests — Protocol level."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from citydata import SEGMENTS
from contracts import (
    DetectionClass,
    Observation,
    RiskLevel,
    RoadCondition,
    Severity,
    TrafficAnalyzer,
)

from services.cloud.intelligence.traffic_analytics import (
    MockTrafficAnalyzer,
    congestion_curve,
    get_traffic_analyzer,
)

NOW = datetime.now(tz=UTC)
SEGMENT = SEGMENTS[0]


@pytest.fixture
def analyzer() -> TrafficAnalyzer:
    return get_traffic_analyzer()


def obs_at(
    segment_index: int = 0,
    detection_class: DetectionClass = DetectionClass.VEHICLE,
    severity: Severity | None = None,
    ts: datetime | None = None,
) -> Observation:
    segment = SEGMENTS[segment_index]
    return Observation(
        obs_id=uuid4(),
        bus_id="MTC-ADYAR-1042",
        route_id=segment.route_id,
        ts=ts or NOW,
        lat=segment.center[1],
        lon=segment.center[0],
        gps_accuracy_m=5.0,
        heading_deg=90.0,
        speed_kmph=20.0,
        detection_class=detection_class,
        raw_confidence=0.8,
        severity=severity,
    )


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_satisfies_the_protocol(analyzer: TrafficAnalyzer) -> None:
    assert isinstance(analyzer, TrafficAnalyzer)


def test_default_env_gives_the_mock(analyzer: TrafficAnalyzer) -> None:
    assert isinstance(analyzer, MockTrafficAnalyzer)


def test_returns_a_condition_for_every_segment(analyzer: TrafficAnalyzer) -> None:
    conditions = analyzer.analyze([])
    assert set(conditions) == {segment.road_id for segment in SEGMENTS}
    assert all(isinstance(value, RoadCondition) for value in conditions.values())


def test_empty_input_still_produces_a_full_map(analyzer: TrafficAnalyzer) -> None:
    """The map must never be blank, even before a single bus has reported."""
    assert len(analyzer.analyze([])) == len(SEGMENTS)


def test_road_id_matches_its_key(analyzer: TrafficAnalyzer) -> None:
    for road_id, condition in analyzer.analyze([]).items():
        assert condition.road_id == road_id


# ── numbers stay inside their contract ranges ───────────────────────────────
def test_all_values_are_in_range(analyzer: TrafficAnalyzer) -> None:
    for condition in analyzer.analyze([obs_at(i % len(SEGMENTS)) for i in range(40)]).values():
        assert 0.0 <= condition.congestion_pct <= 100.0
        assert 0.0 <= condition.pci_score <= 100.0
        assert condition.avg_speed_kmph >= 0.0
        assert condition.density >= 0.0
        assert isinstance(condition.risk_level, RiskLevel)


# ── behaviour the TrafficPanel demo depends on ──────────────────────────────
def test_congestion_animates_across_the_day() -> None:
    """A flat curve makes the heatmap look like a screenshot."""
    hourly = [congestion_curve(NOW.replace(hour=hour, minute=0)) for hour in range(24)]
    assert max(hourly) - min(hourly) > 25.0


def test_peaks_land_at_rush_hour() -> None:
    at = lambda h: congestion_curve(NOW.replace(hour=h, minute=0))  # noqa: E731
    assert at(9) > at(3)
    assert at(18) > at(14)
    assert at(18) > at(23)


def test_corridors_are_phase_shifted(analyzer: TrafficAnalyzer) -> None:
    """If every road pulsed in unison the heatmap would look synthetic."""
    values = {c.congestion_pct for c in analyzer.analyze([]).values()}
    assert len(values) > 3


def test_more_vehicles_means_more_congestion(analyzer: TrafficAnalyzer) -> None:
    quiet = analyzer.analyze([])[SEGMENT.road_id]
    busy = analyzer.analyze([obs_at(0) for _ in range(15)])[SEGMENT.road_id]
    assert busy.congestion_pct >= quiet.congestion_pct
    assert busy.avg_speed_kmph <= quiet.avg_speed_kmph


def test_defects_degrade_the_pci(analyzer: TrafficAnalyzer) -> None:
    clean = analyzer.analyze([])[SEGMENT.road_id]
    damaged = analyzer.analyze(
        [obs_at(0, DetectionClass.POTHOLE, Severity.LARGE) for _ in range(5)]
    )[SEGMENT.road_id]
    assert damaged.pci_score < clean.pci_score
    assert damaged.defect_counts.get("POTHOLE") == 5


def test_congestion_drives_bus_delay(analyzer: TrafficAnalyzer) -> None:
    for condition in analyzer.analyze([]).values():
        if condition.congestion_pct > 60.0:
            assert condition.bus_delay_min > 0.0


def test_reference_clock_follows_the_observations(analyzer: TrafficAnalyzer) -> None:
    """Replay runs at 60x — the curve must follow simulated time, not wall time."""
    morning = analyzer.analyze([obs_at(0, ts=NOW.replace(hour=9, minute=0))])
    night = analyzer.analyze([obs_at(0, ts=NOW.replace(hour=3, minute=0))])
    assert morning[SEGMENT.road_id].congestion_pct != night[SEGMENT.road_id].congestion_pct


def test_stale_and_fresh_observations_both_land(analyzer: TrafficAnalyzer) -> None:
    old = obs_at(0, ts=NOW - timedelta(hours=2))
    assert analyzer.analyze([old])[SEGMENT.road_id] is not None
