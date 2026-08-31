# M3a · Pedestrian Safety Perception

Spot people around the bus and decide which of those interactions are actually
*dangerous*. Presence is `PEDESTRIAN`; danger is `PEDESTRIAN_RISK`.

## Protocol you must satisfy

```python
class PedestrianRiskDetector(Protocol):
    def detect(self, frame: NDArray, meta: FrameMeta) -> list[Observation]: ...
```

Invariants:

- these are **not** infrastructure classes → `severity` stays `None`
- only `PEDESTRIAN` and `PEDESTRIAN_RISK` may be emitted from this module
- every `PEDESTRIAN_RISK` carries an `evidence_uri` — an operator cannot act on
  an alert with no picture
- give every person a `track_id`, otherwise fusion counts one person thirty times

## Files you own

```
services/edge/pedestrian/   (this module)
services/cloud/consensus/                  (your other half — see its README)
RiskPanel.tsx  (in the console repo)
```

## Mock behaviour

Three seeded school zones (`citydata.SCHOOL_ZONES`). Inside one, sightings are
frequent and a share of them escalate to risk; the share rises with bus speed
over the 25 km/h zone limit. Away from a zone: occasional plain pedestrians,
never a risk. That is the story the RiskPanel tells.

## Run it standalone

```bash
.venv/bin/python -c "
from datetime import datetime, UTC
from citydata import SCHOOL_ZONES
from contracts import FrameMeta
from services.edge.pedestrian import get_pedestrian_detector

z = SCHOOL_ZONES[0]
d = get_pedestrian_detector()
for i in range(10):
    meta = FrameMeta(bus_id='MTC-TNAGAR-1875', route_id='51C', ts=datetime.now(UTC),
                     lat=z.center[1], lon=z.center[0], speed_kmph=40.0, frame_idx=i)
    print([o.detection_class for o in d.detect(None, meta)])
"
```

Tests: `MEMBER=m3 make mine`.

## Going real

`.venv/bin/pip install -e ".[ml]"`, implement `RealPedestrianRiskDetector.detect`,
keep `test_module.py` green, then set `USE_REAL_PEDESTRIAN=true` in your `.env`.
