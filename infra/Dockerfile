# ─────────────────────────────────────────────────────────────────────────────
#  URBAN TWIN — one image, one port, API + UI.
#
#  Stage 1 builds apps/web with vite. Stage 2 installs the python side and
#  copies the build in, so FastAPI serves the static files itself (see
#  services/cloud/api/spa.py). No nginx, no second container, no CORS: the UI
#  and the API are the same origin.
#
#      docker build -f infra/Dockerfile -t urban-twin .
#      docker run -p 8000:8000 urban-twin
# ─────────────────────────────────────────────────────────────────────────────

# ── stage 1: the frontend ────────────────────────────────────────────────────
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

# ── stage 2: the API, serving that build ─────────────────────────────────────
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

# the built UI. spa.py looks here first, so no configuration is needed.
COPY --from=web /web/dist /app/web

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "services.cloud.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
