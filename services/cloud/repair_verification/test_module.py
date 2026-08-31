"""Repair verification: the absence rule.

The interesting half is the DECAY path. A rule that only ever takes the happy
path is not a rule — if the threshold is the only thing tested, a bug that
closes on the first clean pass passes every test.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from contracts import DetectionClass, Event, Observation, Severity, WorkflowStatus

from services.cloud.repair_verification import RepairVerifier, decayed, is_verified
from services.cloud.repair_verification.policy import VerificationProgress

NOW = datetime.now(tz=UTC)
LAT, LON = 13.0067, 80.2570


class FakeBus:
    """Just enough of a BusPosition for the tracker.

    `route_id` and `progress` are the fields that matter now: a pass is a bus
    entering the stretch of its route that holds the defect, not a bus coming
    within N metres of a point. SEG-27B-000 is the first of 27B's five
    segments, so it occupies progress 0.0-0.2.
    """

    def __init__(self, *, progress: float, route_id: str = "27B", lat: float = LAT,
                 lon: float = LON) -> None:
        self.lat, self.lon = lat, lon
        self.route_id, self.progress = route_id, progress


#: inside / outside SEG-27B-000's band
ON_THE_DEFECT = 0.1
ELSEWHERE = 0.6


def repaired_event() -> Event:
    return Event(
        event_id=uuid4(),
        lat=LAT,
        lon=LON,
        road_segment_id="SEG-27B-000",
        detection_class=DetectionClass.POTHOLE,
        severity=Severity.LARGE,
        fused_confidence=0.9,
        observation_count=4,
        distinct_bus_count=3,
        first_seen=NOW,
        last_seen=NOW,
        status=WorkflowStatus.REPAIR_COMPLETED,
    )


def verifier(**overrides: object) -> RepairVerifier:
    kwargs = dict(passes=3, min_buses=2, radius_m=40.0, decay=0.7, stall_hours=6.0)
    kwargs.update(overrides)
    return RepairVerifier(**kwargs)  # type: ignore[arg-type]


def drive_past(v: RepairVerifier, event: Event, bus: str, *, observations=None, now=None):
    """One bus drives onto the defect's stretch of road, then off it again."""
    changed = v.observe(
        events=[event],
        bus_positions={bus: FakeBus(progress=ON_THE_DEFECT)},
        recent_observations=observations or [],
        now=now or NOW,
    )
    v.observe(
        events=[event],
        bus_positions={bus: FakeBus(progress=ELSEWHERE)},
        recent_observations=[],
        now=now or NOW,
    )
    return changed


# ── the decay path — below threshold, nothing closes ────────────────────────


def test_one_clean_pass_decays_confidence_and_closes_nothing() -> None:
    """A single bus not seeing a pothole means nothing on its own: a puddle, a
    lorry, a bad frame, or a lens with dirt on it."""
    v, event = verifier(), repaired_event()

    changed = drive_past(v, event, "MTC-A-0001")

    assert len(changed) == 1
    _, progress, verified = changed[0]
    assert verified is False, "one pass must not close a work order"
    assert progress.clean_passes == 1
    assert progress.confidence < event.fused_confidence, "confidence must decay"


def test_confidence_decays_monotonically_and_never_reaches_zero() -> None:
    """Evidence of absence lowers belief; it is never proof."""
    confidence, seen = 0.9, []
    for _ in range(20):
        confidence = decayed(confidence, 0.7)
        seen.append(confidence)

    assert seen == sorted(seen, reverse=True), "must fall on every pass"
    assert seen[-1] > 0.0, "must never reach zero — absence is not proof"


def test_the_same_bus_three_times_does_not_verify() -> None:
    """THE point of counting distinct buses. A covered lens reports clean
    forever, and this system models exactly that state on the driver's own
    camera screen."""
    v, event = verifier(), repaired_event()

    for _ in range(5):
        drive_past(v, event, "MTC-DIRTY-LENS-0001")

    progress = v.progress_for(event.event_id.hex)
    assert progress is not None
    assert progress.clean_passes >= 3, "it did accumulate passes"
    assert not is_verified(progress, passes=3, min_buses=2), "but one bus is not corroboration"


def test_a_stationary_bus_cannot_satisfy_the_threshold_alone() -> None:
    """Only the entering edge is a pass. A bus stuck in traffic on top of a
    pothole is one look at it, not forty."""
    v, event = verifier(), repaired_event()

    for _ in range(40):
        v.observe(
            events=[event],
            bus_positions={"MTC-STUCK-0001": FakeBus(progress=ON_THE_DEFECT)},
            recent_observations=[],
            now=NOW,
        )

    progress = v.progress_for(event.event_id.hex)
    assert progress is not None
    assert progress.clean_passes == 1


# ── the close path ─────────────────────────────────────────────────────────


def test_three_clean_passes_from_two_buses_verifies() -> None:
    v, event = verifier(), repaired_event()

    drive_past(v, event, "MTC-A-0001")
    drive_past(v, event, "MTC-A-0001")
    changed = drive_past(v, event, "MTC-B-0002")

    _, progress, verified = changed[-1]
    assert verified is True
    assert progress.clean_passes == 3
    assert progress.distinct_clean_buses == 2


# ── the dirty path ─────────────────────────────────────────────────────────


def test_seeing_the_defect_again_resets_the_count() -> None:
    """The repair did not hold. Corroboration starts over."""
    v, event = verifier(), repaired_event()

    drive_past(v, event, "MTC-A-0001")
    drive_past(v, event, "MTC-B-0002")

    still_there = Observation(
        obs_id=uuid4(),
        bus_id="MTC-C-0003",
        route_id="27B",
        ts=NOW + timedelta(minutes=5),
        lat=LAT,
        lon=LON,
        gps_accuracy_m=4.0,
        heading_deg=90.0,
        speed_kmph=20.0,
        detection_class=DetectionClass.POTHOLE,
        raw_confidence=0.88,
        severity=Severity.LARGE,
    )
    # ONE bus re-detecting is not enough — the same standard both ways.
    only_one = drive_past(v, event, "MTC-C-0003", observations=[still_there])
    assert only_one[-1][1].dirty_passes == 0, "one sighting must not reset a repair"

    second_sighting = still_there.model_copy(update={"obs_id": uuid4(), "bus_id": "MTC-D-0004"})
    changed = drive_past(
        v, event, "MTC-D-0004", observations=[still_there, second_sighting]
    )

    _, progress, verified = changed[-1]
    assert verified is False
    assert progress.dirty_passes == 1
    assert progress.clean_passes == 0, "a dirty pass resets corroboration"


# ── the stall path ─────────────────────────────────────────────────────────


def test_a_road_no_bus_drives_is_reported_as_stalled() -> None:
    """Otherwise this is 'awaiting next pass' with no end, one level along."""
    v, event = verifier(stall_hours=6.0), repaired_event()
    v.observe(events=[event], bus_positions={}, recent_observations=[], now=NOW)

    progress = v.progress_for(event.event_id.hex)
    assert progress is not None
    assert not v.is_stalled(progress, NOW)
    assert v.is_stalled(progress, NOW + timedelta(hours=7))


def test_a_single_bus_route_is_reported_as_unverifiable() -> None:
    """On this network there is ONE BUS PER ROUTE and only 6 of 26 segments are
    within reach of a second route. Counting toward a total that cannot be
    reached is the same dead end as an endless wait."""
    v, event = verifier(min_buses=2), repaired_event()
    drive_past(v, event, "MTC-ONLY-0001")

    progress = v.progress_for(event.event_id.hex)
    assert progress is not None
    assert not v.can_ever_verify(progress), "one bus cannot satisfy a two-bus rule"


def test_leaving_the_pending_rung_forgets_progress() -> None:
    """A re-opened defect starts its corroboration again rather than
    inheriting stale credit."""
    v, event = verifier(), repaired_event()
    drive_past(v, event, "MTC-A-0001")
    assert v.progress_for(event.event_id.hex) is not None

    reopened = event.model_copy(update={"status": WorkflowStatus.INSPECTION})
    v.observe(events=[reopened], bus_positions={}, recent_observations=[], now=NOW)
    assert v.progress_for(event.event_id.hex) is None


def test_progress_reports_what_a_crew_needs_to_read() -> None:
    progress = VerificationProgress(event_id="x", road_segment_id="SEG-27B-000")
    progress.clean_by_bus = {"a": 2, "b": 1}
    assert progress.clean_passes == 3
    assert progress.distinct_clean_buses == 2


# ── the pass test itself ───────────────────────────────────────────────────
# Point-proximity was the first attempt and it never fired once: the replay
# ticks once a second at 60x, so a bus covers ~500 m between samples and
# teleports over a 40 m radius. Against real telemetry the closest any bus came
# to a repaired defect was 111 m.


def test_bands_are_looked_up_by_place_not_by_route() -> None:
    """Three routes run over EVR Periyar Salai and the network models them as
    three segments 0 m apart. Taking only the event's own segment made
    cross-route corroboration impossible on exactly the six segments where a
    second bus exists."""
    from services.cloud.repair_verification.tracker import progress_bands

    # Anchored on the SEGMENT, not the event. An event is assigned to a
    # segment by road, not by distance to its midpoint: one observed defect
    # sat 800 m from its own segment's centre, which is ordinary for a segment
    # kilometres long. Searching around the event found only its own route and
    # silently restored the per-route behaviour — 19 clean passes, one bus,
    # forever. These coordinates are that real event's.
    bands = progress_bands("SEG-27B-003", 13.07347, 80.26117, 40.0)
    routes = {route for route, _, _ in bands}
    assert routes == {"27B", "570", "M1"}, f"expected three routes over this road, got {routes}"

    # A segment with no co-located twin gets exactly one band.
    solo = progress_bands("SEG-51C-000", 12.99485, 80.2582, 40.0)
    assert {route for route, _, _ in solo} == {"51C"}


def test_a_segment_maps_to_a_band_a_bus_cannot_jump_over() -> None:
    from services.cloud.repair_verification.tracker import progress_band

    assert progress_band("SEG-M1-000") == ("M1", 0.0, 0.2)
    assert progress_band("SEG-M1-002") == ("M1", 0.4, 0.6)
    assert progress_band("SEG-27B-004") == ("27B", 0.8, 1.0)
    # Unknown or absent falls back to the radius test.
    assert progress_band("SEG-NOWHERE-9") is None
    assert progress_band(None) is None


def test_a_bus_on_another_route_is_not_a_pass() -> None:
    """Being at progress 0.1 of a different route is not being on this road."""
    v, event = verifier(), repaired_event()

    v.observe(
        events=[event],
        bus_positions={"MTC-OTHER-0001": FakeBus(progress=ON_THE_DEFECT, route_id="42A")},
        recent_observations=[],
        now=NOW,
    )

    progress = v.progress_for(event.event_id.hex)
    assert progress is not None
    assert progress.clean_passes == 0


def test_a_fast_bus_still_registers_the_pass() -> None:
    """The whole reason for the band. A bus that jumps 0.0 -> 0.1 -> 0.6 in
    three coarse samples has still driven the road, and a radius test on those
    samples would have missed it entirely."""
    v, event = verifier(), repaired_event()

    for progress in (0.0, 0.1, 0.6):
        v.observe(
            events=[event],
            bus_positions={"MTC-FAST-0001": FakeBus(progress=progress)},
            recent_observations=[],
            now=NOW,
        )

    tracked = v.progress_for(event.event_id.hex)
    assert tracked is not None
    assert tracked.clean_passes == 1


def test_evidence_that_predates_the_repair_does_not_contradict_it() -> None:
    """The clock trap, pinned.

    Under replay the simulated clock runs hours ahead of wall time, so a
    sighting recorded BEFORE a repair still has a `ts` in the wall-clock
    future. Comparing against `datetime.now()` made every pre-repair
    observation look like the defect being seen again, and the loop could
    never close. The watermark is read from the observation stream itself, so
    both sides use the same clock whatever that clock is doing.
    """
    v, event = verifier(), repaired_event()

    # Two sightings on a clock running an hour ahead of wall time — but they
    # are already in the buffer when tracking starts, so they are history.
    ahead = NOW + timedelta(hours=1)
    old = [
        Observation(
            obs_id=uuid4(),
            bus_id=bus,
            route_id="27B",
            ts=ahead,
            lat=LAT,
            lon=LON,
            gps_accuracy_m=4.0,
            heading_deg=90.0,
            speed_kmph=20.0,
            detection_class=DetectionClass.POTHOLE,
            raw_confidence=0.9,
            severity=Severity.LARGE,
        )
        for bus in ("MTC-A-0001", "MTC-B-0002")
    ]

    # First sweep sets the watermark from those very observations.
    v.observe(events=[event], bus_positions={}, recent_observations=old, now=NOW)
    changed = drive_past(v, event, "MTC-C-0003", observations=old)

    _, progress, _ = changed[-1]
    assert progress.dirty_passes == 0, "evidence older than the repair must not contradict it"
    assert progress.clean_passes == 1
