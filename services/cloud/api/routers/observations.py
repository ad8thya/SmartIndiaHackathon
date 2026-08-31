"""GET /api/observations — raw detections, before fusion. Owned by M5.

Exists for exactly one screen: a bus driver seeing what *their* bus
contributed today. That question cannot be answered from `/api/events`,
because an `Event` is a fusion of several buses' sightings and deliberately
carries no bus attribution — `distinct_bus_count` is a number, not a list.
`Observation` is the only record that names a bus, so this is the only place
the answer can come from.

⚠️  This reads `LiveState.observations`, which is an in-memory ring buffer of
the last 5000 detections and is empty on a fresh process. It is NOT a
historical query: `since` filters what is in the buffer, it does not reach
into postgres. `truncated` says whether the buffer was full, so a caller can
tell "you contributed 12 things" from "you contributed at least 12 things".
Anything that needs real history should read the `observations` table.
"""

from __future__ import annotations

from datetime import datetime

from contracts import DetectionClass, Observation
from fastapi import APIRouter, Query

from ..deps import State

router = APIRouter(prefix="/api", tags=["observations"])


@router.get(
    "/observations",
    response_model=list[Observation],
    summary="Recent raw detections, filterable by bus",
)
async def list_observations(
    state: State,
    bus_id: str | None = Query(default=None, description="only this bus's sightings"),
    route_id: str | None = Query(default=None),
    detection_class: list[DetectionClass] | None = Query(default=None, alias="class"),
    since: datetime | None = Query(
        default=None, description="ts newer than this — filters the buffer, not postgres"
    ),
    limit: int = Query(default=200, ge=1, le=2000),
) -> list[Observation]:
    observations = state.recent_observations()

    if bus_id:
        observations = [o for o in observations if o.bus_id == bus_id]
    if route_id:
        observations = [o for o in observations if o.route_id == route_id]
    if detection_class:
        wanted = set(detection_class)
        observations = [o for o in observations if o.detection_class in wanted]
    if since is not None:
        observations = [o for o in observations if o.ts >= since]

    observations.sort(key=lambda o: o.ts, reverse=True)
    return observations[:limit]
