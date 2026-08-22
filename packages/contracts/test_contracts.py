"""Tests for the frozen layer.

If one of these goes red, somebody changed a shared contract and five other
people are about to have a bad morning. Treat a failure here as a team-wide
stop-the-line event, not as a test to update.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from contracts import (
    FUSABLE_CLASSES,
    INFRASTRUCTURE_CLASSES,
    MAX_FUSED_CONFIDENCE,
    BBox,
    BusPosition,
    DetectionClass,
    Event,
    FrameMeta,
    Observation,
    Severity,
    WorkflowStatus,
    derive_status,
    fuse_confidence,
    haversine_m,
    severity_from_dimensions,
)
from pydantic import ValidationError

NOW = datetime.now(tz=UTC)


def make_obs(**overrides: object) -> Observation:
    base: dict[str, object] = {
        "bus_id": "MTC-ADYAR-1042",
        "route_id": "27B",
        "ts": NOW,
        "lat": 13.0067,
        "lon": 80.2570,
        "gps_accuracy_m": 4.0,
        "heading_deg": 187.4,
        "speed_kmph": 24.5,
        "detection_class": DetectionClass.POTHOLE,
        "raw_confidence": 0.82,
        "severity": Severity.MEDIUM,
    }
    base.update(overrides)
    return Observation(**base)


# ── enums ───────────────────────────────────────────────────────────────────
def test_infrastructure_classes_has_exactly_eight_members() -> None:
    assert len(INFRASTRUCTURE_CLASSES) == 8
    assert DetectionClass.POTHOLE in INFRASTRUCTURE_CLASSES
    assert DetectionClass.VEHICLE not in INFRASTRUCTURE_CLASSES


def test_fusable_classes_is_infrastructure_plus_the_three_safety_classes() -> None:
    """Plain presence must never become a workflow item with an SLA clock."""
    assert FUSABLE_CLASSES >= INFRASTRUCTURE_CLASSES
    assert {
        DetectionClass.PEDESTRIAN_RISK,
        DetectionClass.RASH_DRIVING,
        DetectionClass.COLLISION,
    } == FUSABLE_CLASSES - INFRASTRUCTURE_CLASSES
    assert DetectionClass.PEDESTRIAN not in FUSABLE_CLASSES
    assert DetectionClass.VEHICLE not in FUSABLE_CLASSES


def test_enums_are_strings_on_the_wire() -> None:
    assert DetectionClass.POTHOLE == "POTHOLE"
    assert WorkflowStatus.RESOLVED == "RESOLVED"


# ── Observation ─────────────────────────────────────────────────────────────
def test_observation_roundtrips_through_json() -> None:
    obs = make_obs()
    assert Observation.model_validate_json(obs.model_dump_json()) == obs


def test_observation_is_frozen() -> None:
    obs = make_obs()
    with pytest.raises(ValidationError):
        obs.lat = 0.0  # type: ignore[misc]


def test_naive_timestamp_is_rejected() -> None:
    with pytest.raises(ValidationError, match="timezone-aware"):
        make_obs(ts=datetime(2026, 8, 21, 9, 14, 3))


def test_infrastructure_class_requires_severity() -> None:
    with pytest.raises(ValidationError, match="requires a severity"):
        make_obs(detection_class=DetectionClass.ALLIGATOR_CRACK, severity=None)


def test_non_infrastructure_class_needs_no_severity() -> None:
    obs = make_obs(detection_class=DetectionClass.VEHICLE, severity=None)
    assert obs.severity is None


def test_bus_id_pattern_is_enforced() -> None:
    # the depot segment is one token — "T-NAGAR" must be written "TNAGAR"
    with pytest.raises(ValidationError):
        make_obs(bus_id="TN-01-AB-1234")
    with pytest.raises(ValidationError):
        make_obs(bus_id="MTC-T-NAGAR-0007")
    assert make_obs(bus_id="MTC-TNAGAR-0007").bus_id == "MTC-TNAGAR-0007"


def test_plate_hash_must_be_sha256_hex() -> None:
    with pytest.raises(ValidationError):
        make_obs(plate_hash="TN09BX4412")
    assert make_obs(plate_hash="a" * 64).plate_hash == "a" * 64


def test_reid_embedding_must_be_512_floats() -> None:
    with pytest.raises(ValidationError, match="exactly 512"):
        make_obs(reid_embedding=[0.1] * 128)
    assert make_obs(reid_embedding=[0.0] * 512) is not None


def test_confidence_is_bounded() -> None:
    with pytest.raises(ValidationError):
        make_obs(raw_confidence=1.4)


def test_unknown_field_is_rejected() -> None:
    with pytest.raises(ValidationError):
        make_obs(colour="red")


# ── BBox ────────────────────────────────────────────────────────────────────
def test_bbox_requires_positive_extent() -> None:
    with pytest.raises(ValidationError, match="x2"):
        BBox(x1=100, y1=10, x2=50, y2=90)
    with pytest.raises(ValidationError, match="y2"):
        BBox(x1=10, y1=100, x2=50, y2=90)


def test_bbox_geometry_helpers() -> None:
    box = BBox(x1=10, y1=20, x2=40, y2=60)
    assert (box.width, box.height, box.area) == (30.0, 40.0, 1200.0)


# ── fusion maths ────────────────────────────────────────────────────────────
def test_fuse_confidence_of_nothing_is_zero() -> None:
    assert fuse_confidence([]) == 0.0


def test_fuse_confidence_is_noisy_or() -> None:
    assert fuse_confidence([0.6, 0.6]) == pytest.approx(0.84)
    assert fuse_confidence([0.5]) == pytest.approx(0.5)


def test_fuse_confidence_never_reaches_certainty() -> None:
    assert fuse_confidence([1.0, 1.0, 1.0]) == MAX_FUSED_CONFIDENCE


def test_fuse_confidence_is_monotonic() -> None:
    assert fuse_confidence([0.5, 0.5, 0.5]) > fuse_confidence([0.5, 0.5])


@pytest.mark.parametrize(
    ("buses", "confidence", "expected"),
    [
        (3, 0.96, WorkflowStatus.AUTHORITY_NOTIFIED),
        (4, 0.99, WorkflowStatus.AUTHORITY_NOTIFIED),
        (3, 0.90, WorkflowStatus.AI_VERIFIED),  # enough buses, not enough confidence
        (2, 0.10, WorkflowStatus.AI_VERIFIED),  # corroboration alone is sufficient
        (1, 0.70, WorkflowStatus.AI_VERIFIED),
        (1, 0.69, WorkflowStatus.DETECTED),
        (0, 0.99, WorkflowStatus.DETECTED),
    ],
)
def test_status_ladder(buses: int, confidence: float, expected: WorkflowStatus) -> None:
    assert derive_status(buses, confidence) == expected


def test_haversine_matches_known_distance() -> None:
    # Chennai Central → Adyar, roughly 10 km
    metres = haversine_m(13.0827, 80.2707, 13.0067, 80.2570)
    assert 8_000 < metres < 10_000
    assert haversine_m(13.0, 80.0, 13.0, 80.0) == 0.0


@pytest.mark.parametrize(
    ("across", "depth", "expected"),
    [
        (80.0, 10.0, Severity.SMALL),
        (150.0, 10.0, Severity.MEDIUM),
        (80.0, 30.0, Severity.MEDIUM),  # deep but narrow still escalates
        (400.0, 10.0, Severity.LARGE),
        (80.0, 60.0, Severity.LARGE),
    ],
)
def test_irc_severity_classification(across: float, depth: float, expected: Severity) -> None:
    assert severity_from_dimensions(across, depth) == expected


# ── Event ───────────────────────────────────────────────────────────────────
def test_event_rejects_backwards_time() -> None:
    with pytest.raises(ValidationError, match="last_seen"):
        Event(
            lat=13.0,
            lon=80.2,
            detection_class=DetectionClass.POTHOLE,
            severity=Severity.LARGE,
            fused_confidence=0.9,
            observation_count=2,
            distinct_bus_count=2,
            first_seen=NOW,
            last_seen=NOW - timedelta(hours=1),
        )


def test_event_rejects_more_buses_than_observations() -> None:
    with pytest.raises(ValidationError, match="distinct_bus_count"):
        Event(
            lat=13.0,
            lon=80.2,
            detection_class=DetectionClass.POTHOLE,
            severity=Severity.LARGE,
            fused_confidence=0.9,
            observation_count=1,
            distinct_bus_count=3,
            first_seen=NOW,
            last_seen=NOW,
        )


# ── misc models ─────────────────────────────────────────────────────────────
def test_bus_position_and_frame_meta_accept_the_same_bus_id() -> None:
    bus_id = "MTC-VYASARPADI-3311"
    assert (
        BusPosition(
            bus_id=bus_id,
            route_id="21G",
            ts=NOW,
            lat=13.1,
            lon=80.25,
            heading_deg=12.0,
            speed_kmph=30.0,
        ).bus_id
        == bus_id
    )
    assert FrameMeta(bus_id=bus_id, route_id="21G", ts=NOW, lat=13.1, lon=80.25).bus_id == bus_id


def test_every_model_ships_a_schema_example() -> None:
    """The examples are what the frontend and the docs page are built from."""
    for model in (Observation, Event, BusPosition, FrameMeta, BBox):
        schema = model.model_json_schema()
        assert schema.get("examples"), f"{model.__name__} lost its json_schema_extra example"
