"""Tests for the frozen layer.

If one of these goes red, somebody changed a shared contract and five other
people are about to have a bad morning. Treat a failure here as a team-wide
stop-the-line event, not as a test to update.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from contracts import (
    FUSABLE_CLASSES,
    INFRASTRUCTURE_CLASSES,
    MAX_FUSED_CONFIDENCE,
    SAFETY_CLASSES,
    BBox,
    BusPosition,
    DetectionClass,
    Event,
    FrameMeta,
    InfrastructureRecommendation,
    NearMissEvent,
    Observation,
    RecommendationType,
    RiskBand,
    RiskContext,
    Severity,
    UrbanRiskScore,
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


def test_fusable_classes_is_infrastructure_plus_the_four_safety_classes() -> None:
    """Plain presence must never become a workflow item with an SLA clock.

    NEAR_MISS joined this set in the AI intelligence layer amendment — a
    repeated near-miss at one junction is exactly the corroborated safety
    signal this ladder exists to surface.
    """
    assert FUSABLE_CLASSES >= INFRASTRUCTURE_CLASSES
    assert {
        DetectionClass.PEDESTRIAN_RISK,
        DetectionClass.RASH_DRIVING,
        DetectionClass.COLLISION,
        DetectionClass.NEAR_MISS,
    } == FUSABLE_CLASSES - INFRASTRUCTURE_CLASSES
    assert DetectionClass.PEDESTRIAN not in FUSABLE_CLASSES
    assert DetectionClass.VEHICLE not in FUSABLE_CLASSES


def test_near_miss_fuses_but_plain_pedestrian_does_not() -> None:
    """The exact distinction the amendment is built on."""
    assert DetectionClass.NEAR_MISS in FUSABLE_CLASSES
    assert DetectionClass.NEAR_MISS in SAFETY_CLASSES
    assert DetectionClass.PEDESTRIAN not in FUSABLE_CLASSES


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


# ── AI intelligence layer (v1.1.0 amendment) ────────────────────────────────
def _risk_score(**overrides: object) -> UrbanRiskScore:
    components = {"road_damage": 21.0, "congestion": 14.2}
    base: dict[str, object] = {
        "road_id": "SEG-27B-014",
        "score": sum(components.values()),
        "band": RiskBand.HIGH,
        "computed_at": NOW,
        "components": components,
        "explanation": ["5 defects, PCI 46/100 (+21.0)", "71% average congestion (+14.2)"],
    }
    base.update(overrides)
    return UrbanRiskScore(**base)  # type: ignore[arg-type]


def test_urban_risk_score_requires_components_to_sum_to_score() -> None:
    with pytest.raises(ValidationError, match="does not match score"):
        _risk_score(score=99.0)


def test_urban_risk_score_tolerates_float_rounding() -> None:
    assert _risk_score(components={"a": 10.001, "b": 10.004}, score=20.005) is not None


def test_urban_risk_score_rejects_an_empty_explanation() -> None:
    with pytest.raises(ValidationError):
        _risk_score(explanation=[])


def test_urban_risk_score_is_bounded_0_to_100() -> None:
    with pytest.raises(ValidationError):
        _risk_score(components={"a": 140.0}, score=140.0)


def test_risk_band_is_a_standalone_scale_from_risk_level() -> None:
    """RiskBand (urban risk index) and RiskLevel (traffic/PCI blend) are
    deliberately different enums — CRITICAL sits at the top of RiskBand,
    SEVERE at the top of RiskLevel, and neither reuses the other's members."""
    assert {band.value for band in RiskBand} == {"LOW", "MODERATE", "HIGH", "CRITICAL"}
    assert _risk_score(band=RiskBand.CRITICAL).band is RiskBand.CRITICAL


def test_infrastructure_recommendation_requires_rationale_and_evidence() -> None:
    base: dict[str, object] = {
        "road_id": "SEG-42A-002",
        "lat": 13.0715,
        "lon": 80.2428,
        "rec_type": RecommendationType.ZEBRA_CROSSING,
        "priority": RiskBand.HIGH,
        "rationale": ["faded zebra crossing"],
        "evidence_event_ids": [uuid4()],
        "detected_at": NOW,
    }
    assert InfrastructureRecommendation(**base) is not None  # type: ignore[arg-type]

    with pytest.raises(ValidationError):
        InfrastructureRecommendation(**{**base, "rationale": []})  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        InfrastructureRecommendation(**{**base, "evidence_event_ids": []})  # type: ignore[arg-type]


def test_near_miss_event_ttc_is_non_negative() -> None:
    base: dict[str, object] = {
        "lat": 13.053,
        "lon": 80.2559,
        "road_id": "SEG-42A-002",
        "ts": NOW,
        "bus_id": "MTC-PERAMBUR-2217",
        "vehicle_track_id": 701,
        "pedestrian_track_id": 702,
        "min_ttc_seconds": 0.8,
        "closing_speed_kmph": 28.0,
        "severity": Severity.MEDIUM,
    }
    assert NearMissEvent(**base).min_ttc_seconds == pytest.approx(0.8)  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        NearMissEvent(**{**base, "min_ttc_seconds": -0.1})  # type: ignore[arg-type]


def test_risk_context_is_a_plain_dataclass_not_a_wire_model() -> None:
    """It never crosses MQTT or HTTP — no pydantic, no frozen=True ceremony."""
    ctx = RiskContext(
        defect_counts={"POTHOLE": 3},
        avg_congestion_pct=42.0,
        pedestrian_density=6.0,
        near_miss_count=1,
        school_zone_distance_m=80.0,
        pci_score=55.0,
        recent_incident_count=0,
    )
    assert ctx.near_miss_count == 1
    assert not hasattr(ctx, "model_dump")
