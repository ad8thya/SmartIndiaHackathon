"""GET /api/fleet — where every bus is right now, and what its cameras are
doing. Owned by M5."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from contracts import BusPosition, CameraState, CameraStatus
from fastapi import APIRouter, HTTPException, Query

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


#: The four fixed positions on an MTC bus. Order is the order they are shown.
LENSES = ("front", "rear", "left", "right")

#: Past this, a bus has stopped reporting and its cameras are contributing
#: nothing. Positions arrive every few seconds under replay, so a minute of
#: silence is unambiguous rather than a slow tick.
OFFLINE_AFTER_S = 60.0


def _obstructed_lens(bus_id: str) -> str | None:
    """Which lens, if any, is standing in as obstructed on this bus.

    ⚠️  SIMULATED, and flagged as such on every row it produces
    (`CameraStatus.derived`). Urban Twin has no camera-health channel: a bus
    reports position, not lens condition. The state still has to exist,
    because a crew needs to recognise it before the day it happens and there
    is no way to produce a real one on demand.

    Deterministic from the bus id — a hash, not `random` — for the same reason
    the what-if engine is: a value that changes on every poll makes a screen
    flicker and a demo unreproducible.

    Roughly one bus in three, which is about right for a fleet that has been
    out all day. The specific byte is not arbitrary: with the first byte the
    rule missed all six seeded buses, so the OBSTRUCTED branch was unreachable
    on a stock `make dev` — an unreachable state is an untested state, and the
    entire reason it exists is that a driver should recognise it before the day
    it happens. `test_module.py` asserts the seeded fleet still exercises it,
    so a change here that makes it unreachable again fails rather than quietly
    removing the state from the app.
    """
    digest = hashlib.sha256(bus_id.encode()).digest()
    if digest[1] % 3 != 0:
        return None
    return LENSES[digest[2] % len(LENSES)]


@router.get(
    "/fleet/{bus_id}/cameras",
    response_model=list[CameraStatus],
    summary="Camera status for one bus (derived — see CameraStatus)",
)
async def bus_cameras(bus_id: str, state: State) -> list[CameraStatus]:
    """What this bus's four cameras are doing.

    Declared before /fleet/{bus_id} would be a problem in the other direction
    — this path is longer and more specific, so registration order does not
    matter here the way it does for a literal segment like "responses".

    OFFLINE and `last_frame_age_s` are real: they come from whether and when
    the bus last reported. OBSTRUCTED is simulated and every row says so via
    `derived`, so no consumer can mistake it for sensed data.
    """
    position = state.buses.get(bus_id)

    if position is None:
        # An unknown bus is a 404; a known bus that has gone quiet is four
        # OFFLINE cameras, which is a different and useful answer.
        raise HTTPException(status_code=404, detail=f"no live position for {bus_id}")

    age = (datetime.now(tz=UTC) - position.ts).total_seconds()
    # Replay runs on a simulated clock that can lead wall time, so a negative
    # age is normal rather than a bug. Clamp instead of reporting nonsense.
    age = max(0.0, age)
    silent = age > OFFLINE_AFTER_S
    obstructed = _obstructed_lens(bus_id)

    return [
        CameraStatus(
            bus_id=bus_id,
            lens=lens,
            state=(
                CameraState.OFFLINE
                if silent
                else CameraState.OBSTRUCTED
                if lens == obstructed
                else CameraState.OK
            ),
            last_frame_age_s=None if silent else age,
            derived=True,
        )
        for lens in LENSES
    ]


@router.get("/fleet/{bus_id}", response_model=BusPosition, summary="One bus")
async def one_bus(bus_id: str, state: State) -> BusPosition:
    position = state.buses.get(bus_id)
    if position is None:
        raise HTTPException(status_code=404, detail=f"no live position for {bus_id}")
    return position
