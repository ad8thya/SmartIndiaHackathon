"""GET /api/roads/... — calls M2's traffic factory. Owned by M5.

M5 never imports MockTrafficAnalyzer. It imports the factory, and M2 decides
what comes back.
"""

from __future__ import annotations

from citydata import SEGMENTS
from contracts import RoadCondition
from fastapi import APIRouter, HTTPException

from services.analytics.traffic import get_traffic_analyzer
from services.risk import get_risk_scorer

from ..deps import State
from ..hub import LiveState
from ..intel_context import build_risk_context

router = APIRouter(prefix="/api", tags=["roads"])


def _with_risk(condition: RoadCondition, state: LiveState) -> RoadCondition:
    """Fill in the three AI-intelligence-layer fields on a RoadCondition.

    Calls the same RiskScorer and the same context builder `/api/roads/{id}/risk`
    uses, so a road's `urban_risk_score` here always matches the detailed score
    behind that endpoint.
    """
    ctx = build_risk_context(condition.road_id, state, condition)
    result = get_risk_scorer().score(condition.road_id, ctx)
    return condition.model_copy(
        update={
            "urban_risk_score": round(result.score, 1),
            "risk_band": result.band,
            "near_miss_count_7d": ctx.near_miss_count,
        }
    )


@router.get("/roads", response_model=list[RoadCondition], summary="Every road's condition")
async def all_roads(state: State) -> list[RoadCondition]:
    conditions = get_traffic_analyzer().analyze(state.recent_observations())
    return [_with_risk(condition, state) for condition in conditions.values()]


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
    return _with_risk(condition, state)
