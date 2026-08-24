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
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import Bus, State
from ..hub import LiveState

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
    """Return (events, source). Source is 'postgres' or 'memory'."""
    try:
        async with session_scope() as session:
            rows = (await session.execute(select(EventRow))).scalars().all()
        return [_row_to_event(row) for row in rows], "postgres"
    except Exception as exc:
        log.warning("event read fell back to memory: %s", exc)
        from ..hub import state as live

        return live.event_list(), "memory"


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
    """The one write path a human drives. Everything else is machine-generated."""
    event = await get_event(event_id, state)

    # last_seen deliberately untouched: it means "when the fleet last SAW this
    # thing", which is sensor data, not workflow data. Stamping it here also
    # broke under the replay clock — events carry simulated timestamps that run
    # ahead of wall time, so a wall-clock last_seen landed *before* first_seen
    # and the Event validator rejected it. The row's updated_at records the write.
    updated = event.model_copy(
        update={
            "status": patch.status,
            "assigned_team": patch.assigned_team or event.assigned_team,
        }
    )
    state.replace_event(updated)

    try:
        async with session_scope() as session:
            row = await session.get(EventRow, event_id)
            if row is not None:
                row.status = str(patch.status)
                if patch.assigned_team:
                    row.assigned_team = patch.assigned_team
                if patch.notes:
                    await _append_work_order_note(session, row, patch)
    except Exception as exc:
        # the in-memory update already succeeded; the UI stays correct
        log.warning("could not persist status change for %s: %s", event_id, exc)

    broadcaster.publish(WSMessageType.EVENT_UPDATED, updated.model_dump(mode="json"))
    return updated


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
