"""M1 module tests.

These test the **Protocol**, not the mock. When M1 swaps in the real detector,
these same tests should pass unchanged — that is the contract that lets M1 flip
USE_REAL_DEFECTS without asking anyone.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from citydata import DEFECT_HOTSPOTS
from contracts import (
    INFRASTRUCTURE_CLASSES,
    DefectDetector,
    DetectionClass,
    FrameMeta,
    Observation,
)

from services.perception.defects import MockDefectDetector, get_defect_detector

NOW = datetime.now(tz=UTC)
HOTSPOT = DEFECT_HOTSPOTS[0]


@pytest.fixture
def detector() -> DefectDetector:
    return get_defect_detector()


def meta_at(lat: float, lon: float, **overrides: object) -> FrameMeta:
    base: dict[str, object] = {
        "bus_id": "MTC-ADYAR-1042",
        "route_id": "27B",
        "ts": NOW,
        "lat": lat,
        "lon": lon,
        "heading_deg": 180.0,
        "speed_kmph": 25.0,
        "gps_accuracy_m": 4.0,
        "frame_idx": 100,
    }
    base.update(overrides)
    return FrameMeta(**base)  # type: ignore[arg-type]


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_returns_something_satisfying_the_protocol(detector: DefectDetector) -> None:
    assert isinstance(detector, DefectDetector)
    assert callable(detector.detect)


def test_default_env_gives_the_mock(detector: DefectDetector) -> None:
    """Guard rail: if this fails, someone committed USE_REAL_DEFECTS=true."""
    assert isinstance(detector, MockDefectDetector)


# ── output shape ────────────────────────────────────────────────────────────
def test_detect_returns_a_list_of_observations(detector: DefectDetector) -> None:
    result = detector.detect(None, meta_at(HOTSPOT.center[1], HOTSPOT.center[0]))
    assert isinstance(result, list)
    assert all(isinstance(item, Observation) for item in result)


def test_hotspot_produces_a_detection(detector: DefectDetector) -> None:
    observations = detector.detect(None, meta_at(HOTSPOT.center[1], HOTSPOT.center[0]))
    classes = {obs.detection_class for obs in observations}
    assert DetectionClass(HOTSPOT.detection_class) in classes


def test_empty_road_is_usually_quiet(detector: DefectDetector) -> None:
    """Far out at sea there are no hotspots; only the rare novel path may fire."""
    hits = sum(len(detector.detect(None, meta_at(12.5, 80.9, frame_idx=i))) for i in range(50))
    assert hits <= 5


def test_stationary_bus_emits_nothing(detector: DefectDetector) -> None:
    meta = meta_at(HOTSPOT.center[1], HOTSPOT.center[0], speed_kmph=0.0)
    assert detector.detect(None, meta) == []


# ── contract invariants every implementation must hold ──────────────────────
def test_every_infrastructure_detection_carries_a_severity(detector: DefectDetector) -> None:
    for hotspot in DEFECT_HOTSPOTS:
        for obs in detector.detect(None, meta_at(hotspot.center[1], hotspot.center[0])):
            if obs.detection_class in INFRASTRUCTURE_CLASSES:
                assert obs.severity is not None


def test_observations_inherit_frame_identity(detector: DefectDetector) -> None:
    meta = meta_at(HOTSPOT.center[1], HOTSPOT.center[0])
    for obs in detector.detect(None, meta):
        assert obs.bus_id == meta.bus_id
        assert obs.route_id == meta.route_id
        assert obs.ts == meta.ts


def test_detections_land_near_the_bus(detector: DefectDetector) -> None:
    """A defect 2 km behind the bus is a bug, not a detection."""
    from contracts import haversine_m

    meta = meta_at(HOTSPOT.center[1], HOTSPOT.center[0])
    for obs in detector.detect(None, meta):
        assert haversine_m(meta.lat, meta.lon, obs.lat, obs.lon) < 200.0


def test_confidence_is_a_probability(detector: DefectDetector) -> None:
    for hotspot in DEFECT_HOTSPOTS[:5]:
        for obs in detector.detect(None, meta_at(hotspot.center[1], hotspot.center[0])):
            assert 0.0 <= obs.raw_confidence <= 1.0


def test_bboxes_are_well_formed(detector: DefectDetector) -> None:
    for obs in detector.detect(None, meta_at(HOTSPOT.center[1], HOTSPOT.center[0])):
        if obs.bbox is not None:
            assert obs.bbox.x2 > obs.bbox.x1
            assert obs.bbox.y2 > obs.bbox.y1


def test_repeated_passes_never_reuse_an_observation_id(detector: DefectDetector) -> None:
    seen: set[str] = set()
    for frame_idx in range(20):
        for obs in detector.detect(
            None, meta_at(HOTSPOT.center[1], HOTSPOT.center[0], frame_idx=frame_idx)
        ):
            assert str(obs.obs_id) not in seen
            seen.add(str(obs.obs_id))
