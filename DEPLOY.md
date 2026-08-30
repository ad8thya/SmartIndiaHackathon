# Deploying URBAN TWIN

> **One image, one port.** `infra/Dockerfile` builds `apps/web` with vite and
> copies the result into the python image; FastAPI serves those static files
> itself (`services/cloud/api/spa.py`). There is no nginx, no second container,
> and — because the UI and the API are the same origin — no CORS to configure.

---

## 1 · The two ways to run it

| | command | what you get |
|---|---|---|
| **Demo day** (a laptop, no network) | `make demo` | Built UI served by the API on `:8000`, replay simulator running, browser opens itself. Nothing reaches the internet. |
| **Production shape** (docker) | `make prod` | The same image, plus postgres, redis and mosquitto, with migrations and the seed run once before the API starts. |

`make dev` is neither of these: it runs the vite dev server for hot reload and
is not what you deploy.

### Verify it before you need it

```bash
make demo          # then TURN THE WIFI OFF and reload the page
curl localhost:8000/health
```

The map, fonts, building footprints and the whole UI are committed to this
repo and served from localhost. A dead venue network changes nothing. The only
step that needs the internet is the very first `docker compose pull`, so do
that at home.

---

## 2 · Health check

`GET /health` returns `200` with a per-dependency breakdown:

```json
{ "ok": true, "database": true, "postgis": true, "redis": true,
  "mqtt": true, "version": "1.1.0", "detail": {} }
```

It reports `ok: true` when the API can serve requests, and names any degraded
dependency in `detail` — the API deliberately degrades to an in-memory cache
rather than 500ing when postgres is down, so point your platform's health check
at this path and it will not flap during a database restart.

Configure it as: path `/health`, expected `200`, grace period **30s** (the
image installs and the fusion loop starts before the first response).

---

## 3 · Railway

Railway builds the Dockerfile and injects `PORT`. Nothing else is needed.

1. **New project → Deploy from GitHub repo**, pick this repo.
2. Settings → Build → **Dockerfile path**: `infra/Dockerfile`.
3. **Add PostgreSQL** from the Railway marketplace. It sets `DATABASE_URL` on
   the service automatically — but with the `postgresql://` scheme, and this
   app uses asyncpg, so override it (see §6).
4. **PostGIS**: Railway's postgres does not enable it by default. Connect once
   and run `CREATE EXTENSION IF NOT EXISTS postgis;` — the migration expects it
   to exist. Without it, migration 0001 fails on the first geography column.
5. Set the variables in §6.
6. Run the migration once, from the Railway shell:
   `alembic -c packages/db/alembic.ini upgrade head && python scripts/seed.py`

Redis and MQTT are **optional**: with neither reachable the API still serves
every REST route and the WebSocket. You lose the replay simulator's live feed,
so add a Redis plugin and a mosquitto service only if you want moving buses on
the deployed URL.

## 4 · Render

1. **New → Web Service**, connect the repo.
2. Runtime **Docker**, Dockerfile path `infra/Dockerfile`.
3. Health check path `/health`.
4. Add a **Render PostgreSQL** instance; enable PostGIS the same way as above.
5. Variables from §6. Render injects `PORT`; the container listens on 8000, so
   either leave Render's default port detection alone or set `PORT=8000`.

## 5 · Fly.io

```bash
fly launch --dockerfile infra/Dockerfile --no-deploy
fly postgres create --name urban-twin-db
fly postgres attach urban-twin-db          # sets DATABASE_URL
fly postgres connect -a urban-twin-db      # then: CREATE EXTENSION postgis;
fly secrets set PLATE_HASH_SALT="$(openssl rand -hex 32)"
fly deploy
```

In `fly.toml` set `internal_port = 8000` and point the http check at `/health`.
The map assets make the image ~250 MB, so give the machine at least 512 MB.

---

## 6 · Environment variables

Everything has a working default except the two marked **required**.
`.env.example` documents the full set with comments; these are the ones that
matter in a deployment.

| variable | required | what it does |
|---|---|---|
| `DATABASE_URL` | **yes** | Must use the **asyncpg** driver: `postgresql+asyncpg://user:pass@host:5432/db`. A managed provider will hand you `postgresql://…` — rewrite the scheme or the app will not start. |
| `PLATE_HASH_SALT` | **yes** | Salt for the SHA-256 plate hashes (DPDP Act 2023 §8). Leaving the default makes the hashes reversible by anyone with this repo. `openssl rand -hex 32`. |
| `PORT` | no | Host port for `docker-compose.prod.yml`. Railway/Render/Fly inject their own; leave unset there. |
| `WEB_DIST` | no | Where the built UI lives. The image needs no value — the build lands at `/app/web` and is found automatically. Set it only to serve a build from a source checkout. |
| `REDIS_URL` | no | Falls back to in-memory caching when unreachable. |
| `MQTT_HOST` / `MQTT_PORT` | no | Without a broker the API serves everything except live bus positions. |
| `CORS_ORIGINS` | no | **Irrelevant in the one-container deployment** — same origin. Only needed if the frontend is hosted separately (§7). |
| `LOG_LEVEL` | no | `INFO`. Use `WARNING` in production if the fusion loop is noisy. |
| `REPLAY_SPEED` / `REPLAY_BUSES` | no | Simulator only. `60` = one simulated minute per real second. |
| `USE_REAL_*` | no | Eight module switches, all `false`. CI fails the build if any is `true` in `.env.example`. |

---

## 7 · Frontend on Vercel instead

Only do this if you want the UI on a CDN and the API somewhere else. It is
strictly more configuration than the one-container path, and it reintroduces
CORS.

1. Vercel project → **Root directory** `apps/web`, framework **Vite**.
2. Build-time variables (vite inlines `VITE_*` at build, not at runtime — a
   change here needs a redeploy):
   ```
   VITE_API_BASE_URL=https://your-api.up.railway.app
   VITE_WS_URL=wss://your-api.up.railway.app/ws/live
   ```
3. On the API, allow the Vercel origin:
   ```
   CORS_ORIGINS=https://your-app.vercel.app
   ```
4. `apps/web/public/map/chennai.pmtiles` is 17 MB. Vercel serves it fine and
   honours Range requests, which pmtiles needs — but check your plan's limits
   before assuming it is free.

**SPA routing is already handled** in the one-container path by the catch-all
in `spa.py`. On Vercel, add `apps/web/vercel.json` with a rewrite of
`/(.*)` → `/index.html`, or a refresh on `/app/citizen` will 404.

---

## 8 · Things that will bite you

**`DATABASE_URL` scheme.** Managed postgres hands you `postgresql://`. This app
needs `postgresql+asyncpg://`. Alembic derives its own sync URL from the same
value, so fix it in one place.

**PostGIS is not installed by default** on Railway, Render or Fly postgres.
`CREATE EXTENSION postgis;` once, before the first migration. The symptom is
migration 0001 failing on `geography(Point,4326)`.

**The image is ~250 MB** because the map extract and glyphs are baked in. That
is the deliberate trade for a demo that survives a dead network — don't
"optimise" it by fetching tiles at runtime.

**Free tiers sleep.** A cold start takes ~20 s, and the first request after a
sleep can time out a health check with a short grace period. Set 30 s.

**Nothing writes `observations`, `incidents` or `bus_positions` at runtime**
(see BUILD.md §5). A restart loses the live feed's history; `events` and
`work_orders` survive because they are persisted. This is a known gap, not a
deployment problem — but it means "the map is empty after a redeploy" is
expected until the replay simulator has run for a minute.
