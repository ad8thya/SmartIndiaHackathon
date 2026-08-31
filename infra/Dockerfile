# ─────────────────────────────────────────────────────────────────────────────
#  URBAN TWIN — one image, one port, API + both UIs.
#
#  Stages 1 and 2 build apps/web and apps/mobile with vite. Stage 3 installs
#  the python side and copies both builds in, so FastAPI serves the static
#  files itself (see services/cloud/api/spa.py). No nginx, no second
#  container, no CORS: the UIs and the API are the same origin.
#
#      apps/web    → /        the desktop command console
#      apps/mobile → /m       the phone app
#
#      docker build -f infra/Dockerfile -t urban-twin .
#      docker run -p 8000:8000 urban-twin
# ─────────────────────────────────────────────────────────────────────────────

# ── stage 1: the desktop frontend ────────────────────────────────────────────
FROM node:20-slim AS web

WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY apps/web/ ./
# Same-origin in production: the app derives the API base from
# window.location, so there is deliberately no VITE_API_BASE_URL baked in here.
# Set one at build time only when the API lives on a different host.
ARG VITE_API_BASE_URL
ARG VITE_WS_URL
RUN npm run build

# ── stage 2: the mobile frontend ─────────────────────────────────────────────
FROM node:20-slim AS mobile

WORKDIR /mobile
COPY apps/mobile/package.json apps/mobile/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY apps/mobile/ ./
# public/map is a symlink into apps/web, which is not in this build context.
# The build drops dist/map anyway (the mobile app reads apps/web's basemap at
# the shared origin), but a dangling symlink would break the publicDir copy
# before it got that far.
RUN rm -f public/map

ARG VITE_API_BASE_URL
ARG VITE_WS_URL
# /m/, matching spa.py's mount. Baked in at build time — vite resolves `base`
# into every asset URL in the bundle, so it cannot be changed at runtime.
ENV VITE_BASE=/m/
RUN npm run build

# ── stage 3: the API, serving both builds ────────────────────────────────────
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

# the built UIs. spa.py looks in both places first, so no configuration is
# needed. /app/mobile carries no basemap — it reads /map, which is served from
# /app/web's copy.
COPY --from=web /web/dist /app/web
COPY --from=mobile /mobile/dist /app/mobile

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "services.cloud.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
