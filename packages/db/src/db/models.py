"""SQLAlchemy 2.0 typed ORM models. Owned by M5.

Geometry columns are ``Geography(POINT, 4326)`` rather than ``Geometry``. That
choice matters: with Geography, ``ST_DWithin(a, b, 25)`` means *25 metres* and
works correctly across Chennai's latitude without reprojecting to a UTM zone.
With Geometry the same call would mean 25 *degrees* and silently match half of
south India.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

POINT = Geography(geometry_type="POINT", srid=4326, spatial_index=False)
LINESTRING = Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False)


class Route(Base, TimestampMixin):
    __tablename__ = "routes"

    route_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    geom: Mapped[object] = mapped_column(LINESTRING, nullable=False)
    stops: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#38bdf8", nullable=False)
    length_km: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    buses: Mapped[list[Bus]] = relationship(back_populates="route")

    __table_args__ = (Index("ix_routes_geom", "geom", postgresql_using="gist"),)


class Bus(Base, TimestampMixin):
    __tablename__ = "buses"

    bus_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    route_id: Mapped[str | None] = mapped_column(
        ForeignKey("routes.route_id", ondelete="SET NULL"), nullable=True
    )
    depot: Mapped[str] = mapped_column(String(64), nullable=False, default="UNKNOWN")
    #: AIS-140 compliant vehicle tracking unit serial
    device_serial: Mapped[str | None] = mapped_column(String(64), nullable=True)
    camera_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    route: Mapped[Route | None] = relationship(back_populates="buses")
    positions: Mapped[list[BusPosition]] = relationship(back_populates="bus")


class BusPosition(Base):
    __tablename__ = "bus_positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bus_id: Mapped[str] = mapped_column(
        ForeignKey("buses.bus_id", ondelete="CASCADE"), nullable=False
    )
    route_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    geom: Mapped[object] = mapped_column(POINT, nullable=False)
    heading_deg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    speed_kmph: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    occupancy_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    next_stop: Mapped[str | None] = mapped_column(String(128), nullable=True)
    delay_min: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    bus: Mapped[Bus] = relationship(back_populates="positions")

    __table_args__ = (
        Index("ix_bus_positions_geom", "geom", postgresql_using="gist"),
        # "where is bus X right now" is the single hottest query in the system
        Index("ix_bus_positions_bus_ts", "bus_id", ts.desc()),
        Index("ix_bus_positions_ts", "ts"),
    )


class Observation(Base):
    """Raw, unverified detections. High volume, append only, never shown to a human."""

    __tablename__ = "observations"

    obs_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    bus_id: Mapped[str] = mapped_column(String(32), nullable=False)
    route_id: Mapped[str] = mapped_column(String(16), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    geom: Mapped[object] = mapped_column(POINT, nullable=False)
    gps_accuracy_m: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    heading_deg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    speed_kmph: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    detection_class: Mapped[str] = mapped_column(String(32), nullable=False)
    raw_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    bbox: Mapped[dict[str, float] | None] = mapped_column(JSONB, nullable=True)
    evidence_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: DPDP Act 2023 — salted sha256 only. The raw plate never lands in a row.
    plate_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    track_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reid_embedding: Mapped[list[float] | None] = mapped_column(ARRAY(Float), nullable=True)

    __table_args__ = (
        CheckConstraint("raw_confidence >= 0 AND raw_confidence <= 1", name="confidence_range"),
        Index("ix_observations_geom", "geom", postgresql_using="gist"),
        Index("ix_observations_ts", "ts"),
        Index("ix_observations_bus_id", "bus_id"),
        Index("ix_observations_class_ts", "detection_class", "ts"),
        Index("ix_observations_plate_hash", "plate_hash"),
    )


class Event(Base, TimestampMixin):
    """Fused, corroborated, human-facing. This is what the map and the crews see."""

    __tablename__ = "events"

    event_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    geom: Mapped[object] = mapped_column(POINT, nullable=False)
    road_segment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detection_class: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    fused_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    observation_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    distinct_bus_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="DETECTED", nullable=False)
    assigned_team: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sla_due: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence_uris: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)

    observations: Mapped[list[EventObservation]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    work_orders: Mapped[list[WorkOrder]] = relationship(back_populates="event")

    __table_args__ = (
        Index("ix_events_geom", "geom", postgresql_using="gist"),
        Index("ix_events_status", "status"),
        Index("ix_events_class_status", "detection_class", "status"),
        Index("ix_events_last_seen", "last_seen"),
        Index("ix_events_road_segment_id", "road_segment_id"),
    )


class EventObservation(Base):
    """Join table: the audit trail from a fused Event back to its raw evidence."""

    __tablename__ = "event_observations"

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), primary_key=True
    )
    obs_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("observations.obs_id", ondelete="CASCADE"), primary_key=True
    )
    contribution: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)

    event: Mapped[Event] = relationship(back_populates="observations")

    # NOTE: no UniqueConstraint here. (event_id, obs_id) is already the composite
    # primary key, so a UNIQUE on the same pair is a second identical index for
    # nothing — and declaring it made `alembic revision --autogenerate` emit a
    # spurious create_unique_constraint on every run.


class WorkOrder(Base, TimestampMixin):
    __tablename__ = "work_orders"

    work_order_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False
    )
    assigned_team: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="MAINTENANCE_ASSIGNED", nullable=False)
    sla_due: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_estimate_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    before_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_uri: Mapped[str | None] = mapped_column(Text, nullable=True)

    event: Mapped[Event] = relationship(back_populates="work_orders")

    __table_args__ = (
        Index("ix_work_orders_event_id", "event_id"),
        Index("ix_work_orders_status", "status"),
        Index("ix_work_orders_sla_due", "sla_due"),
    )


class Incident(Base, TimestampMixin):
    __tablename__ = "incidents"

    incident_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    incident_class: Mapped[str] = mapped_column(String(32), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    geom: Mapped[object] = mapped_column(POINT, nullable=False)
    road_segment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reported_by_bus: Mapped[str] = mapped_column(String(32), nullable=False)
    narrative: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    track_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    #: NOTE: there is deliberately no plate_text column. Raw plates are shown to
    #: an authorised operator in the live dossier and are never persisted.
    plate_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    plate_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence_uris: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)

    __table_args__ = (
        Index("ix_incidents_geom", "geom", postgresql_using="gist"),
        Index("ix_incidents_ts", "ts"),
        Index("ix_incidents_class", "incident_class"),
        Index("ix_incidents_plate_hash", "plate_hash"),
    )


class SchoolZone(Base):
    """Static geofences M3 uses to raise the pedestrian risk weighting."""

    __tablename__ = "school_zones"

    zone_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    geom: Mapped[object] = mapped_column(POINT, nullable=False)
    radius_m: Mapped[float] = mapped_column(Float, default=150.0, nullable=False)
    active_hours: Mapped[str] = mapped_column(String(32), default="07:30-16:30", nullable=False)

    __table_args__ = (Index("ix_school_zones_geom", "geom", postgresql_using="gist"),)


__all__ = [
    "Base",
    "Bus",
    "BusPosition",
    "Event",
    "EventObservation",
    "Incident",
    "Observation",
    "Route",
    "SchoolZone",
    "WorkOrder",
]
