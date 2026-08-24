"""M4 near-miss tests — the AI intelligence layer's most novel feature."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from contracts import DetectionClass, FrameMeta, NearMissEvent, Observation, Severity

from services.edge.incidents.near_miss import (
    _JUNCTIONS,
    MockNearMissDetector,
    scripted_near_misses,
)

NOW = datetime.now(tz=UTC)


def meta_at(lat: float, lon: float, bus_id: str, **overrides: object) -> FrameMeta:
    base: dict[str, object] = {
        "bus_id": bus_id,
        "route_id": "27B",
        "ts": NOW,
        "lat": lat,
        "lon": lon,
        "heading_deg": 190.0,
        "speed_kmph": 28.0,
        "frame_idx": 1,
    }
    base.update(overrides)
    return FrameMeta(**base)  # type: ignore[arg-type]


@pytest.fixture
def detector() -> MockNearMissDetector:
    return MockNearMissDetector()


# ── the scripted junctions fire correctly ───────────────────────────────────
def test_a_junction_fires_when_its_bus_passes(detector: MockNearMissDetector) -> None:
    junction = _JUNCTIONS[0]
    observations = detector.detect(None, meta_at(junction.lat, junction.lon, junction.bus_id))
    assert len(observations) == 1
    assert observations[0].detection_class is DetectionClass.NEAR_MISS


def test_a_junction_does_not_fire_for_the_wrong_bus(detector: MockNearMissDetector) -> None:
    junction = _JUNCTIONS[0]
    observations = detector.detect(
        None, meta_at(junction.lat, junction.lon, "MTC-TNAGAR-1875")
    )
    assert observations == []


def test_a_junction_does_not_fire_far_away(detector: MockNearMissDetector) -> None:
    junction = _JUNCTIONS[0]
    observations = detector.detect(
        None, meta_at(junction.lat + 0.05, junction.lon + 0.05, junction.bus_id)
    )
    assert observations == []


def test_each_junction_fires_once_per_loop(detector: MockNearMissDetector) -> None:
    junction = _JUNCTIONS[0]
    first = detector.detect(None, meta_at(junction.lat, junction.lon, junction.bus_id))
    second = detector.detect(
        None, meta_at(junction.lat, junction.lon, junction.bus_id, frame_idx=2)
    )
    assert len(first) == 1
    assert second == []


def test_reset_rearms_every_junction(detector: MockNearMissDetector) -> None:
    junction = _JUNCTIONS[0]
    detector.detect(None, meta_at(junction.lat, junction.lon, junction.bus_id))
    detector.reset()
    again = detector.detect(
        None, meta_at(junction.lat, junction.lon, junction.bus_id, frame_idx=3)
    )
    assert len(again) == 1


def test_all_three_junctions_are_reachable(detector: MockNearMissDetector) -> None:
    fired = set()
    for junction in _JUNCTIONS:
        observations = detector.detect(None, meta_at(junction.lat, junction.lon, junction.bus_id))
        if observations:
            fired.add(junction.key)
    assert fired == {j.key for j in _JUNCTIONS}


def test_history_records_the_rich_event(detector: MockNearMissDetector) -> None:
    junction = _JUNCTIONS[0]
    detector.detect(None, meta_at(junction.lat, junction.lon, junction.bus_id))
    assert len(detector.history) == 1
    assert isinstance(detector.history[0], NearMissEvent)
    assert detector.history[0].road_id == junction.road_id


# ── the Observation the mock emits feeds the normal fusion path ────────────
def test_emitted_observation_carries_severity_and_fuses(detector: MockNearMissDetector) -> None:
    junction = _JUNCTIONS[0]
    observations = detector.detect(None, meta_at(junction.lat, junction.lon, junction.bus_id))
    obs = observations[0]
    assert isinstance(obs, Observation)
    assert obs.detection_class is DetectionClass.NEAR_MISS
    assert obs.severity is not None  # required for FUSABLE_CLASSES to land it in an Event

    from contracts import FUSABLE_CLASSES

    assert obs.detection_class in FUSABLE_CLASSES


def test_lower_ttc_gives_higher_confidence(detector: MockNearMissDetector) -> None:
    a, b = _JUNCTIONS[0], _JUNCTIONS[1]
    assert a.min_ttc_seconds < b.min_ttc_seconds
    obs_a = detector.detect(None, meta_at(a.lat, a.lon, a.bus_id))[0]
    obs_b = detector.detect(None, meta_at(b.lat, b.lon, b.bus_id))[0]
    assert obs_a.raw_confidence >= obs_b.raw_confidence


# ── the scripted list, independent of the detector ──────────────────────────
def test_scripted_near_misses_returns_one_per_junction() -> None:
    events = scripted_near_misses(NOW)
    assert len(events) == len(_JUNCTIONS)
    assert all(isinstance(event, NearMissEvent) for event in events)


def test_scripted_near_misses_ttc_is_plausible() -> None:
    for event in scripted_near_misses(NOW):
        assert 0.4 <= event.min_ttc_seconds <= 1.4


def test_scripted_near_misses_severity_matches_ttc_bucket() -> None:
    for event in scripted_near_misses(NOW):
        if event.min_ttc_seconds < 0.7:
            assert event.severity in (Severity.LARGE, Severity.MEDIUM)


def test_scripted_near_misses_are_deterministic() -> None:
    """Rehearsability: the same clock reading gives the same ids and timestamps."""
    first = scripted_near_misses(NOW)
    second = scripted_near_misses(NOW)
    assert [e.nm_id for e in first] == [e.nm_id for e in second]
    assert [e.ts for e in first] == [e.ts for e in second]


def test_scripted_near_misses_are_spread_over_recent_days() -> None:
    events = scripted_near_misses(NOW)
    assert all(event.ts < NOW for event in events)
    assert all((NOW - event.ts).days <= 7 for event in events)


def test_scripted_near_misses_do_not_depend_on_the_detector() -> None:
    """The API can call this cold, with no replay ever having run."""
    events_before = scripted_near_misses(NOW)
    MockNearMissDetector()  # never invoked
    events_after = scripted_near_misses(NOW)
    assert [e.nm_id for e in events_before] == [e.nm_id for e in events_after]
