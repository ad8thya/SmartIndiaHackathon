# M4 · Incidents & ANPR

Detect collisions and rash driving from a short window of frames, recover the
offending vehicle's plate, and produce a dossier an operator can act on.

## Protocol you must satisfy

```python
class IncidentDetector(Protocol):
    def process(self, frames: list[NDArray], meta: FrameMeta) -> list[IncidentReport]: ...
```

Note this one takes a **window**, not a single frame. An incident is a temporal
pattern — nothing in one frame separates a car that stopped from a car that was hit.

## The privacy contract (do not negotiate with this)

| field | where it may go |
|---|---|
| `plate_text` | the live operator dossier, in memory, over TLS. **Never persisted.** |
| `plate_hash` | database, MQTT, logs — salted sha256 via `config.hash_plate()` |

There is deliberately no `plate_text` column in the `incidents` table. DPDP Act
2023 §8 (data minimisation) is the reason, and a judge is the audience.
If `plate_text` is set, `plate_hash` must be set too — `test_module.py` checks it.

## Files you own

```
services/edge/incidents/
  config.py        thresholds, ANPR language, PLATE_HASH_SALT, hash_plate()
  mock.py          the scripted hit-and-run — KEEP THIS WORKING
  impl.py          ← your real detector + PaddleOCR work
  factory.py       get_incident_detector()
  test_module.py
apps/web/src/panels/IncidentsPanel.tsx
```

## Mock behaviour — the demo's set piece

Bus `MTC-VYASARPADI-3311` on route 21G, passing `SEG-21G-002` (Kamarajar Salai),
witnesses a silver hatchback clip a two-wheeler and leave. Plate **TN 09 BX 4412**,
OCR confidence **0.87**, four evidence frames. It fires once per replay loop, so
the IncidentsPanel always has a dossier to open. Low-rate rash-driving reports
fill the list around it, some with unreadable plates — because real OCR fails.

## Run it standalone

```bash
.venv/bin/python -c "
from datetime import datetime, UTC
from citydata import segment_by_id
from contracts import FrameMeta
from services.edge.incidents import MockIncidentDetector, SCRIPTED_SEGMENT, SCRIPTED_BUS

c = segment_by_id(SCRIPTED_SEGMENT).center
meta = FrameMeta(bus_id=SCRIPTED_BUS, route_id='21G', ts=datetime.now(UTC),
                 lat=c[1], lon=c[0], speed_kmph=32.0)
for r in MockIncidentDetector().process([], meta):
    print(r.incident_class, r.plate_text, r.plate_hash[:12] if r.plate_hash else None)
"
```

Tests: `MEMBER=m4 make mine`.

## Going real

`.venv/bin/pip install -e ".[ml]"` (pulls torch + paddleocr), implement
`RealIncidentDetector.process`, keep the privacy tests green, then set
`USE_REAL_INCIDENTS=true` **and a real `PLATE_HASH_SALT`** in your `.env`.
