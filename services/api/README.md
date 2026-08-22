# M5 · API, Realtime & Persistence

The surface every other module is reached through. M5 never imports anybody's
implementation — only their **factory** — which is why five people can swap
their internals underneath this without touching a file M5 owns.

## Endpoints

| method | path | notes |
|---|---|---|
| `GET` | `/health` | db / postgis / redis / mqtt, one boolean each |
| `WS` | `/ws/live` | `WSMessage` envelopes: HELLO, BUS_POSITION, EVENT_NEW, EVENT_UPDATED, INCIDENT, TICK |
| `GET` | `/api/fleet` | live bus positions (`?route_id=`) |
| `GET` | `/api/routes` | GeoJSON FeatureCollection; `/api/routes/list` for contract models |
| `GET` | `/api/events` | filters: `status`, `class`, `bbox`, `since`, `min_confidence` |
| `GET` | `/api/events/{id}` | |
| `PATCH` | `/api/events/{id}/status` | the one human write path; also writes a WorkOrder audit row |
| `GET` | `/api/roads/{road_id}/condition` | → **M2's** `TrafficAnalyzer` factory |
| `POST` | `/api/whatif/simulate` | → **M2's** `WhatIfEngine` factory |
| `GET` | `/api/incidents` | → **M4's** `IncidentDetector` factory |
| `GET` | `/api/analytics/summary` | KPI strip |

Interactive docs: <http://localhost:8000/docs>

## Files you own

```
services/api/          config, main, hub, deps, mqtt_bridge, fusion_loop, routers/*
services/replay/       the simulator that makes buses move
packages/db/           ORM, session, alembic migrations
scripts/               seed.py, smoke_test.py, dev.sh, …
```

One router file per domain, so you are never blocked on your own merge conflicts.

## How data actually flows

```
replay ──MQTT──▶ MqttBridge ──▶ LiveState ──▶ FusionLoop (every 4 s)
                                    │              │
                                    │              ├─▶ Broadcaster ─▶ /ws/live
                                    │              └─▶ postgres (upsert)
                                    └──▶ REST handlers
```

`LiveState` is a hot cache, not the source of truth — postgres is. But every
read endpoint falls back to the cache when the database is unavailable, because
a demo that shows an empty map while a container boots is a demo that failed.
`services/api/test_module.py` runs with **no infrastructure at all** and that is
what keeps this property honest.

## Run it standalone

```bash
.venv/bin/uvicorn services.api.main:app --reload
curl -s localhost:8000/health | jq
curl -s localhost:8000/api/roads/SEG-27B-000/condition | jq
```

Tests: `MEMBER=m5 make mine`.

## Database

```bash
make migrate                       # apply migrations
make revision m="add xyz"          # autogenerate
make seed                          # 6 routes, 6 buses, 3 zones, ~40 events
```

`Geography(POINT, 4326)`, not `Geometry` — so `ST_DWithin(a, b, 25)` means 25
**metres**. With `Geometry` it would mean 25 degrees and match half of south India.

Alembic's `env.py` has an `include_object` hook that excludes `spatial_ref_sys`,
`geometry_columns` and friends. Do not remove it: autogenerate will otherwise
write `op.drop_table('spatial_ref_sys')` and destroy the PostGIS extension.
