#!/usr/bin/env python
"""Cache OSM building footprints for the 3D twin. Owned by M6.

    make buildings

Fetches once from Overpass and writes
``apps/web/public/data/buildings.geojson``. The app loads that file and
NEVER calls Overpass at runtime — it is rate-limited, slow, and it will pick
your demo to fail on.

If Overpass is unreachable (venue wifi, rate limit, whatever), this falls back
to generating a plausible synthetic block grid over central Chennai so the twin
still has 3D geometry. That fallback is checked in, so a fresh clone renders
buildings with no network at all.
"""

from __future__ import annotations

import json
import math
import random
import sys
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "apps/web/public/data/buildings.geojson"
OVERPASS = "https://overpass-api.de/api/interpreter"

#: metres of padding around the seeded routes. Anything the buses never drive
#: past is geometry the twin pays for and never shows.
PAD_M = 500.0


def route_bbox(pad_m: float = PAD_M) -> tuple[float, float, float, float]:
    """Bounding box of the six seeded routes, padded. (south, west, north, east).

    Derived from citydata rather than hardcoded, so it follows the network if
    anyone adds a route. Fetching all of Chennai would be ~10x the geometry for
    a map the demo never pans to.
    """
    import sys as _sys

    _sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages/citydata/src"))
    from citydata import ROUTES

    lons = [point[0] for route in ROUTES for point in route.polyline]
    lats = [point[1] for route in ROUTES for point in route.polyline]
    mid_lat = (min(lats) + max(lats)) / 2
    pad_lat = pad_m / 110_574.0
    pad_lon = pad_m / (110_574.0 * math.cos(math.radians(mid_lat)))
    return (min(lats) - pad_lat, min(lons) - pad_lon, max(lats) + pad_lat, max(lons) + pad_lon)


BBOX = route_bbox()

#: Only buildings that declare a height or a storey count. An untagged footprint
#: gets a guessed height anyway, so it adds bytes without adding information —
#: and this is the first lever to pull if the file gets too big.
TAGGED_ONLY = "--tagged-only" in sys.argv

_BOX = f"{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}"
_WAYS = (
    # either tag counts — "height" and "building:levels" are both common in
    # Chennai OSM data and neither alone is enough
    f'way["building"]["building:levels"]({_BOX});\n  way["building"]["height"]({_BOX});'
    if TAGGED_ONLY
    else f'way["building"]({_BOX});'
)

QUERY = f"""
[out:json][timeout:180];
(
  {_WAYS}
);
out geom;
"""


#: typical Chennai heights: mostly 3-5 storeys with occasional towers
def _height(tags: dict[str, str], rng: random.Random) -> float:
    for key in ("height", "building:height"):
        if key in tags:
            try:
                return float(str(tags[key]).replace("m", "").strip())
            except ValueError:
                pass
    for key in ("building:levels", "levels"):
        if key in tags:
            try:
                return float(tags[key]) * 3.2
            except ValueError:
                pass
    return round(
        rng.choices([9, 13, 17, 26, 45], weights=(30, 32, 22, 12, 4))[0] * rng.uniform(0.85, 1.15),
        1,
    )


def fetch_from_overpass() -> dict | None:
    print("→ querying Overpass (this takes 30-90s and only needs doing once)…")
    try:
        request = urllib.request.Request(
            OVERPASS,
            data=QUERY.encode(),
            headers={"User-Agent": "urban-twin/0.1 (SIH 2026 hackathon project)"},
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"  ! Overpass unavailable ({type(exc).__name__}: {exc})")
        return None

    rng = random.Random(20260821)
    features = []
    for element in payload.get("elements", []):
        geometry = element.get("geometry") or []
        if len(geometry) < 4:
            continue
        # 6 decimal places is ~11 cm — far finer than a city view needs, and it
        # roughly halves the file size versus full float repr
        ring = [[round(point["lon"], 6), round(point["lat"], 6)] for point in geometry]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        # floor at 3 m: OSM carries a few height=0 tags, and a zero-height
        # extrusion is an invisible building. Round to 1dp — float noise like
        # 9.600000000000001 is pure file size.
        height = round(max(_height(element.get("tags", {}), rng), 3.0), 1)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {"height": height},
            }
        )
    print(f"  ✔ {len(features)} building footprints from OSM")
    return {"type": "FeatureCollection", "features": features}


def synthesise() -> dict:
    """A plausible block grid. Not real geometry — but the twin still reads as 3D."""
    print("→ generating a synthetic block grid instead (works with no network)")
    rng = random.Random(20260821)
    south, west, north, east = BBOX
    features = []

    # ~55 x 55 blocks, each with a few buildings, skipping some for streets/parks
    steps = 55
    d_lat = (north - south) / steps
    d_lon = (east - west) / steps

    for row in range(steps):
        for col in range(steps):
            if rng.random() < 0.42:  # negative space: roads, water, open ground
                continue
            base_lat = south + row * d_lat
            base_lon = west + col * d_lon

            for _ in range(rng.randint(1, 3)):
                w = d_lon * rng.uniform(0.18, 0.42)
                h = d_lat * rng.uniform(0.18, 0.42)
                lon = base_lon + rng.uniform(0.05, 0.55) * d_lon
                lat = base_lat + rng.uniform(0.05, 0.55) * d_lat
                # a little rotation so the grid does not look like graph paper
                theta = rng.uniform(-0.25, 0.25)
                corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
                ring = [
                    [
                        lon + dx * math.cos(theta) - dy * math.sin(theta),
                        lat + dx * math.sin(theta) + dy * math.cos(theta),
                    ]
                    for dx, dy in corners
                ]
                ring.append(ring[0])

                # taller towards the centre of the box, like a real CBD
                centre_pull = 1.0 - (
                    abs(row - steps / 2) / (steps / 2) * 0.5
                    + abs(col - steps / 2) / (steps / 2) * 0.5
                )
                height = round(
                    rng.choices([9, 14, 19, 30, 52], weights=(34, 30, 20, 12, 4))[0]
                    * (0.7 + centre_pull * 0.9),
                    1,
                )
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                        "properties": {"height": height},
                    }
                )

    print(f"  ✔ {len(features)} synthetic footprints")
    return {"type": "FeatureCollection", "features": features}


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    collection = None
    if "--offline" not in sys.argv:
        collection = fetch_from_overpass()
    if collection is None or not collection["features"]:
        collection = synthesise()

    OUT.write_text(json.dumps(collection, separators=(",", ":")))
    size_kb = OUT.stat().st_size // 1024
    print(f"  bbox: S{BBOX[0]:.4f} W{BBOX[1]:.4f} N{BBOX[2]:.4f} E{BBOX[3]:.4f} "
          f"(seeded routes + {PAD_M:.0f} m)")
    where = OUT.relative_to(Path.cwd()) if OUT.is_relative_to(Path.cwd()) else OUT
    print(f"\n  ✔ wrote {where}  ({size_kb} KB)")
    if size_kb > 5000:
        print("  ! over 5 MB — re-run with --tagged-only to keep just buildings that")
        print("    declare building:levels, or reduce PAD_M")
    return 0


if __name__ == "__main__":
    sys.exit(main())
