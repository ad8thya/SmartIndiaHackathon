"""M3 pedestrian module tests — written against the Protocol, not the mock."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from citydata import SCHOOL_ZONES
from contracts import (
    INFRASTRUCTURE_CLASSES,
    DetectionClass,
    FrameMeta,
    Observation,
    PedestrianRiskDetector,
)

from services.edge.pedestrian import (
    MockPedestrianRiskDetector,
    get_pedestrian_detector,
)

NOW = datetime.now(tz=UTC)
ZONE = SCHOOL_ZONES[0]
#: a point far from any seeded school zone
OPEN_ROAD = (13.1600, 80.1500)


@pytest.fixture
def detector() -> PedestrianRiskDetector:
    return get_pedestrian_detector()


def meta_at(lat: float, lon: float, **overrides: object) -> FrameMeta:
    base: dict[str, object] = {
        "bus_id": "MTC-TNAGAR-1875",
        "route_id": "51C",
        "ts": NOW,
        "lat": lat,
        "lon": lon,
        "heading_deg": 90.0,
        "speed_kmph": 22.0,
        "frame_idx": 7,
    }
    base.update(overrides)
    return FrameMeta(**base)  # type: ignore[arg-type]


def sweep(
    detector: PedestrianRiskDetector, lat: float, lon: float, n: int = 80
) -> list[Observation]:
    out: list[Observation] = []
    for i in range(n):
        out.extend(detector.detect(None, meta_at(lat, lon, frame_idx=i)))
    return out


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_satisfies_the_protocol(detector: PedestrianRiskDetector) -> None:
    assert isinstance(detector, PedestrianRiskDetector)


def test_default_env_gives_the_mock(detector: PedestrianRiskDetector) -> None:
    assert isinstance(detector, MockPedestrianRiskDetector)


def test_returns_observations(detector: PedestrianRiskDetector) -> None:
    result = detector.detect(None, meta_at(ZONE.center[1], ZONE.center[0]))
    assert all(isinstance(item, Observation) for item in result)


# ── behaviour that the RiskPanel demo depends on ────────────────────────────
def test_school_zone_produces_risk_observations(detector: PedestrianRiskDetector) -> None:
    classes = {obs.detection_class for obs in sweep(detector, ZONE.center[1], ZONE.center[0])}
    assert DetectionClass.PEDESTRIAN_RISK in classes
    assert DetectionClass.PEDESTRIAN in classes


def test_open_road_has_no_risk_events(detector: PedestrianRiskDetector) -> None:
    classes = {obs.detection_class for obs in sweep(detector, *OPEN_ROAD)}
    assert DetectionClass.PEDESTRIAN_RISK not in classes


def test_school_zone_is_busier_than_open_road(detector: PedestrianRiskDetector) -> None:
    in_zone = len(sweep(detector, ZONE.center[1], ZONE.center[0]))
    on_road = len(sweep(detector, *OPEN_ROAD))
    assert in_zone > on_road


def test_speeding_past_a_school_raises_the_risk_rate(detector: PedestrianRiskDetector) -> None:
    def risk_count(speed: float) -> int:
        return sum(
            1
            for i in range(200)
            for obs in detector.detect(
                None, meta_at(ZONE.center[1], ZONE.center[0], frame_idx=i, speed_kmph=speed)
            )
            if obs.detection_class is DetectionClass.PEDESTRIAN_RISK
        )

    assert risk_count(55.0) > risk_count(15.0)


# ── contract invariants ─────────────────────────────────────────────────────
def test_pedestrian_classes_carry_no_severity(detector: PedestrianRiskDetector) -> None:
    for obs in sweep(detector, ZONE.center[1], ZONE.center[0]):
        assert obs.detection_class not in INFRASTRUCTURE_CLASSES
        assert obs.severity is None


def test_only_pedestrian_classes_are_emitted(detector: PedestrianRiskDetector) -> None:
    allowed = {DetectionClass.PEDESTRIAN, DetectionClass.PEDESTRIAN_RISK}
    assert {
        obs.detection_class for obs in sweep(detector, ZONE.center[1], ZONE.center[0])
    } <= allowed


def test_risk_observations_carry_evidence(detector: PedestrianRiskDetector) -> None:
    """An operator cannot action a risk alert with no picture attached."""
    risks = [
        obs
        for obs in sweep(detector, ZONE.center[1], ZONE.center[0])
        if obs.detection_class is DetectionClass.PEDESTRIAN_RISK
    ]
    assert risks, "expected at least one risk observation in the sweep"
    assert all(obs.evidence_uri for obs in risks)


def test_tracks_have_ids(detector: PedestrianRiskDetector) -> None:
    for obs in sweep(detector, ZONE.center[1], ZONE.center[0], n=10):
        assert obs.track_id is not None
