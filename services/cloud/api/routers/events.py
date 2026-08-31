"""Events: the fused, human-facing backlog. Owned by M5.

Reads prefer postgres and fall back to the in-memory cache when the database is
unavailable, because a demo that shows an empty map because a container is
still starting is a demo that failed.
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from contracts import DetectionClass, Event, Severity, WorkflowStatus, WSMessageType
from db import Event as EventRow
from db import session_scope, to_lonlat
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import Bus, Settings, State
from ..hub import LiveState
from ..media import resolve_photo, store_photo
from ..projection import is_public, project_event

log = logging.getLogger("urban-twin.events")
router = APIRouter(prefix="/api", tags=["events"])


class StatusPatch(BaseModel):
    """PATCH /api/events/{id}/status body."""

    status: WorkflowStatus
    assigned_team: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "status": "MAINTENANCE_ASSIGNED",
                    "assigned_team": "GCC-Zone-13-Adyar",
                    "notes": "Cold-mix patch scheduled for tomorrow 06:00.",
                }
            ]
        }
    }


class EvidencePost(BaseModel):
    """POST /api/events/{id}/evidence body — what a crew adds from the street.

    Deliberately not part of StatusPatch. Adding a photo is not the same act as
    moving the workflow: a crew photographs what they found *before* deciding
    whether it is an inspection or a repair, and coupling the two would mean
    either uploading nothing until they commit to a status, or advancing the
    status just to attach a picture.
    """

    #: ``data:image/jpeg;base64,...``. Decoded to a file; only the path is kept.
    photo: str | None = Field(default=None, description="base64 data URI, jpeg/png/webp")
    note: str | None = Field(default=None, max_length=2000)
    #: Which crew is claiming this. No auth exists to derive it — see
    #: apps/mobile/src/lib/crew.ts's MY_TEAM.
    team: str | None = Field(default=None, max_length=64)

    model_config = {
        "extra": "forbid",
        "json_schema_extra": {
            "examples": [
                {
                    "photo": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
                    "note": "Water pooling at the kerb; patched and compacted.",
                    "team": "GCC-Zone-13-Adyar",
                }
            ]
        },
    }


def _row_to_event(row: EventRow) -> Event:
    lon, lat = to_lonlat(row.geom)
    return Event(
        event_id=row.event_id,
        lat=lat,
        lon=lon,
        road_segment_id=row.road_segment_id,
        detection_class=DetectionClass(row.detection_class),
        severity=Severity(row.severity),
        fused_confidence=row.fused_confidence,
        observation_count=row.observation_count,
        distinct_bus_count=row.distinct_bus_count,
        first_seen=row.first_seen,
        last_seen=row.last_seen,
        status=WorkflowStatus(row.status),
        assigned_team=row.assigned_team,
        sla_due=row.sla_due,
        evidence_uris=list(row.evidence_uris or []),
    )


async def _load_events() -> tuple[list[Event], str]:
    """Return (events, source). Source is 'postgres' or 'memory'.

    Rows are validated one at a time and a bad one is skipped, not fatal.
    Building the list in a comprehension meant a single row that failed an
    Event validator — a `last_seen` earlier than its `first_seen`, which the
    seeder can produce — raised out of the whole read and dropped the operator
    to the in-memory cache. On a fresh process that cache is empty, so one
    malformed row emptied the entire backlog while the database was healthy.
    A skipped row is a warning and a gap; a swallowed exception is a blank
    console.
    """
    try:
        async with session_scope() as session:
            rows = (await session.execute(select(EventRow))).scalars().all()
    except Exception as exc:
        log.warning("event read fell back to memory: %s", exc)
        from ..hub import state as live

        return live.event_list(), "memory"

    events: list[Event] = []
    skipped = 0
    for row in rows:
        try:
            events.append(_row_to_event(row))
        except Exception as exc:
            skipped += 1
            log.warning("skipping unreadable event %s: %s", row.event_id, exc)
    if skipped:
        log.warning("%d event row(s) failed validation and were skipped", skipped)
    return events, "postgres"


async def merged_events(state: LiveState) -> list[Event]:
    """Every event the system knows about: postgres, plus anything fused since
    the last flush.

    THE one definition of "all events". Every endpoint that counts, filters or
    lists events must go through here — `/api/events` and the KPI strip read
    different sources once, and the top bar quietly disagreed with the panel
    underneath it for the whole of a demo.
    """
    events, source = await _load_events()
    if source == "postgres":
        known = {event.event_id for event in events}
        events.extend(event for event in state.event_list() if event.event_id not in known)
    return events


@router.get("/events", response_model=list[Event], summary="Filtered event list")
async def list_events(
    state: State,
    status: list[WorkflowStatus] | None = Query(default=None),
    detection_class: list[DetectionClass] | None = Query(default=None, alias="class"),
    bbox: str | None = Query(
        default=None, description="minLon,minLat,maxLon,maxLat — the map viewport"
    ),
    since: datetime | None = Query(default=None, description="last_seen newer than this"),
    min_confidence: float = Query(default=0.0, ge=0.0, le=1.0),
    limit: int = Query(default=500, ge=1, le=5000),
) -> list[Event]:
    events = await merged_events(state)

    if status:
        wanted = set(status)
        events = [event for event in events if event.status in wanted]
    if detection_class:
        classes = set(detection_class)
        events = [event for event in events if event.detection_class in classes]
    if since is not None:
        events = [event for event in events if event.last_seen >= since]
    if min_confidence > 0.0:
        events = [event for event in events if event.fused_confidence >= min_confidence]
    if bbox:
        events = _filter_bbox(events, bbox)

    events.sort(key=lambda event: event.last_seen, reverse=True)
    return events[:limit]


def _filter_bbox(events: list[Event], bbox: str) -> list[Event]:
    try:
        min_lon, min_lat, max_lon, max_lat = (float(part) for part in bbox.split(","))
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="bbox must be 'minLon,minLat,maxLon,maxLat'"
        ) from exc
    return [
        event
        for event in events
        if min_lon <= event.lon <= max_lon and min_lat <= event.lat <= max_lat
    ]


@router.get(
    "/events/public",
    summary="The citizen dataset — public rungs only, operator fields removed",
    response_model=None,
)
async def list_public_events(
    state: State,
    bbox: str | None = Query(default=None, description="minLon,minLat,maxLon,maxLat"),
    since: datetime | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
) -> list[dict[str, object]]:
    """Events as a member of the public may receive them.

    A SEPARATE ROUTE, not a flag on `/api/events`, because the response shape
    genuinely differs — six fields are absent — and a parameter that silently
    changes the shape of a response is how a client ends up reading a key that
    is sometimes there.

    `response_model=None` is deliberate: typing this as `list[Event]` would
    make FastAPI re-serialise the full model and put the removed fields back.
    The projection in `projection.py` is the contract for this route.

    No `min_confidence` parameter either — filtering on a number the caller is
    not allowed to see would be a way of asking for it one bisection at a time.
    """
    events = [event for event in await merged_events(state) if is_public(event)]

    if since is not None:
        events = [event for event in events if event.last_seen >= since]
    if bbox:
        events = _filter_bbox(events, bbox)

    events.sort(key=lambda event: event.last_seen, reverse=True)
    return [project_event(event) for event in events[:limit]]


# Declared BEFORE /events/{event_id} — otherwise the uuid route matches
# "photos" first and every image request 422s on the path parameter. Starlette
# resolves in registration order, so this ordering is load-bearing.
@router.get("/events/photos/{filename}", include_in_schema=False)
async def get_event_photo(filename: str, settings: Settings) -> FileResponse:
    """Serve a crew-uploaded photo. Traversal is refused in `media.py`."""
    return FileResponse(resolve_photo(settings.MEDIA_DIR, "events", filename))


@router.get("/events/{event_id}", response_model=Event, summary="One event")
# TODO (M5): behaviour is correct, but this hand-rolls the memory-then-postgres
# lookup instead of calling merged_events(). Cosmetic — fold it in when you next
# touch this file so there is exactly one merge path.
async def get_event(event_id: UUID, state: State) -> Event:
    cached = state.events.get(event_id)
    if cached is not None:
        return cached
    events, _ = await _load_events()
    for event in events:
        if event.event_id == event_id:
            return event
    raise HTTPException(status_code=404, detail=f"no event {event_id}")


@router.patch(
    "/events/{event_id}/status",
    response_model=Event,
    summary="Advance an event through the workflow",
)
async def patch_status(event_id: UUID, patch: StatusPatch, state: State, broadcaster: Bus) -> Event:
    """The write path a human drives. See `apply_status_change` for the shared
    core — the repair verifier drives the same one."""
    return await apply_status_change(
        event_id=event_id,
        status=patch.status,
        state=state,
        broadcaster=broadcaster,
        assigned_team=patch.assigned_team,
        notes=patch.notes,
    )


async def apply_status_change(
    *,
    event_id: UUID,
    status: WorkflowStatus,
    state: LiveState,
    broadcaster: object,
    assigned_team: str | None = None,
    notes: str | None = None,
) -> Event:
    """Move an event along the workflow ladder, from wherever the decision came.

    ONE path for every status change, deliberately. An operator's PATCH and the
    repair verifier's auto-close go through here identically, which is what
    guarantees the auto-close also broadcasts, also writes a work-order note,
    and — the part that would silently rot otherwise — also advances the
    citizen report linked to this event. A second write path would eventually
    forget one of those three.
    """
    event = await get_event(event_id, state)

    # last_seen deliberately untouched: it means "when the fleet last SAW this
    # thing", which is sensor data, not workflow data. Stamping it here also
    # broke under the replay clock — events carry simulated timestamps that run
    # ahead of wall time, so a wall-clock last_seen landed *before* first_seen
    # and the Event validator rejected it. The row's updated_at records the write.
    updated = event.model_copy(
        update={
            "status": status,
            "assigned_team": assigned_team or event.assigned_team,
        }
    )
    state.replace_event(updated)

    try:
        async with session_scope() as session:
            row = await session.get(EventRow, event_id)
            if row is not None:
                row.status = str(status)
                if assigned_team:
                    row.assigned_team = assigned_team
                if notes:
                    await _append_work_order_note(
                        session,
                        row,
                        StatusPatch(status=status, assigned_team=assigned_team, notes=notes),
                    )
    except Exception as exc:
        # the in-memory update already succeeded; the UI stays correct
        log.warning("could not persist status change for %s: %s", event_id, exc)

    broadcaster.publish(  # type: ignore[attr-defined]
        WSMessageType.EVENT_UPDATED, updated.model_dump(mode="json")
    )

    # The citizen half of the loop. A report linked to this event follows it up
    # the ladder, so somebody who photographed a pothole watches their own
    # timeline reach "Fixed" without anyone telling them.
    #
    # It lives HERE, in the one place an event's status actually changes,
    # rather than in a poller: a background job comparing two ladders would be
    # a second source of truth about when a report moved, and would lag by its
    # own interval on the exact screen a citizen is looking at.
    await _propagate_to_reports(updated, state, broadcaster)

    return updated


@router.post(
    "/events/{event_id}/evidence",
    response_model=Event,
    summary="Attach a photo or a note from the field",
)
async def add_evidence(
    event_id: UUID,
    body: EvidencePost,
    state: State,
    broadcaster: Bus,
    settings: Settings,
) -> Event:
    """A crew's own photo of what they found, appended to the event.

    The photo joins `evidence_uris` alongside the camera frames rather than
    living in a separate crew-only field: the point of the list is "everything
    anyone has seen of this defect", and splitting it by who took the picture
    would mean every consumer has to remember to read both.

    A request with neither a photo nor a note is a 422 rather than a no-op —
    it means the client thinks it sent something, and answering 200 would hide
    that.
    """
    if body.photo is None and not (body.note or "").strip():
        raise HTTPException(status_code=422, detail="send a photo, a note, or both")

    event = await get_event(event_id, state)

    uris = list(event.evidence_uris)
    if body.photo is not None:
        # Suffixed by position so a second photo on the same event does not
        # overwrite the first — the event id alone is not unique per upload.
        uris.append(
            store_photo(
                body.photo,
                event_id,
                settings.MEDIA_DIR,
                kind="events",
                suffix_hint=f"crew{len(uris)}",
            )
        )

    updated = event.model_copy(update={"evidence_uris": uris})
    state.replace_event(updated)

    try:
        async with session_scope() as session:
            row = await session.get(EventRow, event_id)
            if row is not None:
                row.evidence_uris = uris
                if body.note and body.note.strip():
                    await _append_work_order_note(
                        session,
                        row,
                        StatusPatch(
                            status=event.status,
                            assigned_team=body.team,
                            notes=body.note.strip(),
                        ),
                    )
    except Exception as exc:
        # The in-memory update already succeeded and the file is on disk; the
        # console will show the photo. Only durability is lost.
        log.warning("could not persist evidence for %s: %s", event_id, exc)

    broadcaster.publish(WSMessageType.EVENT_UPDATED, updated.model_dump(mode="json"))


    return updated


async def _propagate_to_reports(event: Event, state: LiveState, broadcaster: object) -> None:
    """Advance any citizen report linked to this event.

    Failures are logged and swallowed. The operator's status change has
    already succeeded and been broadcast; losing the citizen-side follow-up is
    a worse outcome than losing it AND rolling back a repair that really
    happened.
    """
    from ..report_linking import report_status_for
    from .reports import _save_and_broadcast, merged_reports

    try:
        linked = [
            report
            for report in await merged_reports(state)
            if report.linked_event_id == event.event_id
        ]
    except Exception as exc:
        log.warning("could not load reports linked to %s: %s", event.event_id, exc)
        return

    for report in linked:
        target = report_status_for(event.status, report.status)
        if target is None:
            continue
        try:
            await _save_and_broadcast(
                report.model_copy(update={"status": target}), state, broadcaster
            )
            log.info("report %s → %s (event %s)", report.report_id, target, event.event_id)
        except Exception as exc:
            log.warning("could not advance report %s: %s", report.report_id, exc)


async def _append_work_order_note(session: object, row: EventRow, patch: StatusPatch) -> None:
    """Record the human decision as a work order so there is an audit trail."""
    from uuid import uuid4

    from db import WorkOrder

    session.add(  # type: ignore[attr-defined]
        WorkOrder(
            work_order_id=uuid4(),
            event_id=row.event_id,
            assigned_team=patch.assigned_team or row.assigned_team or "unassigned",
            status=str(patch.status),
            sla_due=row.sla_due,
            notes=patch.notes,
        )
    )
