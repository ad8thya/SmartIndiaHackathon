"""GET /api/analytics/summary — the KPI strip. Owned by M5."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta

from contracts import TERMINAL_STATUSES, AnalyticsSummary, WorkflowStatus
from fastapi import APIRouter

from services.analytics.traffic import get_traffic_analyzer

from ..deps import State
from .events import merged_events

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary, summary="Top-bar KPIs")
async def summary(state: State) -> AnalyticsSummary:
    now = datetime.now(tz=UTC)
    # the SAME merged postgres+memory source /api/events serves. Reading
    # state.event_list() here made the KPI strip undercount the panel below it
    # by everything written before the current API process started.
    events = await merged_events(state)

    by_status = Counter(str(event.status) for event in events)
    by_class = Counter(str(event.detection_class) for event in events)
    open_events = sum(1 for event in events if event.status not in TERMINAL_STATUSES)

    conditions = get_traffic_analyzer().analyze(state.recent_observations(2000))
    speeds = [condition.avg_speed_kmph for condition in conditions.values()]
    avg_speed = sum(speeds) / len(speeds) if speeds else 0.0

    # TODO (M5): "today" is really "since this process started" — state.incidents
    # is an in-memory deque and nothing persists the incidents table. Depends on
    # the same decision as routers/incidents.py.
    day_ago = now - timedelta(hours=24)
    incidents_today = sum(1 for incident in state.incidents if incident.ts >= day_ago)

    breaches = sum(
        1
        for event in events
        if event.sla_due is not None
        and event.sla_due < now
        and event.status not in TERMINAL_STATUSES
    )

    resolved = [
        event
        for event in events
        if event.status in {WorkflowStatus.RESOLVED, WorkflowStatus.VERIFIED}
    ]
    avg_resolution = (
        sum((event.last_seen - event.first_seen).total_seconds() for event in resolved)
        / len(resolved)
        / 3600.0
        if resolved
        else 0.0
    )

    return AnalyticsSummary(
        generated_at=now,
        # TODO (M5): both are process-lifetime counters wearing a "_today" name.
        # km_surveyed resets to 0 on every `uvicorn --reload`, i.e. every time
        # anyone saves a python file. Persist to redis (it is already a
        # dependency) or aggregate from bus_positions.
        buses_online=len(state.buses),
        km_surveyed_today=round(state.km_surveyed, 1),
        open_events=open_events,
        events_by_status=dict(by_status),
        events_by_class=dict(by_class),
        avg_network_speed_kmph=round(avg_speed, 1),
        incidents_today=incidents_today,
        sla_breaches=breaches,
        avg_resolution_hours=round(avg_resolution, 1),
    )
