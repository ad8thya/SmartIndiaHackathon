#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# `make demo` — the version you run on stage.
#
# Differences from `make dev`, all of them deliberate:
#   · no vite dev server. The frontend is BUILT once and served by the api, so
#     there is one process, one port, and nothing that can hot-reload itself
#     into a white screen while a judge is looking at it.
#   · nothing reaches the internet. Map tiles, glyphs, sprites, the Inter font
#     and the building footprints are all committed to this repo and served
#     from localhost. Test it with the wifi off — that is not a figure of
#     speech, venue networks fail.
#   · the browser opens by itself, on the role picker.
#
# The ONE thing that needs network is the very first run, to pull the postgres,
# redis and mosquitto images. Do that at home, not at the venue:
#     make up && make down
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."
# `.env` supplies DEFAULTS. Anything already set in the caller's environment
# wins — otherwise `API_PORT=8010 make demo` is silently ignored, because
# `set -a; . ./.env` overwrites the variable the caller just passed. That made
# the port-conflict advice below impossible to follow.
_preset_api_port="${API_PORT:-}"
set -a; [ -f .env ] && . ./.env; set +a
[ -n "$_preset_api_port" ] && API_PORT="$_preset_api_port"

VENV=.venv
PY="$VENV/bin/python"
PORT="${API_PORT:-8000}"
PIDS=()

cleanup() {
  echo ""
  echo "  shutting the demo down…"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

run() { # run <colour> <label> <cmd...>
  local colour=$1 label=$2; shift 2
  ( "$@" 2>&1 | sed -u "s/^/$(printf '\033[%sm%-7s\033[0m│ ' "$colour" "$label")/" ) &
  PIDS+=($!)
}

# ── 1. the built frontend ────────────────────────────────────────────────────
if [ ! -f apps/web/dist/index.html ] || [ -n "${REBUILD:-}" ]; then
  echo "  building the frontend (once — this is not a dev server)…"
  npm --prefix apps/web run build --silent || {
    echo "  ✗ frontend build failed. Run 'make setup' first."; exit 1;
  }
fi

# a build that predates the last source edit is the classic demo-day trap
if [ -n "$(find apps/web/src apps/web/index.html -newer apps/web/dist/index.html 2>/dev/null | head -1)" ]; then
  echo "  ⚠ apps/web/dist is older than your sources — rebuilding"
  npm --prefix apps/web run build --silent
fi

# ── 2. offline asset check, before anyone is watching ────────────────────────
missing=0
for asset in \
  apps/web/dist/map/chennai.pmtiles \
  apps/web/dist/data/buildings.geojson \
  apps/web/dist/fonts/inter-latin.woff2
do
  [ -f "$asset" ] || { echo "  ✗ missing $asset — the demo will not survive a dead network"; missing=1; }
done
[ "$missing" -eq 0 ] || exit 1

# ── 2b. is the port actually ours? ───────────────────────────────────────────
# macOS will happily let us bind 0.0.0.0:$PORT while something else already
# holds 127.0.0.1:$PORT — and then the browser, which resolves localhost to the
# loopback address, talks to the OTHER process. The demo comes up, the map
# renders, and every API call returns someone else's 404. There is no error
# anywhere to explain it. Catch it here instead of on stage.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo ""
  echo "  ✗ something is already listening on port $PORT:"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | awk 'NR>1 {printf "      %s (pid %s) on %s\n", $1, $2, $9}'
  echo ""
  echo "    Even if the demo appears to start, your browser will reach that"
  echo "    process instead of this one. Stop it, or pick another port:"
  echo ""
  echo "        API_PORT=8010 make demo"
  echo ""
  exit 1
fi

# ── 3. infrastructure + data ─────────────────────────────────────────────────
echo "  starting postgres, redis, mosquitto…"
docker compose up -d postgres redis mosquitto >/dev/null 2>&1
bash scripts/wait_healthy.sh || exit 1

"$VENV/bin/alembic" -c packages/db/alembic.ini upgrade head >/dev/null 2>&1
"$PY" scripts/seed.py >/dev/null 2>&1 || echo "  ⚠ seed reported a problem — continuing"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"

echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  URBAN TWIN — demo mode (offline, one port)              │"
echo "  │                                                          │"
printf "  │    everything  →  http://localhost:%-22s│\n" "$PORT"
printf "  │    api docs    →  http://localhost:%s/docs%-15s│\n" "$PORT" ""
if [ -n "$LAN_IP" ]; then
printf "  │    on a phone  →  http://%s:%-24s│\n" "$LAN_IP" "$PORT"
fi
echo "  │                                                          │"
echo "  │  no vite, no CDN, no tile server. Safe to unplug.        │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""

# ── 4. the two processes ─────────────────────────────────────────────────────
# WEB_DIST is what makes the api serve the built UI (services/cloud/api/spa.py).
#
# It has to go through `env`: run() executes its arguments as an argv array,
# and a leading VAR=value is only an assignment when a *shell* parses the line.
# Passed as argv[0] it is just a command name, and the api never starts —
# which is precisely the kind of failure you find on stage.
run 36 api env WEB_DIST=apps/web/dist "$PY" -m uvicorn services.cloud.api.main:app \
  --host 0.0.0.0 --port "$PORT"

# wait for /health rather than sleeping a guessed number of seconds
for _ in $(seq 1 40); do
  curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done

run 35 replay "$PY" -m services.tools.replay \
  --speed "${REPLAY_SPEED:-60}" --buses "${REPLAY_BUSES:-6}" --loop

# ── 5. open it ───────────────────────────────────────────────────────────────
sleep 1
if command -v open >/dev/null 2>&1; then open "http://localhost:$PORT/"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$PORT/"
fi

wait
