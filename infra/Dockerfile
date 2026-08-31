# ─────────────────────────────────────────────────────────────────────────────
#  URBAN TWIN — one image, one port, API + the phone app.
#
#  Stage 1 builds apps/mobile with vite. Stage 2 installs the python side and
#  copies the build in, so FastAPI serves the static files itself (see
#  services/cloud/api/spa.py). No nginx, no second container, no CORS: the UI
#  and the API are the same origin.
#
#      apps/mobile → /m       the phone app
#      assets/map  → /map     the offline basemap, mounted unconditionally
#
#  The desktop console moved to its own repository. `WEB_DIST` still exists
#  and still works — point it at a console build and it is served at `/` — but
#  nothing in this image provides one.
#
#      docker build -f infra/Dockerfile -t urban-twin .
#      docker run -p 8000:8000 urban-twin
# ─────────────────────────────────────────────────────────────────────────────

# ── stage 1: the phone app ───────────────────────────────────────────────────
FROM node:20-slim AS mobile

WORKDIR /mobile
COPY apps/mobile/package.json apps/mobile/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY apps/mobile/ ./
# public/map is a symlink to ../../../assets/map, which is outside this build
# context. The build drops dist/map anyway — the API serves /map from MAP_DIR
# — but a dangling symlink would break vite's publicDir copy before it got
# that far.
RUN rm -f public/map

ARG VITE_API_BASE_URL
ARG VITE_WS_URL
# /m/, matching spa.py's mount. Baked in at build time — vite resolves `base`
# into every asset URL in the bundle, so it cannot be changed at runtime.
ENV VITE_BASE=/m/
RUN npm run build

# ── stage 2: the API, serving that build and the basemap ─────────────────────
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY packages ./packages
COPY services ./services
COPY scripts ./scripts

# core deps only — the [ml] extra belongs in a perception owner's own venv,
# and pulling torch into the demo image would add gigabytes for nothing
RUN pip install --upgrade pip && pip install -e .

# The built phone app. spa.py finds it at /app/mobile with no configuration.
COPY --from=mobile /mobile/dist /app/mobile

# The basemap, as its own layer. 17 MB that changes about never, so a code
# change must not invalidate it. `/app/assets/map` is MAP_DIR's default,
# relative to WORKDIR.
COPY assets ./assets

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "services.cloud.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
