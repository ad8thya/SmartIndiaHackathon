# M2a · Traffic Analytics

Turn `VEHICLE` observations from moving buses into per-road congestion, speed,
pavement condition and bus delay. Buses are probe vehicles: a hundred of them
crossing the city all day is a denser sensor network than any fixed camera
deployment.

## Protocol you must satisfy

```python
class TrafficAnalyzer(Protocol):
    def analyze(self, observations: list[Observation]) -> dict[str, RoadCondition]: ...
```

Invariants:

- return a `RoadCondition` for **every** segment, even with zero observations —
  the map must never be blank
- `condition.road_id` equals its dict key
- keep `analyze()` pure and fast; the API calls it per request
- all percentages 0–100, speeds ≥ 0, PCI 0–100

## Mock behaviour

Congestion is a twin-peaked function of hour-of-day (morning ~09:00, heavier
evening ~18:30) with a per-corridor phase shift so the city does not pulse in
unison. Observations modulate the curve upward. PCI degrades from the defect
observations M1 reports on that segment — so a road visibly deteriorates during
a long demo.

The reference clock comes from the newest observation, **not** wall time. That
is what makes the heatmap animate under 60x replay.

## Run it standalone

```bash
.venv/bin/python -c "
from services.cloud.intelligence.traffic_analytics import get_traffic_analyzer
for road_id, c in list(get_traffic_analyzer().analyze([]).items())[:8]:
    print(f'{road_id:<14} {c.name:<28} {c.congestion_pct:5.1f}%  '
          f'{c.avg_speed_kmph:5.1f} km/h  PCI {c.pci_score:5.1f}  {c.risk_level}')
"
```

Tests: `MEMBER=m2 make mine`.

## Going real

`.venv/bin/pip install -e ".[geo]"`, snap to a cached OSM graph, use the
fundamental diagram for density, aggregate over `TRAFFIC_WINDOW_MINUTES`, then
set `USE_REAL_TRAFFIC=true`.

**The trap:** buses stop at bus stops. Naive speed averaging reports every route
as congested. Filter dwell time before you compute anything.
