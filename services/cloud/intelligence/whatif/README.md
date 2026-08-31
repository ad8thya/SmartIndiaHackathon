# M2b · What-If Closure Simulation

Answer the operator's actual question: *if we shut this road tonight, what does
it cost us?*

## Protocol you must satisfy

```python
class WhatIfEngine(Protocol):
    def simulate(self, req: WhatIfRequest) -> list[WhatIfResult]: ...
```

Invariants:

- return **one row per route**, including unaffected ones — a missing row reads
  as "not computed", not as "no impact"
- `simulated_min == baseline_min + delta_min`
- closing a road never makes a route faster
- the same request returns the same answer (you will demo this live)
- an unknown / stale `road_id` must not raise

## Files you own

```
services/cloud/intelligence/traffic_analytics/   (your other half)
services/cloud/intelligence/whatif/              (this module)
TrafficPanel.tsx  (in the console repo)
WhatIfPanel.tsx  (in the console repo)
```

## Mock behaviour

Fixed per-segment penalties in `mock.py`. The headline numbers the pitch quotes:

| closure | route | delta |
|---|---|---|
| `SEG-27B-000` Sardar Patel Road | 27B | **+6 min** |
| `SEG-51C-001` Sardar Patel Rd (51C leg) | 51C | **+14 min** |
| `SEG-570-000` Jawaharlal Nehru Road | 570 | **+3 min** |

`SEG-21G-002` (Kamarajar Salai, the beach road) is the "do not close this"
example — +16 min, `recommended=False`, because there is no parallel corridor.

## Run it standalone

```bash
.venv/bin/python -c "
from contracts import WhatIfRequest
from services.cloud.intelligence.whatif import get_whatif_engine
for r in get_whatif_engine().simulate(WhatIfRequest(closed_road_ids=['SEG-51C-001'])):
    print(f'{r.route_id:>4}  {r.baseline_min:5.1f} → {r.simulated_min:5.1f}  '
          f'({r.delta_min:+.1f})  {\"ok\" if r.recommended else \"NOT RECOMMENDED\"}')
"
```

Tests: `MEMBER=m2 make mine`.

## Going real

`.venv/bin/pip install -e ".[geo]"`, build the OSM drive graph **offline** and
pickle it to `data/chennai_drive_graph.pkl`, implement `RealWhatIfEngine.simulate`
with networkx, then set `USE_REAL_WHATIF=true` in your `.env`.

Never call Overpass from a request handler. It is rate-limited and it will pick
the demo to fail on.
