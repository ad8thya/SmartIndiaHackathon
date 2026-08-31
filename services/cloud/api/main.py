"""FastAPI application. Owned by M5.

    uvicorn services.cloud.api.main:app --reload

Everything module-specific is reached through a factory, never a direct import
of somebody's implementation. That is the whole reason six people can work on
this at once.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from contracts import WSMessageType
from contracts import __version__ as contracts_version
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_api_settings
from .fusion_loop import FusionLoop
from .hub import Repeater, broadcaster, state
from .mqtt_bridge import MqttBridge
from .routers import ALL_ROUTERS
from .spa import find_dist, mount_map, mount_mobile, mount_spa

settings = get_api_settings()
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(levelname)-7s %(name)s │ %(message)s",
)
log = logging.getLogger("urban-twin.api")

#: read by routers/health.py — module-level so it can be introspected
mqtt_bridge: MqttBridge | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global mqtt_bridge

    log.info("URBAN TWIN api starting (contracts v%s)", contracts_version)
    state.observations = type(state.observations)(maxlen=settings.OBSERVATION_BUFFER)

    mqtt_bridge = MqttBridge(settings, state, broadcaster)
    mqtt_bridge.start(asyncio.get_running_loop())

    fusion = FusionLoop(settings, state, broadcaster)
    fusion_task = Repeater(settings.FUSION_INTERVAL_SECONDS, fusion.tick, "fusion")
    fusion_task.start()

    async def heartbeat() -> None:
        broadcaster.publish(
            WSMessageType.TICK,
            {
                "server_time": datetime.now(tz=UTC).isoformat(),
                "buses": len(state.buses),
                "events": len(state.events),
                "subscribers": broadcaster.subscriber_count,
            },
        )

    tick_task = Repeater(settings.WS_TICK_SECONDS, heartbeat, "tick")
    tick_task.start()

    try:
        yield
    finally:
        log.info("URBAN TWIN api shutting down")
        await tick_task.stop()
        await fusion_task.stop()
        if mqtt_bridge is not None:
            mqtt_bridge.stop()
        from db import dispose_engine

        await dispose_engine()


app = FastAPI(
    title="URBAN TWIN API",
    version="0.1.0",
    description=(
        "Public transport buses as mobile sensors feeding a live urban Digital Twin.\n\n"
        "Every module-specific response comes from a factory "
        "(`USE_REAL_*` env flags choose mock or real), so the API surface is "
        "stable while six people swap implementations underneath it."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in ALL_ROUTERS:
    app.include_router(router)


# The basemap first, and unconditionally. It belongs to no frontend — see
# spa.py::mount_map — so it must not depend on either dist existing.
mount_map(app, settings.MAP_DIR)

_web_dist = find_dist(settings.WEB_DIST)
_mobile_dist = find_dist(settings.MOBILE_DIST, container_path="/app/mobile")

# The mobile app claims /m before any SPA claims everything else. Order is
# load-bearing: mount_spa's catch-all matches every path there is.
if _mobile_dist is not None:
    mount_mobile(app, _mobile_dist)

if _web_dist is None:

    @app.get("/", include_in_schema=False)
    async def root() -> JSONResponse:
        """Dev mode: Vite owns the UI on :5173, so `/` is just a signpost."""
        return JSONResponse(
            {
                "name": "URBAN TWIN API",
                "contracts": contracts_version,
                "docs": "/docs",
                "health": "/health",
                "websocket": "/ws/live",
                "ui": "run `make dev` — the frontend is served by vite on :5173",
            }
        )
else:
    # production: one container, one port, API and UI together. Mounted last
    # so the catch-all cannot shadow a router registered above it.
    mount_spa(app, _web_dist)
