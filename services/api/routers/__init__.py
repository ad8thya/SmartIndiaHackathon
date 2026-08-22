"""One router per domain, so M5 is never blocked on their own merge conflicts."""

from __future__ import annotations

from . import analytics, events, fleet, health, incidents, roads, routes, whatif, ws

ALL_ROUTERS = (
    health.router,
    fleet.router,
    routes.router,
    events.router,
    roads.router,
    whatif.router,
    incidents.router,
    analytics.router,
    ws.router,
)

__all__ = ["ALL_ROUTERS"]
