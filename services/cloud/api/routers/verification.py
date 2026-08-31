"""GET /api/verification — how far the fleet has got confirming repairs.

A READ endpoint only. The verification itself is a `Repeater` with no HTTP
surface, because a re-scan is something the world does as buses drive. But
the crew's phone has to be able to show the wait: which bus, which route,
how many clean passes out of how many, and whether it has stalled.

"Awaiting next pass" with no end was the thing this feature exists to remove.
Replacing it with a progress bar that also has no end would be the same
failure one level further along, so this endpoint reports stalls and
unreachable thresholds as first-class states rather than leaving a counter
sitting still.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..deps import Settings, State

router = APIRouter(prefix="/api", tags=["repair verification"])


class VerificationStatus(BaseModel):
    """Progress on one repaired defect.

    Not a contracts model: it is a view of live in-process state that only
    this app reads, and adding it to the frozen layer would mean a fifth
    amendment for something no other module consumes.
    """

    event_id: str
    road_segment_id: str | None
    #: clean passes so far, and the number needed
    clean_passes: int
    passes_required: int
    #: distinct buses that have contributed a clean pass, and the number needed
    distinct_buses: int
    buses_required: int
    #: every bus that has driven past at all, clean or not
    buses_seen: list[str]
    #: a pass where the defect was seen again — the repair did not hold
    dirty_passes: int
    #: falls with each clean pass below the threshold
    confidence: float
    last_pass_at: datetime | None = None
    pending_since: datetime | None = None
    #: no bus has driven this road for long enough that a crew should be told
    stalled: bool = False
    #: the distinct-bus threshold cannot be met here — see `can_ever_verify`
    needs_manual: bool = False
    detail: str = Field(default="", description="one line a crew can act on")


@router.get(
    "/verification",
    response_model=list[VerificationStatus],
    summary="Repairs awaiting corroboration by the fleet",
)
async def list_verification(
    request: Request, state: State, settings: Settings
) -> list[VerificationStatus]:
    loop = getattr(request.app.state, "verification", None)
    if loop is None:
        return []

    now = datetime.now(tz=UTC)
    out: list[VerificationStatus] = []

    for progress in loop.verifier.all_progress():
        stalled = loop.verifier.is_stalled(progress, now)
        reachable = loop.verifier.can_ever_verify(progress)

        if progress.dirty_passes:
            detail = "A bus saw the defect again — the repair did not hold."
        elif not reachable and progress.clean_passes >= settings.REPAIR_VERIFY_PASSES:
            detail = (
                f"{progress.clean_passes} clean passes, but only "
                f"{len(progress.buses_seen)} bus serves this road. Needs manual sign-off."
            )
        elif stalled:
            detail = "No bus has driven this road recently. Needs manual sign-off."
        elif progress.clean_passes == 0:
            detail = "Waiting for the next bus to drive this road."
        else:
            detail = (
                f"{progress.clean_passes} of {settings.REPAIR_VERIFY_PASSES} clean passes, "
                f"from {progress.distinct_clean_buses} of {settings.REPAIR_VERIFY_MIN_BUSES} buses."
            )

        out.append(
            VerificationStatus(
                event_id=progress.event_id,
                road_segment_id=progress.road_segment_id,
                clean_passes=progress.clean_passes,
                passes_required=settings.REPAIR_VERIFY_PASSES,
                distinct_buses=progress.distinct_clean_buses,
                buses_required=settings.REPAIR_VERIFY_MIN_BUSES,
                buses_seen=sorted(progress.buses_seen),
                dirty_passes=progress.dirty_passes,
                confidence=progress.confidence,
                last_pass_at=progress.last_pass_at,
                pending_since=progress.pending_since,
                stalled=stalled,
                needs_manual=stalled
                or (not reachable and progress.clean_passes >= settings.REPAIR_VERIFY_PASSES),
                detail=detail,
            )
        )

    out.sort(key=lambda item: item.clean_passes, reverse=True)
    return out
