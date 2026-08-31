"""GET /api/incidents — calls M4's incident factory. Owned by M5.

Live incidents arrive over MQTT and land in the hub. If none have arrived yet
(fresh process, replay not started) the endpoint asks M4's detector directly so
the panel has a dossier to show.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from citydata import segment_by_id
from contracts import (
    RESPONSE_ORDER,
    DetectionClass,
    FrameMeta,
    IncidentReport,
    IncidentResponse,
    ResponseState,
    WSMessageType,
)
from db import IncidentResponse as ResponseRow
from db import session_scope
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from services.edge.incidents import get_incident_detector

from ..deps import Bus, State

log = logging.getLogger("urban-twin.incidents")
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


@router.get(
    "/incidents/responses",
    response_model=list[IncidentResponse],
    summary="Latest response state per incident",
)
async def list_responses() -> list[IncidentResponse]:
    """Declared before /incidents/{incident_id} — otherwise 'responses' is
    parsed as a uuid and every request 422s."""
    return sorted((await _latest_responses()).values(), key=lambda r: r.at, reverse=True)


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


# ─────────────────────────────────────────────────────────────────────────────
# Response lifecycle — what an emergency crew did about an incident.
#
# Before this the phone recorded Accept and Dispatch in its own localStorage
# and the control room was never told. That was the same failure the citizen
# report had before T5, and worse, because the thing it was quiet about was an
# ambulance.
#
# Append-only: one row per state change, so the response *interval* survives.
# "When was the unit dispatched" is the question an incident review asks, and
# an overwritten status column cannot answer it.
# ─────────────────────────────────────────────────────────────────────────────


class ResponsePost(BaseModel):
    """PATCH /api/incidents/{id}/response body."""

    state: ResponseState
    #: self-asserted; there is no auth to derive a crew identity from
    team: str = Field(default="", max_length=64)
    note: str | None = Field(default=None, max_length=2000)

    model_config = {
        "extra": "forbid",
        "json_schema_extra": {
            "examples": [{"state": "DISPATCHED", "team": "GCC-Emergency-Adyar"}]
        },
    }


def _row_to_response(row: ResponseRow) -> IncidentResponse:
    return IncidentResponse(
        incident_id=row.incident_id,
        state=ResponseState(row.state),
        team=row.team,
        note=row.note,
        at=row.at,
    )


async def _latest_responses() -> dict[UUID, IncidentResponse]:
    """The newest response per incident. THE one definition of 'where is this'.

    Every caller goes through here rather than reading the table directly, for
    the same reason `merged_events` exists: two slightly different "latest row"
    queries is how a list and a detail view come to disagree.
    """
    try:
        async with session_scope() as session:
            rows = (
                await session.execute(select(ResponseRow).order_by(ResponseRow.at))
            ).scalars().all()
    except Exception as exc:
        log.warning("could not read incident responses: %s", exc)
        return {}

    # Ordered oldest-first, so the last write for an id wins.
    latest: dict[UUID, IncidentResponse] = {}
    for row in rows:
        latest[row.incident_id] = _row_to_response(row)
    return latest


@router.get(
    "/incidents/{incident_id}/response",
    response_model=list[IncidentResponse],
    summary="Full response history for one incident",
)
async def get_response_history(incident_id: UUID) -> list[IncidentResponse]:
    try:
        async with session_scope() as session:
            rows = (
                await session.execute(
                    select(ResponseRow)
                    .where(ResponseRow.incident_id == incident_id)
                    .order_by(ResponseRow.at)
                )
            ).scalars().all()
    except Exception as exc:
        log.warning("could not read response history for %s: %s", incident_id, exc)
        return []
    return [_row_to_response(row) for row in rows]


@router.patch(
    "/incidents/{incident_id}/response",
    response_model=IncidentResponse,
    summary="Accept, dispatch, arrive at, or close an incident",
)
async def set_response(
    incident_id: UUID,
    body: ResponsePost,
    broadcaster: Bus,
) -> IncidentResponse:
    """Advance a crew's response, and tell everyone watching.

    Forward-only, except CLOSED which is reachable from anywhere — a crew can
    stand down from an incident they never reached. Going backwards is a 409
    rather than a silent accept: a second phone tapping "Accept" on an incident
    that is already ON_SCENE has stale state, and telling it so is how it finds
    out.
    """
    history = await _latest_responses()
    current = history.get(incident_id)

    going_backwards = (
        current is not None
        and body.state is not ResponseState.CLOSED
        and RESPONSE_ORDER[body.state] <= RESPONSE_ORDER[current.state]
    )
    if going_backwards and current is not None:
        raise HTTPException(
                status_code=409,
                detail=(
                    f"incident is already {current.state}"
                    f"{f' with {current.team}' if current.team else ''}"
                ),
            )

    response = IncidentResponse(
        incident_id=incident_id,
        state=body.state,
        team=body.team,
        note=body.note,
        at=datetime.now(tz=UTC),
    )

    try:
        async with session_scope() as session:
            session.add(
                ResponseRow(
                    incident_id=response.incident_id,
                    state=str(response.state),
                    team=response.team,
                    note=response.note,
                    at=response.at,
                )
            )
    except Exception as exc:
        # The broadcast still goes out: a control room that sees the dispatch
        # and loses the audit row is far better off than one that sees nothing.
        log.warning("could not persist response for %s: %s", incident_id, exc)

    broadcaster.publish(WSMessageType.INCIDENT_RESPONSE, response.model_dump(mode="json"))
    return response
