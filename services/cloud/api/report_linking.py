"""Joining a citizen report to a fused Event. Owned by M5.

Until a report is linked to an event, "your report was fixed" can never fire:
there is nothing whose status could move to tell the citizen anything. Every
report in the database was `SUBMITTED` and every `linked_event_id` was null,
so the timeline the phone drew was decoration.

Linking is AUTOMATIC and by proximity, deliberately. The alternative is an
operator sitting at a desk pressing a button, which means the loop cannot be
walked end to end by one person and in practice never happens at all.

WHAT THIS IS NOT
----------------
It is not fusion. A linked report contributes nothing to
`fused_confidence`, `observation_count` or `distinct_bus_count` — a person is
not a corroborating camera, and letting citizen input move the workflow ladder
would mean anyone with a phone could escalate an event by reporting the same
spot repeatedly. Linking only says "these two records are about the same
pothole"; the event's own evidence is unchanged.
"""

from __future__ import annotations

import logging

from contracts import (
    DetectionClass,
    Event,
    ReportCategory,
    ReportStatus,
    WorkflowStatus,
    haversine_m,
)

log = logging.getLogger("urban-twin.reports.linking")

#: Which fused detection classes a citizen's category can be the same thing as.
#:
#: A person picks from six buttons; a model emits twelve classes. The mapping
#: is written out rather than inferred because the two vocabularies are not
#: the same shape and pretending otherwise is how a "streetlight" report
#: attaches itself to a pothole.
#:
#: A category may map to several classes — "sign or marking" covers signs,
#: dividers and crossings, all of which a camera reports separately — or to
#: none, which is not a failure. STREETLIGHT and GARBAGE are real municipal
#: problems that the bus cameras do not detect at all, so those reports
#: legitimately stand alone in the backlog forever.
CATEGORY_TO_CLASSES: dict[ReportCategory, tuple[DetectionClass, ...]] = {
    ReportCategory.POTHOLE: (DetectionClass.POTHOLE,),
    ReportCategory.WATERLOGGING: (DetectionClass.WATERLOGGING,),
    ReportCategory.DAMAGED_SIGN: (
        DetectionClass.DAMAGED_SIGN,
        DetectionClass.DAMAGED_DIVIDER,
        DetectionClass.ZEBRA_CROSSING,
    ),
    #: no camera class — the fleet does not look at streetlights
    ReportCategory.STREETLIGHT: (),
    #: no camera class — nor at refuse
    ReportCategory.GARBAGE: (),
    #: deliberately unmapped: "something else" means the reporter could not
    #: say what it was, so guessing a class for them would be inventing intent
    ReportCategory.OTHER: (),
}


def find_matching_event(
    *,
    category: ReportCategory,
    lat: float,
    lon: float,
    events: list[Event],
    radius_m: float,
) -> Event | None:
    """The nearest compatible event within `radius_m`, or None.

    Nearest rather than first: two potholes can both be in range on a wide
    junction, and attaching the report to whichever happened to be earlier in
    the list would be arbitrary in a way the citizen would eventually notice.

    Distance is `contracts.haversine_m` — the same function the fusion engine
    and the hub already use. A second distance implementation is a second
    place for the earth's radius to be wrong.
    """
    classes = CATEGORY_TO_CLASSES.get(category, ())
    if not classes:
        return None

    wanted = set(classes)
    best: Event | None = None
    best_distance = radius_m

    for event in events:
        if event.detection_class not in wanted:
            continue
        distance = haversine_m(lat, lon, event.lat, event.lon)
        if distance <= best_distance:
            best, best_distance = event, distance

    if best is not None:
        log.info(
            "linked a %s report to event %s (%.0f m away, class %s)",
            category,
            best.event_id,
            best_distance,
            best.detection_class,
        )
    return best


#: What a linked event's status means for the citizen who reported it.
#:
#: The two ladders stay separate — `WorkflowStatus` describes machine
#: corroboration and municipal workflow, `ReportStatus` describes what a
#: person should be told — and this is the ONE place they meet. Without it
#: every rung below SUBMITTED was unreachable and the phone's timeline was
#: decoration.
#:
#: Note what is deliberately absent: DETECTED and AI_VERIFIED. An event that
#: has not yet reached AUTHORITY_NOTIFIED is unreviewed machine output, and
#: telling a citizen "the city has seen your report" on the strength of it
#: would be a claim nobody has made. A report linked to an event still at
#: those rungs stays LINKED until a human is involved.
EVENT_STATUS_TO_REPORT_STATUS: dict[WorkflowStatus, ReportStatus] = {
    WorkflowStatus.AUTHORITY_NOTIFIED: ReportStatus.ACKNOWLEDGED,
    WorkflowStatus.INSPECTION: ReportStatus.IN_PROGRESS,
    WorkflowStatus.MAINTENANCE_ASSIGNED: ReportStatus.IN_PROGRESS,
    # Repaired but not yet re-scanned by a bus. Still "being fixed" to the
    # citizen: the crew has claimed it, the fleet has not confirmed it.
    WorkflowStatus.REPAIR_COMPLETED: ReportStatus.IN_PROGRESS,
    WorkflowStatus.VERIFIED: ReportStatus.RESOLVED,
    WorkflowStatus.RESOLVED: ReportStatus.RESOLVED,
    WorkflowStatus.REJECTED: ReportStatus.REJECTED,
}

#: Report rungs that are over. A report must never move off one of these
#: because its event moved again — a citizen told "fixed" and then "being
#: fixed" a minute later has learned only that the app is unreliable.
_TERMINAL: frozenset[ReportStatus] = frozenset({ReportStatus.RESOLVED, ReportStatus.REJECTED})


def report_status_for(event_status: WorkflowStatus, current: ReportStatus) -> ReportStatus | None:
    """The report status implied by an event status, or None to leave it be.

    Returns None when nothing should change: the event is at a rung with no
    citizen meaning, the report is already there, or the report has already
    finished and must not be walked backwards.
    """
    if current in _TERMINAL:
        return None

    target = EVENT_STATUS_TO_REPORT_STATUS.get(event_status)
    if target is None or target is current:
        return None
    return target
