"""M2 REAL implementation — counterfactual routing on a real road graph.

TODO (M2):
  1. Load the cached OSM drive graph (WHATIF_GRAPH_CACHE). Build it ONCE with
     osmnx and pickle it — never call Overpass from a request handler.
  2. Weight edges by travel time: length / current speed, where current speed
     comes from the TrafficAnalyzer. Baseline = shortest path over the route's
     stop sequence.
  3. For each closure, remove those edges and re-run networkx shortest_path.
     If a route becomes disconnected, that is not an error — it is a
     `recommended=False` with a very large delta, and the panel must say so.
  4. delta_min = simulated - baseline. `recommended` when delta is under
     WHATIF_TOLERABLE_DELTA_MIN.
  5. Return the new path as `diversion_polyline` so the map can draw it.
  6. affected_passengers: headway × occupancy over the horizon, not a constant.

Performance: precompute the baseline paths at startup. Only the simulated leg
needs recomputing per request, and the panel is interactive.
"""

from __future__ import annotations

from typing import Any

from contracts import WhatIfRequest, WhatIfResult

from .config import WhatIfSettings, get_settings


class RealWhatIfEngine:
    """Satisfies :class:`contracts.WhatIfEngine`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: WhatIfSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._graph: Any = None
        self._baseline_paths: dict[str, Any] = {}

    def _ensure_graph(self) -> Any:
        if self._graph is None:
            import pickle
            from pathlib import Path

            cache = Path(self.settings.WHATIF_GRAPH_CACHE)
            if not cache.exists():
                raise FileNotFoundError(
                    f"{cache} missing — build the OSM graph offline first. "
                    "Do not fetch Overpass at request time."
                )
            self._graph = pickle.loads(cache.read_bytes())
        return self._graph

    def simulate(self, req: WhatIfRequest) -> list[WhatIfResult]:
        raise NotImplementedError(
            "M2: real what-if routing is not wired up yet. "
            "Keep USE_REAL_WHATIF=false until this returns WhatIfResults."
        )

    def _shortest_time(self, route_id: str, removed_edges: set[str]) -> float:
        """TODO: minutes over the route's stop sequence with edges removed."""
        raise NotImplementedError
