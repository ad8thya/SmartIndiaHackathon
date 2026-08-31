"""Citizen reports: POST /api/reports and friends. Owned by M5.

This endpoint exists because the mobile app's citizen report used to be
written to ``localStorage`` and nowhere else. It looked like it worked, it
never reached a person, and it vanished on a cache clear. That was in the
honesty register; this is the fix.

Two things here are deliberate and worth not undoing:

**A report is not an Observation.** It never enters fusion, it carries no
confidence, and nothing links it to an ``Event`` automatically. An operator
sets ``linked_event_id`` when they judge two things to be the same thing.
Auto-linking on proximity would be a way of pretending a citizen classified a
defect, and it would let anyone with a phone move the workflow ladder.

**Photos are stored as files, not as data URIs in the row.** The phone sends
one base64 data URI in the POST body; this module decodes it, writes a real
file, and stores only a path. Keeping the base64 would put a couple of MB of
string in every list response and in the WebSocket frame that fans out to
every connected console.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from contracts import CitizenReport, ReportCategory, ReportStatus, WSMessageType
from db import CitizenReport as ReportRow
from db import point, session_scope, to_lonlat
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import Bus, Settings, State
from ..hub import LiveState
from ..media import resolve_photo, store_photo
from ..report_linking import find_matching_event

log = logging.getLogger("urban-twin.reports")
router = APIRouter(prefix="/api", tags=["reports"])

class ReportCreate(BaseModel):
    """POST /api/reports body.

    Not the ``CitizenReport`` contract model: the client does not get to
    choose ``report_id``, ``status``, ``created_at`` or ``linked_event_id``.
    A phone that could set its own status could mark its own report resolved.
    """

    category: ReportCategory
    description: str = Field(default="", max_length=2000)
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)
    address: str = Field(default="", max_length=300)
    reporter_name: str = Field(default="", max_length=120)
    ward: str = Field(default="", max_length=64)
    #: ``data:image/jpeg;base64,...`` straight from the phone's camera input.
    #: Decoded, written to disk and discarded; only the resulting path is kept.
    photo: str | None = Field(default=None, description="base64 data URI, jpeg/png/webp")

    model_config = {
        # Reject unknown fields rather than ignoring them. A phone that sends
        # `status` or `report_id` is either an old client or a malicious one;
        # accepting the request and silently dropping the field tells it the
        # value took effect. `extra="forbid"` is also what the frozen contract
        # models use, so the request boundary behaves like the wire boundary.
        "extra": "forbid",
        "json_schema_extra": {
            "examples": [
                {
                    "category": "POTHOLE",
                    "description": "Deep hole in the left lane, cars swerving.",
                    "lat": 13.0067,
                    "lon": 80.2570,
                    "address": "Sardar Patel Rd, near Adyar depot",
                    "reporter_name": "9840 012345",
                    "ward": "Ward 173",
                    "photo": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
                }
            ]
        }
    }


def _row_to_report(row: ReportRow) -> CitizenReport:
    lon, lat = to_lonlat(row.geom)
    return CitizenReport(
        report_id=row.report_id,
        category=ReportCategory(row.category),
        description=row.description,
        lat=lat,
        lon=lon,
        address=row.address,
        photo_uri=row.photo_uri,
        reporter_name=row.reporter_name,
        ward=row.ward,
        status=ReportStatus(row.status),
        created_at=row.created_at,
        linked_event_id=row.linked_event_id,
    )


async def merged_reports(state: LiveState) -> list[CitizenReport]:
    """Every report the system knows about: postgres, plus anything this
    process accepted that has not landed there.

    THE one definition of "all reports" — the same arrangement
    ``routers/events.py::merged_events`` uses, and for the same reason. A
    second, subtly different read path is how the KPI strip and the panel
    under it came to disagree once already (BUILD.md §4, F9).
    """
    try:
        async with session_scope() as session:
            rows = (await session.execute(select(ReportRow))).scalars().all()
        reports = [_row_to_report(row) for row in rows]
        known = {report.report_id for report in reports}
        reports.extend(r for r in state.report_list() if r.report_id not in known)
    except Exception as exc:
        log.warning("report read fell back to memory: %s", exc)
        reports = state.report_list()

    reports.sort(key=lambda report: report.created_at, reverse=True)
    return reports


@router.post(
    "/reports",
    response_model=CitizenReport,
    status_code=201,
    summary="File a citizen report",
)
async def create_report(
    body: ReportCreate,
    state: State,
    broadcaster: Bus,
    settings: Settings,
) -> CitizenReport:
    report_id = uuid4()

    photo_uri = (
        store_photo(body.photo, report_id, settings.MEDIA_DIR, kind="reports")
        if body.photo
        else None
    )

    # Is this the same real-world thing as something the fleet already found?
    # Automatic and by proximity — see report_linking.py for why, and for why
    # a linked report still contributes nothing to the event's confidence.
    #
    # A failure here must not lose the report: the citizen took a photo and
    # pressed send, and "we could not check for duplicates" is not a reason to
    # refuse that. It falls through to an unlinked report, which is a perfectly
    # good outcome.
    match = None
    try:
        from .events import merged_events

        match = find_matching_event(
            category=body.category,
            lat=body.lat,
            lon=body.lon,
            events=await merged_events(state),
            radius_m=settings.REPORT_LINK_RADIUS_M,
        )
    except Exception as exc:
        log.warning("could not check report %s for a matching event: %s", report_id, exc)

    report = CitizenReport(
        report_id=report_id,
        category=body.category,
        description=body.description,
        lat=body.lat,
        lon=body.lon,
        address=body.address,
        photo_uri=photo_uri,
        reporter_name=body.reporter_name,
        ward=body.ward,
        # LINKED, not SUBMITTED, when it matched — the citizen is told
        # immediately, on the success screen, rather than finding out later.
        status=ReportStatus.LINKED if match else ReportStatus.SUBMITTED,
        created_at=datetime.now(tz=UTC),
        linked_event_id=match.event_id if match else None,
    )

    # Cache first, then persist. If postgres is down the citizen still gets a
    # report id and the console still sees it — which is the whole point of
    # not writing to localStorage any more. The warning is the honest record
    # that this one is not durable yet.
    state.add_report(report)

    try:
        async with session_scope() as session:
            session.add(
                ReportRow(
                    report_id=report.report_id,
                    category=str(report.category),
                    description=report.description,
                    geom=point(report.lat, report.lon),
                    address=report.address,
                    photo_uri=report.photo_uri,
                    reporter_name=report.reporter_name,
                    ward=report.ward,
                    status=str(report.status),
                    created_at=report.created_at,
                    linked_event_id=report.linked_event_id,
                )
            )
    except Exception as exc:
        log.warning("could not persist report %s: %s", report.report_id, exc)

    broadcaster.publish(WSMessageType.REPORT_NEW, report.model_dump(mode="json"))
    return report


@router.get("/reports", response_model=list[CitizenReport], summary="Filtered report list")
async def list_reports(
    state: State,
    status: list[ReportStatus] | None = Query(default=None),
    category: list[ReportCategory] | None = Query(default=None),
    ward: str | None = Query(default=None),
    reporter_name: str | None = Query(
        default=None, description="exact match — how the phone shows 'my reports'"
    ),
    since: datetime | None = Query(default=None, description="created_at newer than this"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[CitizenReport]:
    reports = await merged_reports(state)

    if status:
        wanted = set(status)
        reports = [r for r in reports if r.status in wanted]
    if category:
        categories = set(category)
        reports = [r for r in reports if r.category in categories]
    if ward:
        reports = [r for r in reports if r.ward == ward]
    if reporter_name:
        reports = [r for r in reports if r.reporter_name == reporter_name]
    if since is not None:
        reports = [r for r in reports if r.created_at >= since]

    return reports[:limit]


# Declared before /reports/{report_id} — otherwise the uuid route matches
# "photos" first and every image request 422s on the path parameter.
@router.get("/reports/photos/{filename}", include_in_schema=False)
async def get_report_photo(filename: str, settings: Settings) -> FileResponse:
    """Serve a stored report photo. Traversal is refused in `media.py`."""
    return FileResponse(resolve_photo(settings.MEDIA_DIR, "reports", filename))


class ReportPatch(BaseModel):
    """PATCH /api/reports/{id} body — the manual override.

    Automatic linking on POST and automatic propagation from the event ladder
    are the normal paths; this is for an operator who knows better than the
    proximity rule, in either direction. Both fields are optional, and sending
    neither is a 422 rather than a no-op.
    """

    status: ReportStatus | None = None
    #: null to UNLINK — an operator deciding the match was wrong. Absent means
    #: "leave it alone", which is why this cannot be a plain `UUID | None`
    #: with a None default; see the sentinel in `patch_report`.
    linked_event_id: UUID | None = None
    #: distinguishes "unlink it" from "do not touch the link"
    unlink: bool = False
    note: str | None = Field(default=None, max_length=2000)

    model_config = {
        "extra": "forbid",
        "json_schema_extra": {"examples": [{"status": "ACKNOWLEDGED"}]},
    }


@router.patch(
    "/reports/{report_id}",
    response_model=CitizenReport,
    summary="Set a report's status, or correct its link",
)
async def patch_report(
    report_id: UUID,
    body: ReportPatch,
    state: State,
    broadcaster: Bus,
) -> CitizenReport:
    if body.status is None and body.linked_event_id is None and not body.unlink:
        raise HTTPException(status_code=422, detail="send a status, a link, or unlink")

    report = await get_report(report_id, state)

    update: dict[str, object] = {}
    if body.status is not None:
        update["status"] = body.status
    if body.unlink:
        update["linked_event_id"] = None
    elif body.linked_event_id is not None:
        update["linked_event_id"] = body.linked_event_id

    updated = report.model_copy(update=update)
    await _save_and_broadcast(updated, state, broadcaster)
    return updated


async def _save_and_broadcast(
    report: CitizenReport, state: LiveState, broadcaster: object
) -> None:
    """Persist a changed report, refresh the cache, and tell every listener.

    THE one write path for a report that already exists — the PATCH endpoint
    and the event-ladder propagation both come through here, so a report can
    never change in the database without the phone being told.
    """
    # Cache first: the console and the reporter's phone both read the socket,
    # and a database that is briefly unreachable should not stall the update.
    state.replace_report(report)

    try:
        async with session_scope() as session:
            row = await session.get(ReportRow, report.report_id)
            if row is not None:
                row.status = str(report.status)
                row.linked_event_id = report.linked_event_id
    except Exception as exc:
        log.warning("could not persist report %s: %s", report.report_id, exc)

    broadcaster.publish(  # type: ignore[attr-defined]
        WSMessageType.REPORT_UPDATED, report.model_dump(mode="json")
    )


@router.get("/reports/{report_id}", response_model=CitizenReport, summary="One report")
async def get_report(report_id: UUID, state: State) -> CitizenReport:
    for report in await merged_reports(state):
        if report.report_id == report_id:
            return report
    raise HTTPException(status_code=404, detail=f"no report {report_id}")
