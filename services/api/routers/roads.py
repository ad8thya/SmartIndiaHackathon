"""GET /api/roads/... — calls M2's traffic factory. Owned by M5.

M5 never imports MockTrafficAnalyzer. It imports the factory, and M2 decides
what comes back.
"""

from __future__ import annotations

from citydata import SEGMENTS
from contracts import RoadCondition
from fastapi import APIRouter, HTTPException

from services.analytics.traffic import get_traffic_analyzer

from ..deps import State

router = APIRouter(prefix="/api", tags=["roads"])


@router.get("/roads", response_model=list[RoadCondition], summary="Every road's condition")
async def all_roads(state: State) -> list[RoadCondition]:
    conditions = get_traffic_analyzer().analyze(state.recent_observations())
    return list(conditions.values())


@router.get(
    "/roads/{road_id}/condition",
    response_model=RoadCondition,
    summary="One road's live condition",
)
async def road_condition(road_id: str, state: State) -> RoadCondition:
    conditions = get_traffic_analyzer().analyze(state.recent_observations())
    condition = conditions.get(road_id)
    if condition is None:
        known = ", ".join(segment.road_id for segment in SEGMENTS[:5])
        raise HTTPException(
            status_code=404, detail=f"unknown road {road_id!r} (try one of: {known}, …)"
        )
    return condition
