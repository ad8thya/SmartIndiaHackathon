"""M2 REAL implementation — traffic state from bus-borne vehicle counts.

TODO (M2):
  1. Snap observations to a real road graph instead of nearest-segment-centre.
     `osmnx.graph_from_place("Chennai, India", network_type="drive")` once,
     cached to disk — never fetch at runtime.
  2. Estimate density properly. Buses are probe vehicles: you know the bus
     speed from meta and the count of VEHICLE detections in view. Density
     follows from the fundamental diagram (Greenshields is fine, Underwood is
     better in congestion).
  3. Aggregate over TRAFFIC_WINDOW_MINUTES with exponential decay so a single
     stalled bus does not paint a corridor red for an hour.
  4. Derive PCI from M1's defect events per km, weighted by IRC severity.
  5. bus_delay_min: compare observed segment traversal time against the
     free-flow baseline in SegmentSpec.
  6. Keep `analyze()` pure and fast — the API calls it per request.

Watch out for: buses stop at bus stops. Naive speed averaging reports every
route as congested. Filter out dwell time before you compute anything.
"""

from __future__ import annotations

from typing import Any

from contracts import Observation, RoadCondition

from .config import TrafficSettings, get_settings


class RealTrafficAnalyzer:
    """Satisfies :class:`contracts.TrafficAnalyzer`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: TrafficSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._graph: Any = None

    def _ensure_graph(self) -> Any:
        """Lazy-load the cached OSM drive graph. Never hit the network here."""
        if self._graph is None:
            import pickle
            from pathlib import Path

            cache = Path("data/chennai_drive_graph.pkl")
            if not cache.exists():
                raise FileNotFoundError(
                    f"{cache} missing — run `make buildings` / your graph build step first. "
                    "Do not fetch OSM at request time."
                )
            self._graph = pickle.loads(cache.read_bytes())
        return self._graph

    def analyze(self, observations: list[Observation]) -> dict[str, RoadCondition]:
        raise NotImplementedError(
            "M2: real traffic analysis is not wired up yet. "
            "Keep USE_REAL_TRAFFIC=false until this returns RoadConditions."
        )

    def _snap_to_edge(self, lat: float, lon: float) -> str:
        """TODO: nearest graph edge id for a point."""
        raise NotImplementedError
