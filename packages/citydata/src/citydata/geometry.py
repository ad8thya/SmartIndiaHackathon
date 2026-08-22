"""Tiny geometry helpers used to build the demo network. No dependencies."""

from __future__ import annotations

from itertools import pairwise
from math import asin, atan2, cos, degrees, radians, sin, sqrt

LonLat = tuple[float, float]

__all__ = ["bearing_deg", "densify", "haversine_m", "point_at_fraction", "polyline_length_km"]


def densify(anchors: list[LonLat], per_leg: int = 6) -> list[LonLat]:
    """Linearly interpolate between anchor points.

    Real GTFS shapes have a vertex every ~50 m. Six anchors would make the twin
    look like a polygon, so we subdivide each leg.
    """
    if len(anchors) < 2:
        return list(anchors)
    out: list[LonLat] = []
    for (lon1, lat1), (lon2, lat2) in pairwise(anchors):
        for step in range(per_leg):
            t = step / per_leg
            out.append((lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t))
    out.append(anchors[-1])
    return out


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_008.8
    d_lat, d_lon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * r * asin(sqrt(min(1.0, a)))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial great-circle bearing, 0–360 clockwise from north."""
    phi1, phi2 = radians(lat1), radians(lat2)
    d_lambda = radians(lon2 - lon1)
    x = sin(d_lambda) * cos(phi2)
    y = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(d_lambda)
    return (degrees(atan2(x, y)) + 360.0) % 360.0


def polyline_length_km(polyline: list[LonLat]) -> float:
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in pairwise(polyline):
        total += haversine_m(lat1, lon1, lat2, lon2)
    return total / 1000.0


def point_at_fraction(polyline: list[LonLat], fraction: float) -> tuple[LonLat, float]:
    """Position and heading at ``fraction`` (0–1) of the way along a polyline."""
    if len(polyline) < 2:
        return (polyline[0], 0.0) if polyline else ((0.0, 0.0), 0.0)
    fraction = min(max(fraction, 0.0), 1.0)
    legs = []
    total = 0.0
    for a, b in pairwise(polyline):
        d = haversine_m(a[1], a[0], b[1], b[0])
        legs.append((a, b, d))
        total += d
    if total == 0.0:
        return polyline[0], 0.0
    target = fraction * total
    walked = 0.0
    for a, b, d in legs:
        if walked + d >= target or d == 0.0:
            t = 0.0 if d == 0.0 else (target - walked) / d
            point = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            return point, bearing_deg(a[1], a[0], b[1], b[0])
        walked += d
    a, b, _ = legs[-1]
    return b, bearing_deg(a[1], a[0], b[1], b[0])
