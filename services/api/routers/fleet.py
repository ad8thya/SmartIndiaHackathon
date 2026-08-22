"""GET /api/fleet — where every bus is right now. Owned by M5."""

from __future__ import annotations

from contracts import BusPosition
from fastapi import APIRouter, Query

from ..deps import State

router = APIRouter(prefix="/api", tags=["fleet"])


# TODO (M5): reads LiveState only, so a fresh API with no replay running returns
# [] even though `make seed` wrote 6 rows into bus_positions — the map opens with
# no buses. Fall back to the latest row per bus from postgres when memory is
# empty (the composite index ix_bus_positions_bus_ts exists for exactly this).
# Same fix applies to /api/fleet/{bus_id} below.
@router.get("/fleet", response_model=list[BusPosition], summary="Live bus positions")
async def fleet(
    state: State,
    route_id: str | None = Query(default=None, description="filter to one route"),
) -> list[BusPosition]:
    positions = list(state.buses.values())
    if route_id:
        positions = [position for position in positions if position.route_id == route_id]
    return sorted(positions, key=lambda position: position.bus_id)


@router.get("/fleet/{bus_id}", response_model=BusPosition, summary="One bus")
async def one_bus(bus_id: str, state: State) -> BusPosition:
    from fastapi import HTTPException

    position = state.buses.get(bus_id)
    if position is None:
        raise HTTPException(status_code=404, detail=f"no live position for {bus_id}")
    return position
