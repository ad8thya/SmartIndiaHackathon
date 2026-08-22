"""URBAN TWIN persistence layer. Owned by M5 (Platform).

    from db import Event, Observation, get_session, point

PostGIS notes that matter to everyone:
  * geometry columns are ``Geography(POINT, 4326)`` → distances are in METRES
  * ``point(lat, lon)`` takes human order and emits correct ``POINT(lon lat)``
  * every geom column has a GIST index; see ``models.py`` for the btree set
"""

from __future__ import annotations

from .base import Base, TimestampMixin
from .config import DbSettings, get_db_settings
from .geo import linestring, point, to_lonlat, to_lonlat_list
from .models import (
    Bus,
    BusPosition,
    Event,
    EventObservation,
    Incident,
    Observation,
    Route,
    SchoolZone,
    WorkOrder,
)
from .session import (
    dispose_engine,
    get_engine,
    get_session,
    get_sessionmaker,
    session_scope,
)

__all__ = [
    "Base",
    "Bus",
    "BusPosition",
    "DbSettings",
    "Event",
    "EventObservation",
    "Incident",
    "Observation",
    "Route",
    "SchoolZone",
    "TimestampMixin",
    "WorkOrder",
    "dispose_engine",
    "get_db_settings",
    "get_engine",
    "get_session",
    "get_sessionmaker",
    "linestring",
    "point",
    "session_scope",
    "to_lonlat",
    "to_lonlat_list",
]
