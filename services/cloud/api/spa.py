"""Serve the built frontend from the API process. Owned by M5.

In development the Vite dev server owns the UI on :5173 and this does nothing —
`WEB_DIST` will not exist, `mount_spa` returns False, and `/` keeps returning
the little JSON banner it always has.

In production there is **one container on one port**: the multi-stage
Dockerfile builds `apps/web` and copies `dist/` here, and every non-API path
falls through to `index.html` so the client router can handle `/field`,
`/app/citizen` and the rest. Without that fallback a browser refresh on any
route but `/` returns a 404 from FastAPI, which is the classic way an SPA
looks broken only after it is deployed.

Range requests matter here and are not optional: `chennai.pmtiles` is ~17 MB
and the pmtiles client fetches byte ranges out of it. Starlette's StaticFiles
handles `Range` correctly, which is why the map is served through it rather
than through a hand-rolled FileResponse.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

log = logging.getLogger("urban-twin.api.spa")

#: paths the SPA fallback must never swallow
API_PREFIXES = ("/api", "/health", "/ws", "/docs", "/redoc", "/openapi.json")


def find_dist(explicit: str | None = None) -> Path | None:
    """Locate the built frontend, or None when running against a dev server.

    A local `apps/web/dist` is deliberately **not** auto-detected: during
    `make dev` vite owns the UI, and quietly serving a stale build from a
    previous `npm run build` at :8000 is a genuinely confusing way to lose an
    afternoon. Set `WEB_DIST` to serve it from a source checkout on purpose.
    """
    if explicit:
        candidate = Path(explicit)
        return candidate if (candidate / "index.html").is_file() else None
    # the container: the Dockerfile copies the build here
    container = Path("/app/web")
    return container if (container / "index.html").is_file() else None


def mount_spa(app: FastAPI, dist: Path) -> None:
    """Serve `dist` at the root, with a client-side-routing fallback."""
    index = dist / "index.html"

    # hashed build assets: immutable, so they can be cached hard
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    # map tiles, glyphs, sprites and the building footprints. StaticFiles is
    # what gives us HTTP Range, which pmtiles requires.
    for public in ("map", "data"):
        directory = dist / public
        if directory.is_dir():
            app.mount(f"/{public}", StaticFiles(directory=directory), name=public)

    root = dist.resolve()

    # Deliberately `def`, not `async def`: it stats the filesystem, and
    # Starlette runs sync handlers in a threadpool rather than blocking the
    # event loop on every 404.
    # response_model=None: the union return type is a Response, not a schema.
    @app.get("/{full_path:path}", include_in_schema=False, response_model=None)
    def spa_fallback(request: Request, full_path: str) -> FileResponse | JSONResponse:
        if ("/" + full_path).startswith(API_PREFIXES):
            # a genuinely unknown API route — say so, rather than handing back
            # an HTML page that the caller will fail to parse as JSON
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        # a real file (favicon, manifest, robots.txt…) wins over the fallback.
        # is_relative_to keeps `../` out of the served tree.
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)

        return FileResponse(index)

    log.info("serving the frontend from %s", dist)
