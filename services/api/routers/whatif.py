"""POST /api/whatif/simulate — calls M2's what-if factory. Owned by M5."""

from __future__ import annotations

from contracts import WhatIfRequest, WhatIfResult
from fastapi import APIRouter

from services.whatif import get_whatif_engine

router = APIRouter(prefix="/api/whatif", tags=["what-if"])


@router.post("/simulate", response_model=list[WhatIfResult], summary="Simulate road closures")
async def simulate(request: WhatIfRequest) -> list[WhatIfResult]:
    return get_whatif_engine().simulate(request)
