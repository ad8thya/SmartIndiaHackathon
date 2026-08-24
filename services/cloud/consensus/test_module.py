"""M3 fusion module tests.

Fusion is the credibility story of the whole project, so these tests are the
strictest in the repo. The escalation ladder in particular is a promise made to
a municipal corporation — it must not drift.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from contracts import (
    FUSABLE_CLASSES,
    INFRASTRUCTURE_CLASSES,
    SEVERITY_ORDER,
    DetectionClass,
    Event,
    EventFuser,
    Observation,
    Severity,
    WorkflowStatus,
    fuse_confidence,
)

from services.cloud.consensus import MockEventFuser, get_event_fuser

NOW = datetime.now(tz=UTC)
SPOT = (13.0067, 80.2570)


@pytest.fixture
def fuser() -> EventFuser:
    return get_event_fuser()


def obs(
    bus: str = "MTC-ADYAR-1042",
    lat: float = SPOT[0],
    lon: float = SPOT[1],
    confidence: float = 0.8,
    detection_class: DetectionClass = DetectionClass.POTHOLE,
    severity: Severity | None = Severity.MEDIUM,
    ts: datetime | None = None,
    evidence: str | None = None,
) -> Observation:
    return Observation(
        obs_id=uuid4(),
        bus_id=bus,
        route_id="27B",
        ts=ts or NOW,
        lat=lat,
        lon=lon,
        gps_accuracy_m=4.0,
        heading_deg=180.0,
        speed_kmph=24.0,
        detection_class=detection_class,
        raw_confidence=confidence,
        severity=severity,
        evidence_uri=evidence,
    )


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_satisfies_the_protocol(fuser: EventFuser) -> None:
    assert isinstance(fuser, EventFuser)


def test_default_env_gives_the_grid_fuser(fuser: EventFuser) -> None:
    assert isinstance(fuser, MockEventFuser)


def test_empty_input_gives_empty_output(fuser: EventFuser) -> None:
    assert fuser.fuse([]) == []


def test_returns_events(fuser: EventFuser) -> None:
    events = fuser.fuse([obs(), obs(bus="MTC-TNAGAR-1875")])
    assert all(isinstance(event, Event) for event in events)


# ── clustering ──────────────────────────────────────────────────────────────
def test_nearby_same_class_observations_become_one_event(fuser: EventFuser) -> None:
    events = fuser.fuse([obs(), obs(bus="MTC-TNAGAR-1875"), obs(bus="MTC-BROADWAY-5090")])
    assert len(events) == 1
    assert events[0].observation_count == 3
    assert events[0].distinct_bus_count == 3


def test_distant_observations_stay_separate(fuser: EventFuser) -> None:
    far = fuser.fuse([obs(), obs(lat=SPOT[0] + 0.05, bus="MTC-TNAGAR-1875")])
    assert len(far) == 2


def test_different_classes_never_fuse(fuser: EventFuser) -> None:
    """A pothole and a faded zebra crossing at the same spot are two problems."""
    events = fuser.fuse(
        [
            obs(detection_class=DetectionClass.POTHOLE),
            obs(detection_class=DetectionClass.FADED_ZEBRA, severity=Severity.SMALL),
        ]
    )
    assert len(events) == 2
    assert {event.detection_class for event in events} == {
        DetectionClass.POTHOLE,
        DetectionClass.FADED_ZEBRA,
    }


def test_repeat_sightings_from_one_bus_count_once_per_bus(fuser: EventFuser) -> None:
    """A dirty lens repeats. It does not corroborate."""
    events = fuser.fuse([obs() for _ in range(8)])
    assert events[0].observation_count == 8
    assert events[0].distinct_bus_count == 1


# ── what may become an Event at all ─────────────────────────────────────────
def test_plain_presence_never_becomes_an_event(fuser: EventFuser) -> None:
    """A pedestrian is not a backlog item.

    Fusing plain PEDESTRIAN/VEHICLE sightings gave crews work orders with a
    30-day SLA for a person walking, and buried the real defects in the
    operator's list. See contracts.FUSABLE_CLASSES.
    """
    noise = [
        obs(detection_class=DetectionClass.PEDESTRIAN, severity=None),
        obs(detection_class=DetectionClass.VEHICLE, severity=None, lat=13.1),
    ]
    assert fuser.fuse(noise) == []


def test_fusable_classes_do_become_events(fuser: EventFuser) -> None:
    for index, detection_class in enumerate(sorted(FUSABLE_CLASSES)):
        severity = Severity.MEDIUM if detection_class in INFRASTRUCTURE_CLASSES else None
        events = fuser.fuse(
            [obs(detection_class=detection_class, severity=severity, lat=13.0 + index * 0.01)]
        )
        assert events, f"{detection_class} should be fusable but produced no event"
        assert events[0].severity is not None


def test_noise_does_not_dilute_a_real_defect(fuser: EventFuser) -> None:
    """The pothole must survive being surrounded by pedestrians at the same spot."""
    batch = [obs(confidence=0.9)] + [
        obs(detection_class=DetectionClass.PEDESTRIAN, severity=None) for _ in range(20)
    ]
    events = fuser.fuse(batch)
    assert len(events) == 1
    assert events[0].detection_class is DetectionClass.POTHOLE
    assert events[0].observation_count == 1


# ── severity is never fabricated ────────────────────────────────────────────
def test_worst_severity_returns_none_rather_than_inventing_one() -> None:
    assert MockEventFuser._worst_severity([]) is None


def test_safety_classes_get_an_explicit_policy_severity(fuser: EventFuser) -> None:
    """A hit-and-run must not render as a SMALL blue dot beside a hairline crack."""
    collision = fuser.fuse(
        [obs(detection_class=DetectionClass.COLLISION, severity=None, lat=13.30)]
    )[0]
    risk = fuser.fuse(
        [obs(detection_class=DetectionClass.PEDESTRIAN_RISK, severity=None, lat=13.40)]
    )[0]
    assert collision.severity is Severity.LARGE
    assert risk.severity is Severity.MEDIUM
    assert SEVERITY_ORDER[collision.severity] > SEVERITY_ORDER[risk.severity]


def test_an_infrastructure_class_without_severity_raises(fuser: EventFuser) -> None:
    """Impossible via the validator — so if it happens, fail loudly."""
    with pytest.raises(ValueError, match="no severity"):
        MockEventFuser._policy_severity(DetectionClass.POTHOLE)


# ── confidence and the escalation ladder ────────────────────────────────────
def test_confidence_uses_the_shared_noisy_or(fuser: EventFuser) -> None:
    events = fuser.fuse([obs(confidence=0.6), obs(bus="MTC-TNAGAR-1875", confidence=0.6)])
    assert events[0].fused_confidence == pytest.approx(fuse_confidence([0.6, 0.6]), abs=1e-4)


def test_corroboration_beats_a_single_confident_look(fuser: EventFuser) -> None:
    """Two independent 0.6 sightings are *weaker* numerically than one 0.85
    look — 0.84 vs 0.85 — but they carry a second bus, and it is the bus count
    that unlocks escalation. This asymmetry is the point of the ladder."""
    alone = fuser.fuse([obs(confidence=0.85)])[0]
    together = fuser.fuse([obs(confidence=0.6), obs(bus="MTC-TNAGAR-1875", confidence=0.6)])[0]
    assert together.distinct_bus_count > alone.distinct_bus_count
    assert together.status is WorkflowStatus.AI_VERIFIED
    # and each extra look does raise the number
    assert together.fused_confidence > fuser.fuse([obs(confidence=0.6)])[0].fused_confidence


def test_three_confident_buses_notify_the_authority(fuser: EventFuser) -> None:
    events = fuser.fuse(
        [
            obs(bus="MTC-ADYAR-1042", confidence=0.9),
            obs(bus="MTC-TNAGAR-1875", confidence=0.9),
            obs(bus="MTC-BROADWAY-5090", confidence=0.9),
        ]
    )
    assert events[0].distinct_bus_count == 3
    assert events[0].status is WorkflowStatus.AUTHORITY_NOTIFIED


def test_two_buses_reach_ai_verified(fuser: EventFuser) -> None:
    events = fuser.fuse([obs(confidence=0.5), obs(bus="MTC-TNAGAR-1875", confidence=0.5)])
    assert events[0].status is WorkflowStatus.AI_VERIFIED


def test_one_weak_look_stays_merely_detected(fuser: EventFuser) -> None:
    events = fuser.fuse([obs(confidence=0.5)])
    assert events[0].status is WorkflowStatus.DETECTED


def test_very_weak_clusters_are_dropped(fuser: EventFuser) -> None:
    assert fuser.fuse([obs(confidence=0.2)]) == []


# ── severity, SLA, geometry ─────────────────────────────────────────────────
def test_worst_severity_wins(fuser: EventFuser) -> None:
    """One LARGE among three SMALLs still sends a crew for a LARGE."""
    events = fuser.fuse(
        [
            obs(severity=Severity.SMALL),
            obs(bus="MTC-TNAGAR-1875", severity=Severity.SMALL),
            obs(bus="MTC-BROADWAY-5090", severity=Severity.LARGE),
        ]
    )
    assert events[0].severity is Severity.LARGE


def test_sla_is_tighter_for_worse_defects(fuser: EventFuser) -> None:
    large = fuser.fuse(
        [obs(severity=Severity.LARGE), obs(bus="MTC-TNAGAR-1875", severity=Severity.LARGE)]
    )[0]
    small = fuser.fuse(
        [
            obs(lat=13.5, severity=Severity.SMALL),
            obs(lat=13.5, bus="MTC-TNAGAR-1875", severity=Severity.SMALL),
        ]
    )[0]
    assert large.sla_due is not None and small.sla_due is not None
    assert large.sla_due - large.last_seen < small.sla_due - small.last_seen


def test_event_sits_between_its_observations(fuser: EventFuser) -> None:
    events = fuser.fuse(
        [
            obs(lat=SPOT[0], lon=SPOT[1]),
            obs(bus="MTC-TNAGAR-1875", lat=SPOT[0] + 0.0001, lon=SPOT[1] + 0.0001),
        ]
    )
    assert SPOT[0] <= events[0].lat <= SPOT[0] + 0.0002


def test_time_window_spans_the_cluster(fuser: EventFuser) -> None:
    early, late = NOW - timedelta(days=2), NOW
    events = fuser.fuse([obs(ts=early), obs(bus="MTC-TNAGAR-1875", ts=late)])
    assert events[0].first_seen == early
    assert events[0].last_seen == late


def test_events_carry_their_evidence(fuser: EventFuser) -> None:
    events = fuser.fuse(
        [obs(evidence="s3://a.jpg"), obs(bus="MTC-TNAGAR-1875", evidence="s3://b.jpg")]
    )
    assert set(events[0].evidence_uris) == {"s3://a.jpg", "s3://b.jpg"}


def test_events_are_snapped_to_a_road_segment(fuser: EventFuser) -> None:
    events = fuser.fuse([obs(), obs(bus="MTC-TNAGAR-1875")])
    assert events[0].road_segment_id is not None
    assert events[0].road_segment_id.startswith("SEG-")


# ── stability, which the map depends on ─────────────────────────────────────
def test_event_ids_are_stable_across_runs(fuser: EventFuser) -> None:
    """Otherwise the map deletes and re-creates every pin on every poll."""
    batch = [obs(), obs(bus="MTC-TNAGAR-1875")]
    assert fuser.fuse(batch)[0].event_id == fuser.fuse(batch)[0].event_id


def test_worst_events_come_first(fuser: EventFuser) -> None:
    events = fuser.fuse(
        [
            obs(lat=13.10, severity=Severity.SMALL),
            obs(lat=13.10, bus="MTC-TNAGAR-1875", severity=Severity.SMALL),
            obs(lat=13.20, severity=Severity.LARGE),
            obs(lat=13.20, bus="MTC-TNAGAR-1875", severity=Severity.LARGE),
        ]
    )
    assert events[0].severity is Severity.LARGE


def test_safety_classes_cluster_more_tightly(fuser: EventFuser) -> None:
    """Two people 20 m apart are two people, not one pedestrian event."""
    pedestrians = fuser.fuse(
        [
            obs(detection_class=DetectionClass.PEDESTRIAN_RISK, severity=None, confidence=0.9),
            obs(
                detection_class=DetectionClass.PEDESTRIAN_RISK,
                severity=None,
                confidence=0.9,
                bus="MTC-TNAGAR-1875",
                lat=SPOT[0] + 0.00018,
            ),
        ]
    )
    assert len(pedestrians) == 2
