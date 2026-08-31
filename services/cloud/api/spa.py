"""Serve the built frontend from the API process. Owned by M5.

In development the Vite dev server owns the UI on :5173 and this does nothing —
`WEB_DIST` will not exist, `mount_spa` returns False, and `/` keeps returning
the little JSON banner it always has.

In production there is **one container on one port**: the multi-stage
Dockerfile builds `apps/mobile` and copies `dist/` here, and every non-API path
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


def find_dist(explicit: str | None = None, *, container_path: str = "/app/web") -> Path | None:
    """Locate a built frontend, or None when running against a dev server.

    A local `dist/` is deliberately **not** auto-detected: during
    `make dev` vite owns the UI, and quietly serving a stale build from a
    previous `npm run build` at :8000 is a genuinely confusing way to lose an
    afternoon. Set `WEB_DIST` to serve it from a source checkout on purpose.
    """
    if explicit:
        candidate = Path(explicit)
        return candidate if (candidate / "index.html").is_file() else None
    # the container: the Dockerfile copies the build here
    container = Path(container_path)
    return container if (container / "index.html").is_file() else None


def mount_map(app: FastAPI, map_dir: str) -> bool:
    """Serve the offline basemap at `/map`, independently of any frontend.

    This is mounted **unconditionally** and from its own setting, not from
    `WEB_DIST` and not inside `mount_spa` or `mount_mobile`. That is the whole
    point of it existing:

    The tiles used to be part of apps/web's build output, so `/map` only
    existed when the desktop console was deployed — which made the *phone*
    app's map silently depend on the *desktop* app being present. Deleting
    apps/web produced an app that loaded fine and served 404 for every tile,
    glyph and sprite, with nothing in the logs to explain it.

    `StaticFiles` rather than a hand-rolled handler because it implements HTTP
    Range. The pmtiles protocol reads byte slices out of a 17 MB archive; a
    server that answers 200-with-the-whole-file instead of 206-with-the-slice
    turns the map into a 17 MB download on every pan.

    Returns whether it mounted, so startup can log the difference between "no
    basemap configured" and "basemap missing from disk" — those look identical
    from the browser and very different to whoever has to fix it.
    """
    directory = Path(map_dir)
    if not directory.is_dir():
        log.warning(
            "no basemap at %s — /map will 404 and every map screen will render "
            "empty. Set MAP_DIR, or check that assets/map survived the clone.",
            directory,
        )
        return False

    app.mount("/map", StaticFiles(directory=directory), name="map")
    log.info("serving the basemap from %s at /map", directory)
    return True


def mount_mobile(app: FastAPI, dist: Path) -> None:
    """Serve the mobile app under /m, with its own client-routing fallback.

    Registered **before** `mount_spa` so that `/m/...` is matched here rather
    than swallowed by the root SPA's catch-all — Starlette resolves routes in
    registration order, and the root catch-all matches literally everything.

    Note what is deliberately *not* mounted: `/map` and `/data`. The mobile
    build ships no basemap of its own (see apps/mobile/vite.config.ts) — it
    reads `/map`, which `mount_map` serves from MAP_DIR — so there is one
    extract in the image rather than two, and it does not depend on any
    frontend build being present.
    """
    index = dist / "index.html"

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/m/assets", StaticFiles(directory=assets), name="mobile-assets")

    icons = dist / "icons"
    if icons.is_dir():
        app.mount("/m/icons", StaticFiles(directory=icons), name="mobile-icons")

    root = dist.resolve()

    @app.get("/m", include_in_schema=False, response_model=None)
    @app.get("/m/{full_path:path}", include_in_schema=False, response_model=None)
    def mobile_fallback(request: Request, full_path: str = "") -> FileResponse:
        # A real file — sw.js, manifest.webmanifest — wins over the fallback.
        # The service worker in particular MUST be served as itself: hand it
        # index.html and registration fails with a content-type error that
        # says nothing about what actually went wrong.
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)

    log.info("serving the mobile app from %s at /m", dist)


def mount_spa(app: FastAPI, dist: Path) -> None:
    """Serve `dist` at the root, with a client-side-routing fallback."""
    index = dist / "index.html"

    # hashed build assets: immutable, so they can be cached hard
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    # The building footprints. NOT the basemap: `/map` is mounted by
    # `mount_map` from its own setting, because two clients read it and this
    # one does not own it. Mounting it here as well would shadow that mount
    # depending on registration order, and re-couple the phone's map to the
    # desktop build being present.
    data = dist / "data"
    if data.is_dir():
        app.mount("/data", StaticFiles(directory=data), name="data")

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
