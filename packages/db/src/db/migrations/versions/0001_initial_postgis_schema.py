"""initial schema — postgis extension, all tables, all indexes

Revision ID: 0001
Revises:
Create Date: 2026-08-21

The very first statement is CREATE EXTENSION postgis. Everything after it
depends on the Geography type existing, so this cannot be reordered.

This file mirrors db/models.py EXACTLY. The ORM is the source of truth: if the
two drift, `alembic revision --autogenerate` stops producing empty migrations
and every subsequent `make revision` carries dozens of spurious ALTERs that
somebody will eventually apply by accident. The only server_defaults here are
on created_at/updated_at, and the ORM declares those too.
"""

from __future__ import annotations

from collections.abc import Sequence

import geoalchemy2  # noqa: F401  ← keep: registers spatial types
import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

POINT = Geography(geometry_type="POINT", srid=4326, spatial_index=False)
LINESTRING = Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False)


def upgrade() -> None:
    # ── extensions ──────────────────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ── routes ──────────────────────────────────────────────────────────────
    op.create_table(
        "routes",
        sa.Column("route_id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("geom", LINESTRING, nullable=False),
        sa.Column("stops", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.Column("length_km", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_routes_geom", "routes", ["geom"], postgresql_using="gist")

    # ── buses ───────────────────────────────────────────────────────────────
    op.create_table(
        "buses",
        sa.Column("bus_id", sa.String(32), primary_key=True),
        sa.Column(
            "route_id",
            sa.String(16),
            sa.ForeignKey("routes.route_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("depot", sa.String(64), nullable=False),
        sa.Column("device_serial", sa.String(64), nullable=True),
        sa.Column("camera_count", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ── bus_positions ───────────────────────────────────────────────────────
    op.create_table(
        "bus_positions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "bus_id",
            sa.String(32),
            sa.ForeignKey("buses.bus_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("route_id", sa.String(16), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("geom", POINT, nullable=False),
        sa.Column("heading_deg", sa.Float(), nullable=False),
        sa.Column("speed_kmph", sa.Float(), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("occupancy_pct", sa.Float(), nullable=False),
        sa.Column("next_stop", sa.String(128), nullable=True),
        sa.Column("delay_min", sa.Float(), nullable=False),
    )
    op.create_index("ix_bus_positions_geom", "bus_positions", ["geom"], postgresql_using="gist")
    op.create_index("ix_bus_positions_ts", "bus_positions", ["ts"])
    # "latest position per bus" — the hottest query in the system
    op.execute(
        "CREATE INDEX ix_bus_positions_bus_ts ON bus_positions (bus_id, ts DESC)"
    )

    # ── observations ────────────────────────────────────────────────────────
    op.create_table(
        "observations",
        sa.Column("obs_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("bus_id", sa.String(32), nullable=False),
        sa.Column("route_id", sa.String(16), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("geom", POINT, nullable=False),
        sa.Column("gps_accuracy_m", sa.Float(), nullable=False),
        sa.Column("heading_deg", sa.Float(), nullable=False),
        sa.Column("speed_kmph", sa.Float(), nullable=False),
        sa.Column("detection_class", sa.String(32), nullable=False),
        sa.Column("raw_confidence", sa.Float(), nullable=False),
        sa.Column("severity", sa.String(16), nullable=True),
        sa.Column("bbox", postgresql.JSONB(), nullable=True),
        sa.Column("evidence_uri", sa.Text(), nullable=True),
        sa.Column("plate_hash", sa.String(64), nullable=True),
        sa.Column("track_id", sa.Integer(), nullable=True),
        sa.Column("reid_embedding", postgresql.ARRAY(sa.Float()), nullable=True),
        # bare name: the metadata naming_convention expands it to
        # ck_observations_confidence_range. Passing the expanded name here
        # produced ck_observations_ck_observations_confidence_range.
        sa.CheckConstraint(
            "raw_confidence >= 0 AND raw_confidence <= 1", name="confidence_range"
        ),
    )
    op.create_index("ix_observations_geom", "observations", ["geom"], postgresql_using="gist")
    op.create_index("ix_observations_ts", "observations", ["ts"])
    op.create_index("ix_observations_bus_id", "observations", ["bus_id"])
    op.create_index("ix_observations_class_ts", "observations", ["detection_class", "ts"])
    op.create_index("ix_observations_plate_hash", "observations", ["plate_hash"])

    # ── events ──────────────────────────────────────────────────────────────
    op.create_table(
        "events",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("geom", POINT, nullable=False),
        sa.Column("road_segment_id", sa.String(64), nullable=True),
        sa.Column("detection_class", sa.String(32), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("fused_confidence", sa.Float(), nullable=False),
        sa.Column("observation_count", sa.Integer(), nullable=False),
        sa.Column("distinct_bus_count", sa.Integer(), nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("assigned_team", sa.String(64), nullable=True),
        sa.Column("sla_due", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "evidence_uris", postgresql.ARRAY(sa.Text()), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_events_geom", "events", ["geom"], postgresql_using="gist")
    op.create_index("ix_events_status", "events", ["status"])
    op.create_index("ix_events_class_status", "events", ["detection_class", "status"])
    op.create_index("ix_events_last_seen", "events", ["last_seen"])
    op.create_index("ix_events_road_segment_id", "events", ["road_segment_id"])

    # ── event_observations ──────────────────────────────────────────────────
    op.create_table(
        "event_observations",
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.event_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "obs_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("observations.obs_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("contribution", sa.Float(), nullable=False),
        # (event_id, obs_id) is already the composite PK — no UNIQUE needed
    )

    # ── work_orders ─────────────────────────────────────────────────────────
    op.create_table(
        "work_orders",
        sa.Column("work_order_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.event_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("assigned_team", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("sla_due", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("cost_estimate_inr", sa.Float(), nullable=True),
        sa.Column("before_uri", sa.Text(), nullable=True),
        sa.Column("after_uri", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_work_orders_event_id", "work_orders", ["event_id"])
    op.create_index("ix_work_orders_status", "work_orders", ["status"])
    op.create_index("ix_work_orders_sla_due", "work_orders", ["sla_due"])

    # ── incidents ───────────────────────────────────────────────────────────
    op.create_table(
        "incidents",
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("incident_class", sa.String(32), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("geom", POINT, nullable=False),
        sa.Column("road_segment_id", sa.String(64), nullable=True),
        sa.Column("reported_by_bus", sa.String(32), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=True),
        sa.Column("vehicle_type", sa.String(32), nullable=True),
        # deliberately no plate_text column — DPDP Act 2023 data minimisation
        sa.Column("plate_hash", sa.String(64), nullable=True),
        sa.Column("plate_confidence", sa.Float(), nullable=True),
        sa.Column(
            "evidence_uris", postgresql.ARRAY(sa.Text()), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_incidents_geom", "incidents", ["geom"], postgresql_using="gist")
    op.create_index("ix_incidents_ts", "incidents", ["ts"])
    op.create_index("ix_incidents_class", "incidents", ["incident_class"])
    op.create_index("ix_incidents_plate_hash", "incidents", ["plate_hash"])

    # ── school_zones ────────────────────────────────────────────────────────
    op.create_table(
        "school_zones",
        sa.Column("zone_id", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("geom", POINT, nullable=False),
        sa.Column("radius_m", sa.Float(), nullable=False),
        sa.Column("active_hours", sa.String(32), nullable=False),
    )
    op.create_index("ix_school_zones_geom", "school_zones", ["geom"], postgresql_using="gist")


def downgrade() -> None:
    for table in (
        "school_zones",
        "incidents",
        "work_orders",
        "event_observations",
        "events",
        "observations",
        "bus_positions",
        "buses",
        "routes",
    ):
        op.drop_table(table)
    # postgis itself is left installed on purpose — other databases in the
    # cluster may be using it, and reinstalling is expensive.
