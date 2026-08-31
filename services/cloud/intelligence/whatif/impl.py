"""M2 REAL implementation — counterfactual routing on a real road graph.

Genuine shortest-path routing over the Chennai OSM drive network: ~128,000
nodes and ~320,000 edges, weighted by travel time. Closing a road removes its
edges and the route is re-solved; the delta is the difference in minutes. No
heuristic, no table.

**The graph is never fetched at request time.** `scripts/build_drive_graph.py`
builds and pickles it once, offline; this loads that pickle. Overpass is
rate-limited and would pick the demo to fail on, and a 30-second stall inside a
request handler is not a feature. If the cache is missing this raises with the
command to run — the correct failure, rather than quietly reaching for the
network mid-demo.

How a bus route becomes a path through the graph: each seeded route is a
sequence of anchor points (`citydata.RouteSpec.anchors`). Those are snapped to
their nearest graph nodes once, at startup, and the route's travel time is the
sum of the shortest paths between consecutive anchors. Closing a segment
removes that leg's own edges, and the same sum is recomputed.
Doing it anchor-to-anchor rather than end-to-end matters: a single end-to-end
path would happily route around the middle of the city and miss the corridor
the bus actually drives.

Disconnection is a result, not an error. If a closure leaves no path between
two anchors, that leg contributes `DISCONNECTED_PENALTY_MIN` and the route is
returned with `recommended=False` — an operator needs to see "you cannot do
this", not a 500.

────────────────────────────────────────────────────────────────────────────
NOT DEMO-SAFE YET. ``USE_REAL_WHATIF`` stays ``false``.
────────────────────────────────────────────────────────────────────────────
This runs, and for most roads it produces believable answers: measured against
the real Chennai graph, 18 of the 26 seeded segments return between +0.7 and
+10.1 minutes, which is the right shape for a single-road closure.

The other 8 come back at 33-41 minutes, which is the ``DISCONNECTED_PENALTY_MIN``
in disguise: removing that leg leaves no path between its two anchors at all.
Closing one Chennai road does not usually sever a bus route, so those are
almost certainly an artefact of how the seeded route anchors snap onto the OSM
graph — an anchor landing on a service road or the wrong side of a one-way
pair — rather than a real finding.

Until that is understood, this would put "+41 min" next to eight roads on
stage and invite exactly the question we could not answer. So the flag stays
off and `mock.py`'s deterministic heuristic — which is derived, distinct per
road and defensible — is what the demo runs on. The two are honest about being
different things: this one is graph routing, that one says in its own docstring
that it is not.

To pick this up: instrument `_prepare` to report which anchor pairs disconnect,
and check those anchors against the graph by hand.

Also still simplified, and listed rather than hidden:
  · edge speeds are OSM's inferred free-flow, not live speeds from the
    TrafficAnalyzer, so a closure's cost does not yet vary by time of day
  · `affected_passengers` is still a per-trip constant from settings rather
    than headway x occupancy over the horizon
"""

from __future__ import annotations

import itertools
import logging
import pickle
from pathlib import Path
from typing import Any

from citydata import ROUTES, route_by_id, segments_for_route
from contracts import WhatIfRequest, WhatIfResult

from .config import WhatIfSettings, get_settings
from .mock import BASELINE_MINUTES

log = logging.getLogger("urban-twin.whatif")

#: what one severed leg of a route costs, in minutes. Deliberately large and
#: finite: `inf` would make every disconnected route compare equal, and the
#: panel needs to rank "bad" against "impossible".
DISCONNECTED_PENALTY_MIN = 45.0


class RealWhatIfEngine:
    """Satisfies :class:`contracts.WhatIfEngine` using networkx over OSM."""

    def __init__(self, settings: WhatIfSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._graph: Any = None
        #: route_id -> the graph nodes its anchors snap to, in order
        self._route_nodes: dict[str, list[int]] = {}
        #: route_id -> baseline minutes, computed once against the intact graph
        self._baseline_minutes: dict[str, float] = {}
        #: route_id -> the edges its baseline path actually uses. A closure has
        #: to remove the road the bus drives, not merely roads near it.
        self._route_edges: dict[str, list[tuple[int, int, int]]] = {}
        #: road_id -> the edges a closure removes
        self._segment_edges: dict[str, list[tuple[int, int, int]]] = {}

    # ── graph loading ───────────────────────────────────────────────────────
    def _ensure_graph(self) -> Any:
        if self._graph is not None:
            return self._graph

        cache = Path(self.settings.WHATIF_GRAPH_CACHE)
        if not cache.exists():
            raise FileNotFoundError(
                f"{cache} is missing. Build it once, offline:\n"
                f"    pip install -e '.[geo]'\n"
                f"    python scripts/build_drive_graph.py\n"
                f"The real what-if engine never fetches Overpass at request time."
            )
        with cache.open("rb") as handle:
            self._graph = pickle.load(handle)
        log.info(
            "drive graph loaded: %s nodes, %s edges",
            f"{self._graph.number_of_nodes():,}",
            f"{self._graph.number_of_edges():,}",
        )
        self._prepare()
        return self._graph

    def _prepare(self) -> None:
        """Snap routes to the graph and solve every baseline. Once, at load."""
        import osmnx as ox

        for route in ROUTES:
            lons = [lon for lon, _ in route.anchors]
            lats = [lat for _, lat in route.anchors]
            nodes = ox.nearest_nodes(self._graph, lons, lats)
            self._route_nodes[route.route_id] = [int(node) for node in nodes]

        import networkx as nx

        for route in ROUTES:
            nodes = self._route_nodes[route.route_id]
            segments = segments_for_route(route.route_id)
            total_seconds = 0.0

            # Segment i IS the leg between anchor i and anchor i+1 — that is how
            # citydata builds them. So a closure does not need a radius to guess
            # which edges to cut: it cuts exactly the leg's own path. Matching by
            # proximity instead left four closures out of five with no effect,
            # because a curved OSM path can leave a straight-line segment centre
            # further than any sensible radius.
            for index, segment in enumerate(segments):
                if index + 1 >= len(nodes):
                    break
                start, end = nodes[index], nodes[index + 1]
                try:
                    leg = nx.shortest_path(self._graph, start, end, weight="travel_time")
                    total_seconds += nx.shortest_path_length(
                        self._graph, start, end, weight="travel_time"
                    )
                except (nx.NetworkXNoPath, nx.NodeNotFound):
                    self._segment_edges[segment.road_id] = []
                    total_seconds += DISCONNECTED_PENALTY_MIN * 60.0
                    continue

                edges: list[tuple[int, int, int]] = []
                for u, v in itertools.pairwise(leg):
                    keys = self._graph.get_edge_data(u, v) or {}
                    edges.extend((u, v, key) for key in keys)
                self._segment_edges[segment.road_id] = edges

            self._baseline_minutes[route.route_id] = total_seconds / 60.0

        log.info(
            "baselines solved for %d routes, %d segments mapped to graph edges",
            len(self._baseline_minutes),
            len(self._segment_edges),
        )

    def _path_edges(
        self, route_id: str, removed: set[tuple[int, int, int]]
    ) -> list[tuple[int, int, int]]:
        """The edges a route's current shortest path traverses."""
        import networkx as nx

        nodes = self._route_nodes.get(route_id, [])
        if len(nodes) < 2:
            return []
        graph = self._view(removed)

        edges: list[tuple[int, int, int]] = []
        for start, end in itertools.pairwise(nodes):
            try:
                leg = nx.shortest_path(graph, start, end, weight="travel_time")
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue
            for u, v in itertools.pairwise(leg):
                keys = self._graph.get_edge_data(u, v) or {}
                edges.extend((u, v, key) for key in keys)
        return edges

    def _view(self, removed: set[tuple[int, int, int]]) -> Any:
        """A graph with edges hidden, without copying 320,000 of them.

        `graph.copy()` per request cost seconds and made the panel feel broken;
        `restricted_view` is a read-only overlay and is effectively free.
        """
        import networkx as nx

        if not removed:
            return self._graph
        return nx.restricted_view(self._graph, [], list(removed))

    # ── Protocol ────────────────────────────────────────────────────────────
    def simulate(self, req: WhatIfRequest) -> list[WhatIfResult]:
        self._ensure_graph()

        closed = list(req.closed_road_ids[: self.settings.WHATIF_MAX_CLOSED_ROADS])
        removed: set[tuple[int, int, int]] = set()
        for road_id in closed:
            removed.update(self._edges_for_segment(road_id))

        results: list[WhatIfResult] = []
        for route in ROUTES:
            baseline = self._baseline_minutes.get(route.route_id) or BASELINE_MINUTES.get(
                route.route_id, 40.0
            )
            touches = any(
                segment.road_id in set(closed) for segment in segments_for_route(route.route_id)
            )

            if not touches or not removed:
                simulated = baseline
            else:
                simulated = self._path_minutes(route.route_id, removed)

            delta = max(0.0, simulated - baseline)

            # every route gets a row, including the unaffected ones — a missing
            # row reads as "not computed", not as "no impact"
            results.append(
                WhatIfResult(
                    route_id=route.route_id,
                    baseline_min=round(baseline, 1),
                    simulated_min=round(baseline + delta, 1),
                    delta_min=round(delta, 1),
                    recommended=delta <= self.settings.WHATIF_TOLERABLE_DELTA_MIN,
                    diversion_polyline=(
                        self._diversion(route.route_id, removed) if delta > 0 else []
                    ),
                    affected_passengers=(
                        self.settings.WHATIF_PASSENGERS_PER_TRIP if delta > 0 else 0
                    ),
                )
            )
        return results

    # ── routing ─────────────────────────────────────────────────────────────
    def _path_minutes(self, route_id: str, removed: set[tuple[int, int, int]]) -> float:
        """Travel time along the route's anchor sequence, in minutes."""
        import networkx as nx

        nodes = self._route_nodes.get(route_id, [])
        if len(nodes) < 2:
            return BASELINE_MINUTES.get(route_id, 40.0)

        graph = self._view(removed)

        seconds = 0.0
        for start, end in itertools.pairwise(nodes):
            try:
                seconds += nx.shortest_path_length(graph, start, end, weight="travel_time")
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                # severed, not broken: the panel must be able to say
                # "this closure isolates the route"
                seconds += DISCONNECTED_PENALTY_MIN * 60.0
        return seconds / 60.0

    def _diversion(self, route_id: str, removed: set[tuple[int, int, int]]) -> list[Any]:
        """The re-routed path, as [lon, lat] pairs for the map to draw."""
        import networkx as nx

        nodes = self._route_nodes.get(route_id, [])
        if len(nodes) < 2:
            return []

        graph = self._view(removed)

        polyline: list[tuple[float, float]] = []
        for start, end in itertools.pairwise(nodes):
            try:
                leg = nx.shortest_path(graph, start, end, weight="travel_time")
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue
            for node in leg:
                data = graph.nodes[node]
                point = (round(float(data["x"]), 6), round(float(data["y"]), 6))
                if not polyline or polyline[-1] != point:
                    polyline.append(point)
        return polyline

    # ── closures ────────────────────────────────────────────────────────────
    def _edges_for_segment(self, road_id: str) -> list[tuple[int, int, int]]:
        """The graph edges a closure of `road_id` removes.

        Precomputed in `_prepare` as the shortest path along that segment's own
        leg of its route. An unknown id closes nothing — an operator will click
        something stale and it must not raise.
        """
        return self._segment_edges.get(road_id, [])

    @staticmethod
    def _route_polyline(route_id: str) -> list[tuple[float, float]]:
        return list(route_by_id(route_id).polyline)
