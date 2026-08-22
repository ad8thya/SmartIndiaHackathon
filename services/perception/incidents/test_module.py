"""M4 incident module tests — Protocol level, plus the privacy invariants."""

from __future__ import annotations

import re
from datetime import UTC, datetime

import pytest
from citydata import segment_by_id
from contracts import DetectionClass, FrameMeta, IncidentDetector, IncidentReport

from services.perception.incidents import (
    SCRIPTED_BUS,
    SCRIPTED_PLATE,
    SCRIPTED_SEGMENT,
    MockIncidentDetector,
    get_incident_detector,
    hash_plate,
)

NOW = datetime.now(tz=UTC)
SCENE = segment_by_id(SCRIPTED_SEGMENT).center  # (lon, lat)


@pytest.fixture
def detector() -> IncidentDetector:
    return MockIncidentDetector()


def meta_at(lat: float, lon: float, bus_id: str = SCRIPTED_BUS, **overrides: object) -> FrameMeta:
    base: dict[str, object] = {
        "bus_id": bus_id,
        "route_id": "21G",
        "ts": NOW,
        "lat": lat,
        "lon": lon,
        "heading_deg": 200.0,
        "speed_kmph": 32.0,
        "frame_idx": 3,
    }
    base.update(overrides)
    return FrameMeta(**base)  # type: ignore[arg-type]


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_satisfies_the_protocol() -> None:
    assert isinstance(get_incident_detector(), IncidentDetector)


def test_default_env_gives_the_mock() -> None:
    assert isinstance(get_incident_detector(), MockIncidentDetector)


def test_process_accepts_a_frame_window(detector: IncidentDetector) -> None:
    reports = detector.process([], meta_at(SCENE[1], SCENE[0]))
    assert all(isinstance(item, IncidentReport) for item in reports)


# ── the scripted story the demo is built around ─────────────────────────────
def test_scripted_hit_and_run_fires_once(detector: MockIncidentDetector) -> None:
    first = detector.process([], meta_at(SCENE[1], SCENE[0]))
    collisions = [r for r in first if r.incident_class is DetectionClass.COLLISION]
    assert len(collisions) == 1

    incident = collisions[0]
    assert incident.plate_text == SCRIPTED_PLATE
    assert incident.plate_confidence == pytest.approx(0.87)
    assert incident.reported_by_bus == SCRIPTED_BUS
    assert incident.road_segment_id == SCRIPTED_SEGMENT
    assert len(incident.evidence_uris) >= 3

    # and it does not fire again on the next pass
    again = detector.process([], meta_at(SCENE[1], SCENE[0], frame_idx=4))
    assert not [r for r in again if r.incident_class is DetectionClass.COLLISION]


def test_scripted_incident_resets_for_the_next_replay_loop(detector: MockIncidentDetector) -> None:
    detector.process([], meta_at(SCENE[1], SCENE[0]))
    detector.reset()
    reports = detector.process([], meta_at(SCENE[1], SCENE[0], frame_idx=9))
    assert any(r.incident_class is DetectionClass.COLLISION for r in reports)


def test_other_buses_do_not_witness_the_scripted_incident(
    detector: MockIncidentDetector,
) -> None:
    reports = detector.process([], meta_at(SCENE[1], SCENE[0], bus_id="MTC-ADYAR-1042"))
    assert not [r for r in reports if r.incident_class is DetectionClass.COLLISION]


def test_rash_driving_shows_up_over_a_long_run(detector: MockIncidentDetector) -> None:
    classes = {
        report.incident_class
        for i in range(600)
        for report in detector.process([], meta_at(13.06, 80.28, frame_idx=i))
    }
    assert DetectionClass.RASH_DRIVING in classes


# ── privacy invariants — these are the ones that must never regress ─────────
def test_plate_hash_is_a_salted_sha256(detector: MockIncidentDetector) -> None:
    incident = next(
        r
        for r in detector.process([], meta_at(SCENE[1], SCENE[0]))
        if r.incident_class is DetectionClass.COLLISION
    )
    assert incident.plate_hash is not None
    assert re.fullmatch(r"[a-f0-9]{64}", incident.plate_hash)
    assert incident.plate_hash == hash_plate(SCRIPTED_PLATE)


def test_hashing_is_salt_dependent() -> None:
    assert hash_plate("TN 09 BX 4412", "salt-a") != hash_plate("TN 09 BX 4412", "salt-b")


def test_hashing_ignores_spacing_and_case() -> None:
    assert hash_plate("TN 09 BX 4412", "s") == hash_plate("tn09bx4412", "s")


def test_a_readable_plate_is_always_accompanied_by_its_hash(
    detector: MockIncidentDetector,
) -> None:
    """If plate_text is set, plate_hash must be too — otherwise the persisted
    row loses the only link back to the vehicle."""
    for i in range(400):
        for report in detector.process([], meta_at(13.06, 80.28, frame_idx=i)):
            if report.plate_text is not None:
                assert report.plate_hash is not None
                assert report.plate_confidence is not None


def test_only_incident_classes_are_emitted(detector: MockIncidentDetector) -> None:
    allowed = {DetectionClass.COLLISION, DetectionClass.RASH_DRIVING}
    classes = {
        report.incident_class
        for i in range(300)
        for report in detector.process([], meta_at(SCENE[1], SCENE[0], frame_idx=i))
    }
    assert classes <= allowed
