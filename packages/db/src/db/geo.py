"""Small helpers so nobody has to remember WKT ordering under pressure."""

from __future__ import annotations

from typing import Any

from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape

__all__ = ["linestring", "point", "to_lonlat", "to_lonlat_list"]

SRID = 4326


def point(lat: float, lon: float) -> WKTElement:
    """Build a POINT. Note the argument order: **lat first, lon second**.

    WKT itself is ``POINT(lon lat)`` — the swap is the single most common bug in
    a geo codebase, so this function takes the human order and does the flip.
    """
    return WKTElement(f"POINT({lon} {lat})", srid=SRID)


def linestring(coords: list[tuple[float, float]]) -> WKTElement:
    """Build a LINESTRING from GeoJSON-order ``(lon, lat)`` pairs."""
    body = ", ".join(f"{lon} {lat}" for lon, lat in coords)
    return WKTElement(f"LINESTRING({body})", srid=SRID)


def to_lonlat(geom: Any) -> tuple[float, float]:
    """Read a stored POINT back as ``(lon, lat)``."""
    shape = to_shape(geom)
    return (float(shape.x), float(shape.y))


def to_lonlat_list(geom: Any) -> list[tuple[float, float]]:
    """Read a stored LINESTRING back as a list of ``(lon, lat)``."""
    shape = to_shape(geom)
    return [(float(x), float(y)) for x, y in shape.coords]
