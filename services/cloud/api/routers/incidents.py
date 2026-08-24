"""GET /api/incidents — calls M4's incident factory. Owned by M5.

Live incidents arrive over MQTT and land in the hub. If none have arrived yet
(fresh process, replay not started) the endpoint asks M4's detector directly so
the panel has a dossier to show.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from citydata import segment_by_id
from contracts import DetectionClass, FrameMeta, IncidentReport
from fastapi import APIRouter, HTTPException, Query

from services.edge.incidents import get_incident_detector

from ..deps import State

router = APIRouter(prefix="/api", tags=["incidents"])


# TODO (M5): incidents exist ONLY in a 500-deep in-memory deque — nothing writes
# the `incidents` table at runtime, so every dossier is lost on API restart and
# the table stays empty forever. Decide with M4 whether the MQTT bridge persists
# them; if it does, this endpoint must read the same merged postgres+memory
# source that routers/events.py::merged_events() defines, or the KPI strip and
# this panel will drift apart exactly the way open_events did.
@router.get("/incidents", response_model=list[IncidentReport], summary="Incident dossiers")
async def list_incidents(
    state: State,
    incident_class: DetectionClass | None = Query(default=None, alias="class"),
    with_plate: bool | None = Query(default=None, description="only reports with a readable plate"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[IncidentReport]:
    reports = list(state.incidents)

    if not reports:
        reports = _bootstrap_from_detector()

    if incident_class is not None:
        reports = [report for report in reports if report.incident_class is incident_class]
    if with_plate is not None:
        reports = [report for report in reports if (report.plate_text is not None) is with_plate]

    reports.sort(key=lambda report: report.ts, reverse=True)
    return reports[:limit]


@router.get("/incidents/{incident_id}", response_model=IncidentReport, summary="One dossier")
async def get_incident(incident_id: UUID, state: State) -> IncidentReport:
    for report in list(state.incidents) or _bootstrap_from_detector():
        if report.incident_id == incident_id:
            return report
    raise HTTPException(status_code=404, detail=f"no incident {incident_id}")


def _bootstrap_from_detector() -> list[IncidentReport]:
    """Ask M4's detector for whatever it would produce at the scripted scene."""
    from services.edge.incidents import SCRIPTED_BUS, SCRIPTED_SEGMENT

    center = segment_by_id(SCRIPTED_SEGMENT).center
    meta = FrameMeta(
        bus_id=SCRIPTED_BUS,
        route_id="21G",
        ts=datetime.now(tz=UTC),
        lat=center[1],
        lon=center[0],
        heading_deg=200.0,
        speed_kmph=32.0,
    )
    return get_incident_detector().process([], meta)
