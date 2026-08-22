"""Async alembic environment with PostGIS guard rails. Owned by M5.

Two things here are not boilerplate and must not be deleted:

1. ``import geoalchemy2`` — without it, autogenerate emits
   ``sa.Column('geom', sa.NullType())`` and your spatial columns quietly become
   untyped.

2. ``include_object`` — PostGIS installs its own tables and views
   (``spatial_ref_sys``, ``geometry_columns``, …) into the same schema. They are
   not in our metadata, so autogenerate will cheerfully write
   ``op.drop_table('spatial_ref_sys')`` and destroy the extension on upgrade.
   The hook below filters them out.
"""

from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path
from typing import Any

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

ROOT = Path(__file__).resolve().parents[5]
for extra in ("packages/contracts/src", "packages/db/src", "."):
    candidate = str(ROOT / extra)
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

import geoalchemy2  # noqa: F401,E402  ← REQUIRED: registers Geography/Geometry types

from db import models as _models  # noqa: F401,E402  ← imports every table
from db.base import Base  # noqa: E402
from db.config import get_db_settings  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Objects PostGIS owns. Autogenerate WILL try to drop these — do not remove.
POSTGIS_TABLES = {
    "spatial_ref_sys",
    "geography_columns",
    "geometry_columns",
    "raster_columns",
    "raster_overviews",
    "topology",
    "layer",
    "us_gaz",
    "us_lex",
    "us_rules",
}
POSTGIS_INDEX_PREFIXES = ("idx_", "spatial_ref_sys")


def _database_url() -> str:
    return os.getenv("DATABASE_URL") or get_db_settings().async_url


def include_object(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    """Keep PostGIS's own furniture out of our migrations."""
    if name is None:
        return True
    if type_ == "table" and name in POSTGIS_TABLES:
        return False
    if type_ == "index" and reflected and name.startswith(POSTGIS_INDEX_PREFIXES):
        return False
    return not (type_ == "column" and getattr(obj.table, "name", None) in POSTGIS_TABLES)


def _configure(connection: Connection | None = None, **extra: Any) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        include_schemas=False,
        compare_type=True,
        compare_server_default=True,
        render_as_batch=False,
        **extra,
    )


def run_migrations_offline() -> None:
    _configure(
        url=_database_url().replace("+asyncpg", "+psycopg2"),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    _configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    section = config.get_section(config.config_ini_section, {}) or {}
    section["sqlalchemy.url"] = _database_url()
    connectable = async_engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
