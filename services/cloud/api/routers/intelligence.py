"""GET /api/roads/{id}/risk, /api/recommendations, /api/near-misses,
/api/junctions/dangerous. Owned by M5.

New file, deliberately, so nobody collides with roads.py/whatif.py/incidents.py
merge conflicts. Calls M3's risk factory and M2's recommend factory the same
way roads.py calls M2's traffic factory — never importing the mock directly.
"""

from __future__ import annotations

from datetime import UTC, datetime

from citydata import SEGMENTS
from contracts import (
    InfrastructureRecommendation,
    NearMissEvent,
    RecommendationType,
    RiskBand,
    UrbanRiskScore,
)
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.cloud.intelligence.recommend import get_recommendation_engine
from services.cloud.intelligence.traffic_analytics import get_traffic_analyzer
from services.cloud.intelligence.urban_risk import get_risk_scorer
from services.edge.incidents.near_miss import scripted_near_misses

from ..deps import State
from ..intel_context import build_risk_context

router = APIRouter(prefix="/api", tags=["intelligence"])


class DangerousJunction(BaseModel):
    """One row of `/api/junctions/dangerous` — a road ranked by composite risk."""

    road_id: str
    name: str
    lat: float
    lon: float
    risk_score: float = Field(ge=0.0, le=100.0)
    risk_band: RiskBand
    near_miss_count_7d: int = Field(ge=0)


# ── risk ─────────────────────────────────────────────────────────────────────
@router.get(
    "/roads/{road_id}/risk",
    response_model=UrbanRiskScore,
    summary="Explainable urban risk index for one road",
)
async def road_risk(road_id: str, state: State) -> UrbanRiskScore:
    conditions = get_traffic_analyzer().analyze(state.recent_observations())
    condition = conditions.get(road_id)
    if condition is None:
        known = ", ".join(segment.road_id for segment in SEGMENTS[:5])
        raise HTTPException(
            status_code=404, detail=f"unknown road {road_id!r} (try one of: {known}, …)"
        )
    ctx = build_risk_context(road_id, state, condition)
    return get_risk_scorer().score(road_id, ctx)


# ── recommendations ──────────────────────────────────────────────────────────
@router.get(
    "/recommendations",
    response_model=list[InfrastructureRecommendation],
    summary="Infrastructure recommendations, city-wide",
)
async def recommendations(
    state: State,
    rec_type: RecommendationType | None = Query(default=None, alias="type"),
    priority: RiskBand | None = Query(default=None),
    road_id: str | None = Query(default=None),
) -> list[InfrastructureRecommendation]:
    conditions = get_traffic_analyzer().analyze(state.recent_observations())
    engine = get_recommendation_engine()
    segments = [s for s in SEGMENTS if road_id is None or s.road_id == road_id]

    results: list[InfrastructureRecommendation] = []
    for segment in segments:
        ctx = build_risk_context(segment.road_id, state, conditions.get(segment.road_id))
        results.extend(engine.recommend(segment.road_id, ctx))

    if rec_type is not None:
        results = [rec for rec in results if rec.rec_type is rec_type]
    if priority is not None:
        results = [rec for rec in results if rec.priority is priority]

    results.sort(key=lambda rec: rec.detected_at, reverse=True)
    return results


# ── near-misses ───────────────────────────────────────────────────────────────
@router.get(
    "/near-misses",
    response_model=list[NearMissEvent],
    summary="Near-miss events (vehicle-pedestrian conflicts, no contact)",
)
async def near_misses(
    bbox: str | None = Query(
        default=None, description="minLon,minLat,maxLon,maxLat — the map viewport"
    ),
    since: datetime | None = Query(default=None, description="ts newer than this"),
) -> list[NearMissEvent]:
    events = scripted_near_misses(datetime.now(tz=UTC))

    if since is not None:
        events = [event for event in events if event.ts >= since]
    if bbox:
        events = _filter_bbox(events, bbox)

    events.sort(key=lambda event: event.ts, reverse=True)
    return events


def _filter_bbox(events: list[NearMissEvent], bbox: str) -> list[NearMissEvent]:
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


# ── dangerous junctions ───────────────────────────────────────────────────────
@router.get(
    "/junctions/dangerous",
    response_model=list[DangerousJunction],
    summary="Roads ranked by composite risk",
)
async def dangerous_junctions(
    state: State, limit: int = Query(default=10, ge=1, le=50)
) -> list[DangerousJunction]:
    conditions = get_traffic_analyzer().analyze(state.recent_observations())
    scorer = get_risk_scorer()

    ranked: list[DangerousJunction] = []
    for segment in SEGMENTS:
        ctx = build_risk_context(segment.road_id, state, conditions.get(segment.road_id))
        result = scorer.score(segment.road_id, ctx)
        lon, lat = segment.center
        ranked.append(
            DangerousJunction(
                road_id=segment.road_id,
                name=segment.name,
                lat=lat,
                lon=lon,
                risk_score=round(result.score, 1),
                risk_band=result.band,
                near_miss_count_7d=ctx.near_miss_count,
            )
        )

    ranked.sort(key=lambda junction: junction.risk_score, reverse=True)
    return ranked[:limit]
