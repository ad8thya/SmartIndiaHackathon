"""GET /health — one boolean per dependency. Owned by M5."""

from __future__ import annotations

import logging

import contracts
from contracts import HealthStatus
from fastapi import APIRouter
from sqlalchemy import text

from ..deps import Settings, State

log = logging.getLogger("urban-twin.health")
router = APIRouter(tags=["ops"])


@router.get("/health", response_model=HealthStatus, summary="Dependency status")
async def health(settings: Settings, state: State) -> HealthStatus:
    detail: dict[str, str] = {}

    database, postgis = await _check_postgres(detail)
    redis_ok = await _check_redis(settings.REDIS_URL, detail)
    mqtt_ok = _check_mqtt(detail)

    # The wire-contract version this API was built against. Clients compare it
    # to the `CONTRACTS_VERSION` they compiled with — see
    # scripts/check_contracts_version.py. It goes in `detail` rather than as a
    # new HealthStatus field because contracts is frozen and this needs no
    # amendment to work; `version` above is the app's, not the schema's.
    detail["contracts_version"] = getattr(contracts, "__version__", "unknown")

    detail["buses_tracked"] = str(len(state.buses))
    detail["events_cached"] = str(len(state.events))
    detail["observations_buffered"] = str(len(state.observations))

    return HealthStatus(
        ok=all((database, postgis, redis_ok, mqtt_ok)),
        database=database,
        postgis=postgis,
        redis=redis_ok,
        mqtt=mqtt_ok,
        detail=detail,
    )


async def _check_postgres(detail: dict[str, str]) -> tuple[bool, bool]:
    try:
        from db import session_scope

        async with session_scope() as session:
            await session.execute(text("SELECT 1"))
            version = await session.scalar(text("SELECT postgis_version()"))
        detail["postgis_version"] = str(version)
        return True, version is not None
    except Exception as exc:
        detail["database_error"] = f"{type(exc).__name__}: {exc}"[:200]
        return False, False


async def _check_redis(url: str, detail: dict[str, str]) -> bool:
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(url)
        try:
            await client.ping()
            return True
        finally:
            await client.aclose()
    except Exception as exc:
        detail["redis_error"] = f"{type(exc).__name__}: {exc}"[:200]
        return False


def _check_mqtt(detail: dict[str, str]) -> bool:
    from ..main import mqtt_bridge

    if mqtt_bridge is None:
        detail["mqtt_error"] = "bridge not started"
        return False
    if not mqtt_bridge.connected:
        detail["mqtt_error"] = "not connected"
    return mqtt_bridge.connected
