# M1 · Road Defect Perception

Detect road surface distress from a forward-facing bus camera and emit one
`Observation` per defect, each carrying an IRC:82-2015 severity.

## Protocol you must satisfy

```python
class DefectDetector(Protocol):
    def detect(self, frame: NDArray, meta: FrameMeta) -> list[Observation]: ...
```

Rules that hold for both the mock and the real thing:

- an infrastructure class **must** carry a `severity` — the `Observation`
  validator rejects it otherwise
- a clean frame returns `[]`; a bad frame must not raise
- `obs.ts`, `bus_id` and `route_id` come from `meta`, never from a clock you read
- detections land within a couple of hundred metres of the bus

## Files you own

```
services/edge/defects/
  config.py        module settings (DEFECT_MODEL_PATH, thresholds, …)
  mock.py          hotspot-driven fake detector — KEEP THIS WORKING
  impl.py          ← your real YOLOv8 work goes here
  factory.py       get_defect_detector()
  test_module.py   Protocol tests — they must pass against BOTH implementations
DefectsPanel.tsx  (in the console repo)
```

## Run it standalone

```bash
.venv/bin/python -c "
from datetime import datetime, UTC
from citydata import DEFECT_HOTSPOTS
from contracts import FrameMeta
from services.edge.defects import get_defect_detector

hs = DEFECT_HOTSPOTS[0]
meta = FrameMeta(bus_id='MTC-ADYAR-1042', route_id='27B', ts=datetime.now(UTC),
                 lat=hs.center[1], lon=hs.center[0], speed_kmph=25.0)
for obs in get_defect_detector().detect(None, meta):
    print(obs.detection_class, obs.severity, round(obs.raw_confidence, 2))
"
```

Tests: `MEMBER=m1 make mine` (or `echo m1 > .member` once, then `make mine`).

## Going real

1. `.venv/bin/pip install -e ".[ml]"`
2. Implement `RealDefectDetector.detect` in `impl.py`.
3. `MEMBER=m1 make mine` — green against the real class.
4. `USE_REAL_DEFECTS=true` in **your** `.env`. Nobody else's demo changes.

Datasets worth starting from: RDD2022 (India subset), Cracks-and-Potholes-in-Road.
