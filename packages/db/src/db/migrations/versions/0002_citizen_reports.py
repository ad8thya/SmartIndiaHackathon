"""citizen reports table

Revision ID: 56c90828b22d
Revises: 0001
Create Date: 2026-08-31 10:53:04.514420
"""

from __future__ import annotations

from collections.abc import Sequence

import geoalchemy2  # noqa: F401  ← keep: registers spatial types for this script
import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('citizen_reports',
    sa.Column('report_id', sa.UUID(), nullable=False),
    sa.Column('category', sa.String(length=32), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('geom', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
    sa.Column('address', sa.String(length=300), nullable=False),
    sa.Column('photo_uri', sa.Text(), nullable=True),
    sa.Column('reporter_name', sa.String(length=120), nullable=False),
    sa.Column('ward', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('linked_event_id', sa.UUID(), nullable=True),
    sa.ForeignKeyConstraint(['linked_event_id'], ['events.event_id'], name=op.f('fk_citizen_reports_linked_event_id_events'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('report_id', name=op.f('pk_citizen_reports'))
    )
    op.create_index('ix_citizen_reports_created_at', 'citizen_reports', ['created_at'], unique=False)
    op.create_index('ix_citizen_reports_geom', 'citizen_reports', ['geom'], unique=False, postgresql_using='gist')
    op.create_index('ix_citizen_reports_linked_event_id', 'citizen_reports', ['linked_event_id'], unique=False)
    op.create_index('ix_citizen_reports_status', 'citizen_reports', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_citizen_reports_status', table_name='citizen_reports')
    op.drop_index('ix_citizen_reports_linked_event_id', table_name='citizen_reports')
    op.drop_index('ix_citizen_reports_geom', table_name='citizen_reports', postgresql_using='gist')
    op.drop_index('ix_citizen_reports_created_at', table_name='citizen_reports')
    op.drop_table('citizen_reports')
