"""GET /api/routes — route geometry as GeoJSON. Owned by M5.

Served from ``citydata`` rather than postgres: the geometry is static, the map
asks for it on every page load, and it must render before the database is up.
"""

from __future__ import annotations

from typing import Any

from citydata import ROUTES, route_by_id
from contracts import Route
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["routes"])


def _to_feature(route_id: str) -> dict[str, Any]:
    spec = route_by_id(route_id)
    return {
        "type": "Feature",
        "id": spec.route_id,
        "geometry": {
            "type": "LineString",
            "coordinates": [list(point) for point in spec.polyline],
        },
        "properties": {
            "route_id": spec.route_id,
            "name": spec.name,
            "color": spec.color,
            "stops": spec.stops,
            "length_km": spec.length_km,
        },
    }


@router.get("/routes", summary="All routes as a GeoJSON FeatureCollection")
async def all_routes() -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [_to_feature(route.route_id) for route in ROUTES],
    }


@router.get("/routes/list", response_model=list[Route], summary="Routes as contract models")
async def route_models() -> list[Route]:
    return [
        Route(
            route_id=route.route_id,
            name=route.name,
            polyline=route.polyline,
            stops=route.stops,
            color=route.color,
            length_km=route.length_km,
        )
        for route in ROUTES
    ]


@router.get("/routes/{route_id}", summary="One route as a GeoJSON Feature")
async def one_route(route_id: str) -> dict[str, Any]:
    try:
        return _to_feature(route_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"unknown route {route_id}") from exc
