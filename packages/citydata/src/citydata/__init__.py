"""Static Chennai reference data shared by mocks, the seeder and the simulator.

Not a contract, but frozen for the week for the same reason: seeded event rows
reference these ids.
"""

from __future__ import annotations

from .geometry import (
    LonLat,
    bearing_deg,
    densify,
    haversine_m,
    point_at_fraction,
    polyline_length_km,
)
from .network import (
    BUSES,
    CHENNAI_CENTER,
    DEFECT_HOTSPOTS,
    ROUTES,
    SCHOOL_ZONES,
    SEGMENTS,
    BusSpec,
    HotspotSpec,
    RouteSpec,
    SchoolZoneSpec,
    SegmentSpec,
    route_by_id,
    segment_by_id,
    segments_for_route,
)

__all__ = [
    "BUSES",
    "CHENNAI_CENTER",
    "DEFECT_HOTSPOTS",
    "ROUTES",
    "SCHOOL_ZONES",
    "SEGMENTS",
    "BusSpec",
    "HotspotSpec",
    "LonLat",
    "RouteSpec",
    "SchoolZoneSpec",
    "SegmentSpec",
    "bearing_deg",
    "densify",
    "haversine_m",
    "point_at_fraction",
    "polyline_length_km",
    "route_by_id",
    "segment_by_id",
    "segments_for_route",
]
