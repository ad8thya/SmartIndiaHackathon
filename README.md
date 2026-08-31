<div align="center">

# URBAN TWIN

**Every public bus is already driving every road in the city, every day.
We turn them into the sensor network, and the city into a live Digital Twin.**

Smart India Hackathon 2026 · Chennai

</div>

---

## 1 · What this is

Indian cities do not lack roads to inspect — they lack anyone inspecting them.
A pothole is found when a two-wheeler hits it, and a complaint is filed by a
citizen who will never hear back. Meanwhile a thousand MTC buses drive the same
corridors on a fixed schedule, twenty hours a day, past every one of those
defects. URBAN TWIN puts a camera and an edge box on those buses and turns the
existing fleet into a continuously-updating survey of the city: road surface
distress classified to IRC:82-2015, traffic density from probe vehicles,
pedestrian conflict zones near schools, and hit-and-run incidents with plate
evidence. Detections from many buses are **fused** — three different vehicles
seeing the same pothole is evidence, one bus seeing it thirty times is a dirty
lens — and only corroborated events escalate to a municipal work order with an
SLA clock. The result is a 3D command centre where an operator can watch the
city, click a road, and ask *"what happens if I close this tonight?"*

> **The pitch line:** *No new sensors. No new vehicles. No new routes. The
> survey fleet is already out there — we just gave it eyes.*

---

## 2 · Architecture

This is the target end-to-end architecture — bus-mounted cameras through the
central intelligence platform to the department that dispatches a repair
crew. The scaffold in this repo implements every stage: today's edge and
platform code runs against simulated buses and mock perception (see
`BUILD.md` §2 for the honest per-module MOCK/REAL inventory), and the shape
below is what each `USE_REAL_*` flag is swapping towards, one module at a time.

```
                     ┌──────────────────────────────────────────────┐
                     │              PUBLIC TRANSPORT BUS             │
                     └──────────────────────────────────────────────┘

          Front Camera      Rear Camera      Left Camera      Right Camera
                │                 │                 │                 │
                └─────────────────┴─────────────────┴─────────────────┘
                                  │
                                  ▼
                       RTSP / USB / IP Camera Streams
                                  │
                                  ▼
                      Edge AI Device (Production)
        (Jetson Nano / Orange Pi 5 / Raspberry Pi 5 / Industrial PC)
                                  │
                                  ▼
                     Video Frame Extraction (OpenCV)
                                  │
                                  ▼
                    Multi-Task AI Inference Engine
       ┌───────────────────────────────────────────────────────────────┐
       │ • Road Damage Detection (YOLO)                                │
       │ • Vehicle Detection & Counting                                │
       │ • Pedestrian Detection                                        │
       │ • Traffic Sign Detection                                      │
       │ • Zebra Crossing Detection                                    │
       │ • Waterlogging Detection                                      │
       │ • Number Plate Detection + OCR                                │
       │ • Vehicle Tracking (ByteTrack / DeepSORT)                     │
       └───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    Event Generation & Confidence Score
                                  │
               GPS Location + Timestamp + Bus ID + Camera ID
                                  │
                                  ▼
                       Local Event Buffer (Offline Support)
                                  │
                                  ▼
                           4G / 5G / WiFi Network
                                  │
                                  ▼
  ═══════════════════════════════════════════════════════════════════════════
                          CENTRAL URBAN INTELLIGENCE PLATFORM
  ═══════════════════════════════════════════════════════════════════════════
                                  │
                                  ▼
                           FastAPI / Spring Boot API
                                  │
                                  ▼
                    Event Validation & Multi-Bus Consensus
                                  │
                                  ▼
                          Central Database (PostgreSQL)
                                  │
                                  ▼
                        AI Intelligence Layer (Novelty)
       ┌───────────────────────────────────────────────────────────────┐
       │ ✓ Multi-Bus Consensus Verification                            │
       │ ✓ Road Health Score Generation                                │
       │ ✓ Predictive Road Deterioration                               │
       │ ✓ Congestion Prediction                                       │
       │ ✓ Infrastructure Deficiency Detection                         │
       │ ✓ Urban Risk Index                                            │
       │ ✓ AI Repair Prioritization                                    │
       │ ✓ Route Delay Analysis                                        │
       │ ✓ Incident Severity Estimation                                │
       │ ✓ Maintenance Recommendation Engine                           │
       └───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                      GIS & Digital Twin Visualization
       ┌───────────────────────────────────────────────────────────────┐
       │ • Live Bus Locations                                          │
       │ • Road Health Heatmap                                         │
       │ • Congestion Heatmap                                          │
       │ • Accident Hotspots                                          │
       │ • Waterlogging Map                                            │
       │ • Infrastructure Deficiency Map                               │
       │ • City Digital Twin                                           │
       └───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    Maintenance Workflow Automation
       ┌───────────────────────────────────────────────────────────────┐
       │ Detect Issue                                                  │
       │      ↓                                                        │
       │ Generate Work Order                                           │
       │      ↓                                                        │
       │ Assign Department                                             │
       │      ↓                                                        │
       │ Track Repair Status                                           │
       │      ↓                                                        │
       │ Mark as Resolved                                              │
       └───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                              End Users (RBAC)
       ┌───────────────────────────────────────────────────────────────┐
       │ • Bus Driver              • Emergency Team                    │
       │ • Municipal Authority     • Citizen                           │
       │ • Road Maintenance        • Urban Planner                     │
       │ • Traffic Police          • Smart City Admin                  │
       └───────────────────────────────────────────────────────────────┘
```

### How this maps onto the code in this repo

| Diagram stage | This repo, today |
|---|---|
| Cameras, edge device, frame extraction | Simulated by `services/tools/replay` — 6 virtual buses, `FrameMeta` standing in for a real frame |
| Multi-task inference engine | `services/edge/{defects,pedestrian,incidents}` — mocks now, one `USE_REAL_*` flag each away from real YOLO/ByteTrack/PaddleOCR |
| Event generation + local buffer + network | `Observation` / `IncidentReport` (`packages/contracts`), published over MQTT (`bus/{id}/observation`, `bus/{id}/incident`) |
| Central platform API | FastAPI (`services/cloud/api`), not Spring Boot, in this build |
| Event validation & multi-bus consensus | `services/cloud/consensus` — noisy-OR confidence + the `DETECTED → AI_VERIFIED → AUTHORITY_NOTIFIED` ladder |
| Central database | PostGIS on Postgres (`packages/db`) |
| AI Intelligence Layer | `services/cloud/intelligence/urban_risk` (Urban Risk Index), `services/cloud/intelligence/recommend` (Maintenance Recommendation Engine), `services/cloud/intelligence/traffic_analytics` + `services/cloud/intelligence/whatif` (congestion / route delay), `services/edge/incidents/near_miss.py` (incident + near-miss severity) |
| GIS & Digital Twin | `apps/web` — MapLibre + deck.gl over a committed PMTiles basemap, 3D twin at 45° pitch, road-health / congestion / risk-band layers |
| Maintenance workflow automation | `Event.status` ladder + `WorkOrder` (`packages/db`), driven from the command console and the field app at `/field`. Closing the loop (next bus re-scans a repaired segment and auto-verifies it) is scaffolded but not built — see `services/cloud/repair_verification/README.md` |
| End users (RBAC) | All eight roles are built, in one app: `/app/:role`. The six operator roles get the desktop console; Citizen and Bus Driver get purpose-built phone-shaped screens |

### Role split (RBAC) — who the product is for

Distinct from "who builds it" (§5 below), this is who **uses** it once built.
All eight are built and live at `/app/:role` in the one app.

| Role | View | Report | AI Analytics | Approve | Admin |
|---|---|---|---|---|---|
| Bus Driver | Own Bus, Camera Status | ❌ | ❌ | ❌ | ❌ |
| Municipal Authority | ✅ | ✅ | ✅ | ✅ | ❌ |
| Road Maintenance | Assigned Roads, Repair Status | Limited | — | ✅ | ❌ |
| Traffic Police | Traffic & Incidents | Incident Actions | Traffic Analytics | ❌ | ❌ |
| Emergency Team | Accident Alerts | Response Status | Limited | ❌ | ❌ |
| Citizen | Public Map | Feedback | Limited | ❌ | ❌ |
| Urban Planner | Analytics | Export | Full Analytics | ❌ | ❌ |
| Smart City Admin | Everything | Everything | Everything | Everything | ✅ |

Full matrix and per-role notes: `apps/web/README.md`. The Citizen row is the
one place the RBAC split changes the *data* rather than the layout — the
public map is served only confirmed, acted-on events, with no confidence
scores or bus ids attached.

**The one idea that makes six people possible:** nothing imports anybody's
implementation. Every module boundary is a `typing.Protocol` in
`packages/contracts`, reached through that module's `factory.py`. Swapping a
mock for a real detector — the step from "simulated" to "production" in the
table above — is a one-line change inside one folder.

---

## 3 · Quickstart

```bash
git clone https://github.com/ad8thya/SmartIndiaHackathon.git
cd SmartIndiaHackathon
cp .env.example .env
make setup        # venv + python deps + npm install
make dev          # docker infra, migrations, seed, api, replay, the UI
```

There is **one branch, `main`.** No checkout step, nothing to pick. Everyone
commits to `main` and pulls with `--rebase` — see **CONTRIBUTING.md** for the
daily loop and the before-you-push checklist.

**One app, one port.** Everything is `http://localhost:5173`:

| what | where |
|---|---|
| Role picker (landing) | <http://localhost:5173/> |
| A role | <http://localhost:5173/app/municipal-authority> |
| Field app | <http://localhost:5173/field> (also on your phone, same wifi) |
| API docs | <http://localhost:8000/docs> |

`make dev` prints your laptop's LAN IP on startup. Open that from a phone on
the same wifi and it's the same app, same code, same hot reload — no separate
mobile build. The vite dev server binds `--host`, and the api's CORS policy
(`services/cloud/api/config.py`) allows any private-LAN origin, not just
`localhost`.

**On demo day, use `make demo` instead.** It builds the frontend once and
serves it from the API on a single port, with no dev server and no external
network at all — map tiles, fonts and building footprints are committed to
this repo. Test it with the wifi off; venue networks fail.

Deploying it somewhere public is `make prod` (or see **DEPLOY.md** for
Railway / Render / Fly). The production image serves the API and the UI from
one container on one port, so there is no CORS to configure.

Sanity check any time: `make smoke`

**Requirements:** Docker Desktop running, Python 3.11 or 3.12, Node 20+.

---

## 4 · THE GOLDEN RULES

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   1.  packages/contracts is FROZEN after Day 1.                    ║
║       Changing it needs agreement from every owner it touches.     ║
║                                                                    ║
║   2.  You edit ONLY files under your ownership. Never someone      ║
║       else's. If you need something from another module, ask       ║
║       its owner — do not reach into their folder.                  ║
║                                                                    ║
║   3.  Your module ships a mock. NEVER break the mock.              ║
║       The demo runs on mocks for four days. A broken mock is a     ║
║       broken demo for five other people.                           ║
║                                                                    ║
║   4.  Flip your USE_REAL_* flag only when your own tests pass.     ║
║       It is your flag. Nobody else is affected either way.         ║
║                                                                    ║
║   5.  Pull from main every morning BEFORE you write code.          ║
║       `git pull --rebase origin main` — first thing, every day.    ║
║       One shared branch. Never force-push it.                      ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

Corollaries worth stating out loud:

- **Never commit `.env`.** Your flags are yours.
- **A red test in `packages/contracts` is a stop-the-line event** for the whole
  team, not a test to update.
- **If two people need to touch one file, one of you is in the wrong file.**
  That is a design problem — raise it, do not merge around it.

---

## 5 · Who owns what

This is the **engineering split** — six people, six code modules. Not to be
confused with the **RBAC role split** in §2 (`/app/:role`) — those are the
product's end users, not dev assignments.

Every module has the identical internal shape, so all six of you are looking at
the same layout:

```
services/<module>/
  README.md         what this does, its Protocol, how to run it standalone
  config.py         module settings, read from env
  mock.py           WORKING fake — this is what the demo runs on
  impl.py           your real implementation (stubbed, with TODOs)
  factory.py        get_x() → mock or impl, chosen by your USE_REAL_* flag
  test_module.py    tests written against the PROTOCOL, not the mock
```

---

### 🟠 M1 · Road Defects

**Files you own**
```
services/edge/defects/**
apps/web/src/panels/DefectsPanel.tsx
```

**Your Protocol**
```python
class DefectDetector(Protocol):
    def detect(self, frame: NDArray, meta: FrameMeta) -> list[Observation]: ...
```
Infrastructure classes **must** carry an IRC:82-2015 `severity` — the
`Observation` validator rejects them otherwise. A clean frame returns `[]`; a
bad frame must not raise.

**Your commands** · `MEMBER=m1 make mine` · `pip install -e ".[ml]"` ·
flag: `USE_REAL_DEFECTS`

**Your panel** — the defect backlog: severity summary that doubles as a filter,
type chips, evidence thumbnails, SLA countdown per row.

**7-day plan**

| day | done by end of day |
|---|---|
| 1 | Read the contracts. Run `MEMBER=m1 make mine` green. Understand the mock's hotspot mechanism. |
| 2 | RDD2022 (India subset) downloaded, labels mapped to `DetectionClass`, a YOLOv8n training run started. |
| 3 | `RealDefectDetector.detect` returns Observations for a still image. Ignore severity for now. |
| 4 | Severity from bbox → road-plane homography → `severity_from_dimensions`. |
| 5 | Frame-to-frame duplicate suppression (IoU + GPS delta). One pothole = one observation, not forty. |
| 6 | `USE_REAL_DEFECTS=true`, full `make mine` green, evidence crops saved. DefectsPanel showing real thumbnails. |
| 7 | Freeze. Rehearse. Write the two sentences you will say about IRC:82-2015. |

---

### 🔵 M2 · Traffic + What-If

**Files you own**
```
services/cloud/intelligence/traffic_analytics/**
services/cloud/intelligence/whatif/**
services/cloud/intelligence/recommend/**                        (AI intelligence layer — added v1.1.0)
apps/web/src/panels/TrafficPanel.tsx
apps/web/src/panels/WhatIfPanel.tsx
apps/web/src/panels/IntelligencePanel.tsx (you contribute; M3 owns the file)
```

**Your Protocols**
```python
class TrafficAnalyzer(Protocol):
    def analyze(self, observations: list[Observation]) -> dict[str, RoadCondition]: ...


class WhatIfEngine(Protocol):
    def simulate(self, req: WhatIfRequest) -> list[WhatIfResult]: ...
```
Return a `RoadCondition` for **every** segment even with zero observations — the
map must never be blank. Return a `WhatIfResult` for **every** route including
unaffected ones — a missing row reads as "not computed", not "no impact".

**Your commands** · `MEMBER=m2 make mine` · `pip install -e ".[geo]"` ·
flags: `USE_REAL_TRAFFIC`, `USE_REAL_WHATIF`, `USE_REAL_RECOMMEND`

**Your panels** — TrafficPanel: bottleneck chart, heatmap toggle, per-road
detail with PCI bar. WhatIfPanel: road picker → close → per-route delta with a
go/no-go verdict.

**Checklist — recommendations (`services/cloud/intelligence/recommend/`, v1.1.0 amendment)**
- [ ] `RecommendationEngine.recommend(road_id, ctx)` satisfied by the mock's five
  deterministic rules (ZEBRA_CROSSING, SIGNAL_TIMING, DIVIDER, DRAINAGE, SPEED_CALMING)
- [ ] Every recommendation carries `rationale` and `evidence_event_ids` — never fabricate one with neither
- [ ] Contributed to `IntelligencePanel.tsx`'s recommendations feed (priority chips + rationale)
- [ ] `impl.py`: real evidence-id lookup from postgres, replacing the mock's fabricated uuid5 placeholders

**7-day plan**

| day | done by end of day |
|---|---|
| 1 | Contracts read, `MEMBER=m2 make mine` green, both panels rendering mock data. |
| 2 | OSM drive graph built **offline** with osmnx and pickled to `data/chennai_drive_graph.pkl`. Never fetch at request time. |
| 3 | Observation → nearest graph edge snapping. Dwell-time filter (buses stop at bus stops — this is the trap). **Check with M5 that observations are being persisted by now** — they are memory-only in the scaffold, so `TRAFFIC_WINDOW_MINUTES` cannot span an API restart until that lands (`TODO (M5)` in `services/cloud/api/mqtt_bridge.py`). |
| 4 | Density from the fundamental diagram; PCI from M1's defect events per km. `USE_REAL_TRAFFIC=true`. |
| 5 | networkx shortest-path baseline per route, cached at startup. |
| 6 | Edge removal → re-route → real deltas. `USE_REAL_WHATIF=true`. Diversion polyline drawn. |
| 7 | Freeze. Rehearse the closure that costs +14 min and the one that costs +3. |

---

### 🟣 M3 · Pedestrian Safety + Fusion

**Files you own**
```
services/edge/pedestrian/**
services/cloud/consensus/**
services/cloud/intelligence/urban_risk/**                              (AI intelligence layer — added v1.1.0)
apps/web/src/panels/RiskPanel.tsx
apps/web/src/panels/IntelligencePanel.tsx  (you own this one; M2 contributes)
```

**Your Protocols**
```python
class PedestrianRiskDetector(Protocol):
    def detect(self, frame: NDArray, meta: FrameMeta) -> list[Observation]: ...


class EventFuser(Protocol):
    def fuse(self, observations: list[Observation]) -> list[Event]: ...
```
Pedestrian classes carry **no** severity. Fusion must use
`contracts.fuse_confidence` and `contracts.derive_status` — do not invent a
second ladder; M5's API and three panels all read the same one.

**Note:** your "mock" fuser is already doing real work — genuine noisy-OR,
genuine status derivation, stable event ids, confidence-weighted centroids.
Only the clustering is simplified (snap-to-grid instead of DBSCAN). You are
upgrading it, not replacing it.

**Your commands** · `MEMBER=m3 make mine` · `pip install -e ".[ml]"` ·
flags: `USE_REAL_PEDESTRIAN`, `USE_REAL_FUSION`, `USE_REAL_RISK`

**Your panel** — RiskPanel: active risk zones, school-zone count, and the
**fusion confidence ladder**, which is the visualisation judges will interrogate.

**Checklist — urban risk index (`services/cloud/intelligence/urban_risk/`, v1.1.0 amendment)**
- [ ] `RiskScorer.score(road_id, ctx)` satisfied by the mock's 6-component weighted
  index (PCI 30% / congestion 20% / pedestrian density 15% / school proximity 15% /
  near-miss frequency 12% / recent incidents 8%)
- [ ] `components` sum to `score` within 0.01; `explanation` never empty — both are
  enforced by `UrbanRiskScore` itself, but the mock's numbers must actually match
- [ ] `IntelligencePanel.tsx` built: top-10 roads, score bar, expandable component
  breakdown — the breakdown is the whole point, not decoration
- [ ] `impl.py`: gradient-boosted learned upgrade, once repair-outcome data exists.
  Same explainability requirement — SHAP values in, not a black box

**7-day plan**

| day | done by end of day |
|---|---|
| 1 | Contracts read, `MEMBER=m3 make mine` green. Understand why bus count matters more than confidence. |
| 2 | DBSCAN fusion in `impl.py`: project to metres, cluster per class, treat noise as single-observation events. |
| 3 | `USE_REAL_FUSION=true`. Temporal decay added. Event ids still stable across restarts. |
| 4 | YOLOv8 person detection + ByteTrack. One person = one `track_id`. |
| 5 | Time-to-collision from track trajectory + bus speed. School-zone and time-of-day weighting. |
| 6 | `USE_REAL_PEDESTRIAN=true`. RiskPanel showing a real confidence breakdown per event. |
| 7 | Freeze. Rehearse the ladder explanation — it is the credibility of the whole project. |

---

### 🔴 M4 · Incidents & ANPR

**Files you own**
```
services/edge/incidents/**
apps/web/src/panels/IncidentsPanel.tsx
```

**Your Protocol**
```python
class IncidentDetector(Protocol):
    def process(self, frames: list[NDArray], meta: FrameMeta) -> list[IncidentReport]: ...
```
Note the frame **window** — an incident is a temporal pattern; nothing in a
single frame separates a car that stopped from a car that was hit.

**The privacy contract, which is not negotiable**

| field | where it may go |
|---|---|
| `plate_text` | the live operator dossier, in memory. **Never persisted.** |
| `plate_hash` | database, MQTT, logs — salted SHA-256 via `config.hash_plate()` |

There is deliberately no `plate_text` column in the `incidents` table. DPDP Act
2023 §8 (data minimisation) is the reason and a judge is the audience.

**Your commands** · `MEMBER=m4 make mine` · `pip install -e ".[ml]"` ·
flag: `USE_REAL_INCIDENTS`

**Your panel** — IncidentsPanel: dossier list, plate crop with an OCR
confidence bar, and a **plates-masked-by-default** toggle. Keep the default
masked; it is the answer to "is this a surveillance system?"

**7-day plan**

| day | done by end of day |
|---|---|
| 1 | Contracts read, `MEMBER=m4 make mine` green including the privacy tests. |
| 2 | Vehicle detection + tracking over a frame window. |
| 3 | Collision heuristic: converging tracks + abrupt velocity loss. Rash driving: lateral accel + lane changes. |
| 4 | Plate crop selection (sharpest, largest, most frontal) + PaddleOCR. |
| 5 | TN-format normalisation + confidence gate. Reject below threshold rather than publishing a guess. |
| 6 | `USE_REAL_INCIDENTS=true` with a **real** `PLATE_HASH_SALT`. Dossier export. **Agree with M5 whether incidents persist** — nothing writes the `incidents` table today, so every dossier is lost on API restart (`TODO (M5)` in `services/cloud/api/routers/incidents.py`). Your call as the owner of the evidence chain. |
| 7 | Freeze. Rehearse the privacy answer in two sentences. |

---

### 🟢 M5 · Platform (API · Realtime · Persistence)

**Files you own**
```
services/cloud/api/**        services/tools/replay/**       packages/db/**
scripts/**
```

**Your surface** — the whole API in §6 of `services/cloud/api/README.md`. You never
import anyone's implementation, only their factory. One router file per domain
so you are never blocked on your own merge conflicts.

**Your commands** · `MEMBER=m5 make mine` · `make migrate` · `make seed` ·
`make smoke`

**7-day plan**

| day | done by end of day |
|---|---|
| 1 | `make dev` works for everyone. Everyone can hit `/docs`. `make smoke` all green. |
| 2 | **Persistence gaps** (`grep -rn "TODO (M5)" services/cloud/api`). Only `events` and `work_orders` are written at runtime — `observations`, `incidents` and `bus_positions` live in memory and vanish on restart. Batch-insert observations in `mqtt_bridge.py` (M2 needs history across a restart for `TRAFFIC_WINDOW_MINUTES`; `event_observations` has nothing to point at without it). |
| 3 | **Single merge path.** `routers/events.py::merged_events()` is the one definition of "all events" — `/api/fleet`, `/api/incidents` and the WS `HELLO` payload still read `LiveState` alone and can disagree with it, the same way `open_events` did. Fix the fleet fallback first: with no replay running, `/api/fleet` returns `[]` despite 6 seeded `bus_positions`. Then WebSocket under load (6 buses × 15fps), backpressure, redis caching for `/api/roads`. |
| 4 | Evidence storage + signed URL endpoint — M1 and M4 both need this. |
| 5 | Work-order lifecycle, SLA breach detection, `/api/analytics/summary` off real aggregates — including `km_surveyed_today` and `incidents_today`, which are currently process-lifetime counters that reset on every `uvicorn --reload`. |
| 6 | Whole-system soak: leave `make dev` running for an hour, watch for leaks and unbounded growth. |
| 7 | Freeze. Own the demo machine. Know how to restart everything in under 60 seconds. |

---

### 🟡 M6 · Frontend & the Twin

**Files you own**
```
apps/web/src/{App,main}.tsx, components/**, lib/**, store/**, styles/**, test/**
apps/web/src/field/**                          (the mobile app, at /field)
apps/web/src/roles/**                          (the role shell + phone screens)
scripts/fetch_buildings.py, scripts/gen_frontend_types.py
```
You do **not** own `apps/web/src/panels/*` — those belong to M1–M4.

**Your contract with the panel owners** — every panel receives exactly:
```ts
{ events, roads, selected, onSelect }
```
and is mounted inside an `ErrorBoundary` labelled with its owner, so a crash is
contained and routes itself to the right person.

**Your commands** · `cd apps/web && npm run test` · `make buildings` · `make types`

**7-day plan**

| day | done by end of day |
|---|---|
| 1 | Map renders with buildings, routes, buses, events. All five panels mounting. `npm run test` green. |
| 2 | WebSocket live and reconnecting. Buses interpolating smoothly between updates. |
| 3 | Field app on a real phone over wifi; PhoneFrame showing the same URL. |
| 4 | Filters, event detail card, status write-back working end to end. |
| 5 | Polish pass: transitions, empty states, loading states, the offline map fallback. |
| 6 | Performance: 500+ events on the map without dropping frames. Real OSM buildings via `make buildings`. |
| 7 | Freeze. Rehearse the camera path — where you pan, when you pitch, what you click. |

---

## 6 · Event schema reference

### `Observation` — one detection, one bus, one instant

| field | type | notes |
|---|---|---|
| `obs_id` | UUID | |
| `bus_id` | str | `^MTC-[A-Z0-9]+-\d{4}$` — depot is one token: `MTC-TNAGAR-0007` |
| `route_id` | str | |
| `ts` | datetime | **must be timezone-aware**; naive values are rejected |
| `lat` / `lon` | float | WGS84 |
| `gps_accuracy_m` | float | |
| `heading_deg` | float | 0–360 clockwise from north |
| `speed_kmph` | float | |
| `detection_class` | DetectionClass | |
| `raw_confidence` | float | 0–1 |
| `severity` | Severity? | **required** for the 8 infrastructure classes |
| `bbox` | BBox? | validated `x2>x1`, `y2>y1` |
| `evidence_uri` | str? | |
| `plate_hash` | str? | `^[a-f0-9]{64}$` |
| `track_id` | int? | |
| `reid_embedding` | float[]? | exactly 512 |

### `Event` — the fused, human-facing record

| field | type | notes |
|---|---|---|
| `event_id` | UUID | stable across restarts — the map depends on this |
| `lat` / `lon` | float | confidence-weighted centroid |
| `road_segment_id` | str? | |
| `detection_class` | DetectionClass | |
| `severity` | Severity | **worst** reported, not average |
| `fused_confidence` | float | noisy-OR, capped at 0.999 |
| `observation_count` | int | how many times it was seen |
| `distinct_bus_count` | int | **the number that matters** |
| `first_seen` / `last_seen` | datetime | |
| `status` | WorkflowStatus | from `derive_status` |
| `assigned_team` | str? | |
| `sla_due` | datetime? | LARGE 72h · MEDIUM 168h · SMALL 720h |
| `evidence_uris` | str[] | |

### What becomes an Event

Only `contracts.FUSABLE_CLASSES` — the eight infrastructure classes plus
`PEDESTRIAN_RISK`, `RASH_DRIVING` and `COLLISION`. Plain `PEDESTRIAN` presence
and `VEHICLE` counts are analytics input for M2/M3, not backlog items: fusing
them handed repair crews work orders with a 30-day SLA for a person walking, and
buried the real defects in the operator's list.

The three safety classes carry no severity on the Observation, so the fuser
resolves one through an explicit per-class policy (`COLLISION → LARGE`,
`RASH_DRIVING`/`PEDESTRIAN_RISK → MEDIUM`). It never invents a blanket default —
a hit-and-run rendered as a small blue dot beside a hairline crack is worse than
no severity at all.

### The escalation ladder

```
    ≥3 distinct buses AND conf ≥ 0.95  →  AUTHORITY_NOTIFIED
    ≥2 distinct buses                  →  AI_VERIFIED
    1 bus AND conf ≥ 0.70              →  AI_VERIFIED
    anything weaker                    →  DETECTED
```

Then a human drives it: `INSPECTION → MAINTENANCE_ASSIGNED → REPAIR_COMPLETED
→ VERIFIED → RESOLVED`, or `REJECTED`.

---

## 7 · Standards cited

| standard | where it shows up |
|---|---|
| **AIS-140** (Indian vehicle tracking) | `BusPosition` shape; `Bus.device_serial`; the fleet feed the replay simulator stands in for |
| **IRC:82-2015** (road maintenance) | `Severity` SMALL/MEDIUM/LARGE and `severity_from_dimensions` — dimensional classes, not opinions |
| **GTFS** | `Route` model: route_id, stops, shape polyline |
| **OGC SensorThings API** | the Observation/Event separation — raw sensor readings versus interpreted features |
| **DPDP Act 2023** (§8, data minimisation) | plates stored as salted SHA-256 only; no `plate_text` column exists; masked by default in the UI |
| **PCI** (ASTM D6433 family) | `RoadCondition.pci_score`, degraded by observed defects |

---

## 8 · Troubleshooting

<details>
<summary><b>Mosquitto starts and then refuses every connection</b></summary>

Mosquitto 2.x defaults to `allow_anonymous false` and a localhost-only
listener, so a container with no config file is a black hole. That is why
`infra/mosquitto/mosquitto.conf` exists and is bind-mounted — **do not delete
it.** Check it is actually mounted:

```bash
docker exec ut-mosquitto cat /mosquitto/config/mosquitto.conf
docker logs ut-mosquitto
```
You want to see `allow_anonymous true` and listeners on 1883 and 9001.
</details>

<details>
<summary><b>Alembic wants to drop <code>spatial_ref_sys</code></b></summary>

PostGIS installs its own tables and views into your schema. They are not in our
metadata, so autogenerate cheerfully writes `op.drop_table('spatial_ref_sys')`
and destroys the extension on upgrade.

`packages/db/src/db/migrations/env.py` has an `include_object` hook that filters
them out, and imports `geoalchemy2` at module scope so spatial types register.
**Both are load-bearing.** If a generated migration still contains a drop of a
PostGIS object, delete those lines by hand before applying it — and check why
the hook missed it.
</details>

<details>
<summary><b>deck.gl renders a blank screen</b></summary>

In order of likelihood:

1. **No WebGL2.** Check `chrome://gpu`. Remote desktop and some VMs disable it.
2. **The base map failed to load.** Unlikely now — `lib/mapStyle.ts` reads a
   PMTiles archive committed to this repo and served by the app itself, with
   no CDN and no API key. If the streets are missing but buildings, routes and
   buses render, check that `apps/web/public/map/chennai.pmtiles` survived the
   clone (it is ~17 MB; a partial or LFS-less checkout can drop it).
3. **No buildings file.** `make buildings` writes
   `apps/web/public/data/buildings.geojson` — 7,177 real OSM footprints,
   bounded to the six seeded routes + 500 m, filtered to buildings that declare
   `height` or `building:levels` (~1.8 MB). Dropping the filter pulls 146k
   footprints and 31 MB, which deck.gl will render but nobody wants in git.
   With no network it falls back to a synthetic block grid, so a fresh clone
   still shows 3D.
4. **Layer order.** Extruded buildings will swallow anything drawn beneath them.
   Order in `MapCanvas.tsx` is buildings → routes → heatmap → events → buses.
5. **Empty data.** Check <http://localhost:8000/api/events> actually returns rows.
   If it returns `[]`, run `make seed`.
</details>

<details>
<summary><b>The websocket keeps disconnecting</b></summary>

Usually `uvicorn --reload` restarting because someone saved a Python file — the
client reconnects with exponential backoff, and the connection pill in the top
bar goes amber then green. That is working as designed.

If it disconnects while nothing is being edited:
- a slow client gets dropped on purpose (`Broadcaster` discards a subscriber
  whose queue is full rather than back-pressuring the whole system)
- check `VITE_WS_URL` matches where the API is actually listening
- behind a proxy, make sure it is not buffering or timing out idle upgrades
</details>

<details>
<summary><b><code>make dev</code> fails to start a container: "address already in use"</b></summary>

Something on your machine already owns the port. Find it:

```bash
lsof -i :5432 -i :6379 -i :1883 -i :8000 -i :5173
```

The two that actually happen:

- **6379** — a Homebrew redis running as a service.
  `brew services stop redis`, or map the container elsewhere.
- **5432** — a local postgres. Stop it, or set `POSTGRES_PORT=5433` in your
  `.env` (the compose file reads it, and `DATABASE_URL` must match).

If nothing is listening and it still fails, Docker Desktop is not running —
`open -a Docker` and wait for the whale to settle.
</details>

<details>
<summary><b>Postgres logs a platform warning on Apple Silicon</b></summary>

`postgis/postgis:16-3.4` has no arm64 image, so Docker runs the amd64 one under
emulation. It works and it is fast enough for this, you just get a warning line.
Ignore it.
</details>

<details>
<summary><b>My module's real implementation broke everyone's demo</b></summary>

It should not have — that is what the flags are for. Set your `USE_REAL_*` back
to `false` in **your** `.env` and the mock takes over immediately.

The replay simulator catches exceptions from every detector and logs which
module raised, so the fleet keeps moving. If your module took the system down
anyway, that is a bug in the isolation, and it is worth fixing properly rather
than working around.
</details>

<details>
<summary><b><code>npm audit</code> reports a moderate esbuild advisory</b></summary>

`GHSA-67mh-4wv8-2f99`, reachable through Vite 5's bundled esbuild. It lets any
website send requests to a **running dev server** and read the response. It does
not affect `npm run build` output or anything you deploy.

We are deliberately not bumping Vite mid-sprint — a major bundler upgrade on day
3 of 7 is a worse risk than the advisory. Mitigation: the dev servers bind to
your LAN (`--host`, which the field app needs for phone testing), so do not run
`make dev` on untrusted wifi. Revisit after the hackathon.
</details>

<details>
<summary><b>Why are the packages called <code>contracts</code> and <code>db</code>?</b></summary>

They are short on purpose — `from contracts import Observation` appears in
almost every file in the repo, and `urban_twin_contracts` would add noise to all
of them. They are `src`-layout packages installed from this repo only, and
nothing on PyPI shadows them in our environment. If you ever vendor this into a
larger codebase, that is the moment to rename.
</details>

<details>
<summary><b>Tests pass individually but fail together</b></summary>

The factories are `lru_cache`d. If a test mutates a `USE_REAL_*` env var it must
call the matching `reset_*()` afterwards — e.g. `reset_defect_detector()`.
</details>

---

## 9 · Command reference

```bash
make setup       # venv, python deps, npm install
make dev         # THE COMMAND — everything, hot reload, one port
make demo        # DEMO DAY — built UI served by the api, zero network
make prod        # the whole stack in docker, production shape
make up          # just postgres + redis + mosquitto
make down        # stop containers (data survives)
make reset       # stop containers AND wipe the database volume

make migrate     # apply alembic migrations
make revision m="add xyz"
make seed        # 6 routes, 6 buses, 3 school zones, ~40 events
make buildings   # re-fetch OSM footprints (bounded to the routes, ~1.8 MB)
make types       # regenerate the frontend contract types from packages/contracts

make smoke       # green/red checklist of every moving part
make test        # everything, python + frontend
make mine        # ONLY your module's tests (reads .member, or MEMBER=m3)
make fmt         # ruff format + autofix
make typecheck   # mypy strict on the frozen shared layer
```

Licensed MIT. Built for Smart India Hackathon 2026.
