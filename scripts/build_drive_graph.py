"""Build the Chennai drive graph once, offline, and pickle it.

    pip install -e ".[geo]"
    .venv/bin/python scripts/build_drive_graph.py

`services/cloud/intelligence/whatif/impl.py` loads the pickle this writes and
**never** fetches from Overpass itself. That split is deliberate and it is the
whole reason the real what-if engine is safe to demo:

  * Overpass is rate-limited and will pick your demo to fail on. A graph fetch
    inside a request handler is a 30-second stall at best.
  * The graph is ~40 MB of python objects. Building it takes minutes; loading
    the pickle takes about a second.
  * A pickle on disk is reproducible. A live query is whatever OSM looked like
    at that moment.

The output is gitignored (`data/*.pkl`) because it is large and derived. On a
fresh clone the real engine will refuse to start and say to run this — which
is the correct failure, rather than silently reaching for the network.
"""

from __future__ import annotations

import argparse
import pickle
import sys
from pathlib import Path

# the seeded network plus a margin, so every route and any plausible diversion
# around it is inside the graph
DEFAULT_BBOX = (80.09, 12.83, 80.38, 13.28)  # west, south, east, north
DEFAULT_OUT = Path("data/chennai_drive_graph.pkl")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        default=DEFAULT_BBOX,
        help="defaults to the seeded route extent plus a margin",
    )
    args = parser.parse_args()

    try:
        import osmnx as ox
    except ImportError:
        print("osmnx is not installed. Run:  pip install -e '.[geo]'", file=sys.stderr)
        return 1

    west, south, east, north = args.bbox
    print(
        f"fetching the drive network for {west},{south},{east},{north} — this takes a few minutes"
    )

    graph = ox.graph_from_bbox((west, south, east, north), network_type="drive")
    # travel times need a speed on every edge; osmnx infers missing ones from
    # the highway tag's mean observed speed
    graph = ox.add_edge_speeds(graph)
    graph = ox.add_edge_travel_times(graph)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("wb") as handle:
        pickle.dump(graph, handle, protocol=pickle.HIGHEST_PROTOCOL)

    size_mb = args.out.stat().st_size / 1_000_000
    print(
        f"wrote {args.out} — {graph.number_of_nodes():,} nodes, "
        f"{graph.number_of_edges():,} edges, {size_mb:.1f} MB"
    )
    print("now set USE_REAL_WHATIF=true in your .env")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
