"""M2 MOCK — hardcoded diversion costs per route.

The panel needs numbers that look like an answer, not a spinner. Each route has
a fixed penalty for each segment that could close, so the same closure always
returns the same delta — which makes the demo rehearsable and makes it obvious
when the real engine starts disagreeing.

The three headline numbers the pitch quotes are +6, +14 and +3 minutes.
"""

from __future__ import annotations

from citydata import ROUTES, route_by_id, segments_for_route
from contracts import WhatIfRequest, WhatIfResult

from .config import WhatIfSettings, get_settings

#: baseline end-to-end running time per route, minutes
BASELINE_MINUTES: dict[str, float] = {
    "27B": 42.0,
    "42A": 38.0,
    "51C": 55.0,
    "21G": 34.0,
    "570": 29.0,
    "M1": 47.0,
}

#: the headline deltas — closing a segment on these routes costs this much
HEADLINE_DELTAS: dict[str, float] = {
    "27B": 6.0,
    "51C": 14.0,
    "570": 3.0,
}

#: per-segment penalty in minutes. Segments not listed fall back to the route's
#: headline delta, or 4 minutes if the route has none.
SEGMENT_PENALTY_MIN: dict[str, float] = {
    "SEG-27B-000": 6.0,
    "SEG-27B-001": 11.0,  # Anna Salai — no good parallel route
    "SEG-27B-002": 4.0,
    "SEG-27B-003": 7.5,
    "SEG-27B-004": 5.0,
    "SEG-42A-000": 5.0,
    "SEG-42A-001": 3.5,
    "SEG-42A-002": 8.0,
    "SEG-42A-003": 12.0,
    "SEG-51C-000": 9.0,
    "SEG-51C-001": 14.0,  # Sardar Patel Road — the classic bottleneck
    "SEG-51C-002": 6.5,
    "SEG-51C-003": 5.0,
    "SEG-21G-000": 3.0,
    "SEG-21G-001": 7.0,
    "SEG-21G-002": 16.0,  # Kamarajar Salai — the beach road has no alternative
    "SEG-21G-003": 4.5,
    "SEG-570-000": 3.0,
    "SEG-570-001": 4.0,
    "SEG-570-002": 6.0,
    "SEG-570-003": 9.5,
    "SEG-M1-000": 5.5,
    "SEG-M1-001": 8.5,
    "SEG-M1-002": 6.0,
    "SEG-M1-003": 10.0,
    "SEG-M1-004": 13.0,
}


class MockWhatIfEngine:
    """Satisfies :class:`contracts.WhatIfEngine`."""

    def __init__(self, settings: WhatIfSettings | None = None) -> None:
        self.settings = settings or get_settings()

    # ── Protocol ────────────────────────────────────────────────────────────
    def simulate(self, req: WhatIfRequest) -> list[WhatIfResult]:
        closed = set(req.closed_road_ids[: self.settings.WHATIF_MAX_CLOSED_ROADS])
        results: list[WhatIfResult] = []

        for route in ROUTES:
            baseline = BASELINE_MINUTES.get(route.route_id, 40.0)
            affected = [
                segment.road_id
                for segment in segments_for_route(route.route_id)
                if segment.road_id in closed
            ]
            delta = sum(self._penalty(route.route_id, road_id) for road_id in affected)

            # unaffected routes still get a row — an operator needs to see the
            # ones that are fine, otherwise "no result" reads as "not computed"
            results.append(
                WhatIfResult(
                    route_id=route.route_id,
                    baseline_min=baseline,
                    simulated_min=round(baseline + delta, 1),
                    delta_min=round(delta, 1),
                    recommended=delta <= self.settings.WHATIF_TOLERABLE_DELTA_MIN,
                    diversion_polyline=self._diversion(route.route_id) if affected else [],
                    affected_passengers=(
                        self.settings.WHATIF_PASSENGERS_PER_TRIP if affected else 0
                    ),
                )
            )
        return results

    # ── internals ───────────────────────────────────────────────────────────
    def _penalty(self, route_id: str, road_id: str) -> float:
        if road_id in SEGMENT_PENALTY_MIN:
            return SEGMENT_PENALTY_MIN[road_id]
        return HEADLINE_DELTAS.get(route_id, 4.0)

    @staticmethod
    def _diversion(route_id: str) -> list[tuple[float, float]]:
        """A crude parallel path, offset from the route — enough for the map to
        draw a dashed diversion line next to the original."""
        route = route_by_id(route_id)
        return [(lon + 0.0045, lat + 0.0025) for lon, lat in route.polyline]
