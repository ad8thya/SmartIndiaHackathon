# M3b · Observation → Event Fusion

This is where *"a camera saw something"* becomes *"this is real, send a crew"*.
It is the credibility story of the whole project, and the part a judge will
push on hardest.

## Protocol you must satisfy

```python
class EventFuser(Protocol):
    def fuse(self, observations: list[Observation]) -> list[Event]: ...
```

## The escalation ladder — do not invent a second one

```
    ≥3 distinct buses AND conf ≥ 0.95   →  AUTHORITY_NOTIFIED
    ≥2 distinct buses                   →  AI_VERIFIED
    1 bus AND conf ≥ 0.70               →  AI_VERIFIED
    anything weaker                     →  DETECTED
```

It lives in `contracts.derive_status`. Confidence is `contracts.fuse_confidence`
— a noisy-OR, `1 - Π(1-cᵢ)`. Both the API and the panels read the same functions;
a local copy that drifts is worse than no fusion at all.

**Distinct buses is the number that matters.** One bus seeing the same pothole
thirty times is a dirty lens. Three buses seeing it once each is evidence.

## Why the "mock" is already real

`mock.py` is not a fake — it does genuine noisy-OR fusion, genuine status
derivation, confidence-weighted centroids, worst-severity selection, SLA clocks
and stable event ids. Only the *clustering* is simplified: snap-to-grid instead
of DBSCAN. That is O(n), dependency-free (M5 and M6 can run it without
scikit-learn) and deterministic.

Its one real weakness: two observations either side of a grid boundary become
two events. That is exactly what `impl.py` fixes.

## Files you own

```
services/perception/pedestrian/   (your other half)
services/fusion/                  (this module)
apps/command/src/panels/RiskPanel.tsx
```

## Run it standalone

```bash
.venv/bin/python -c "
from datetime import datetime, UTC
from uuid import uuid4
from contracts import Observation, DetectionClass, Severity
from services.fusion import get_event_fuser

def o(bus, c):
    return Observation(obs_id=uuid4(), bus_id=bus, route_id='27B', ts=datetime.now(UTC),
                       lat=13.0067, lon=80.2570, gps_accuracy_m=4, heading_deg=180,
                       speed_kmph=24, detection_class=DetectionClass.POTHOLE,
                       raw_confidence=c, severity=Severity.LARGE)

for e in get_event_fuser().fuse([o('MTC-ADYAR-1042', .8), o('MTC-TNAGAR-1875', .85), o('MTC-BROADWAY-5090', .9)]):
    print(e.status, round(e.fused_confidence, 3), e.distinct_bus_count, 'buses')
"
```

Tests: `MEMBER=m3 make mine`.

## Going real

`.venv/bin/pip install -e ".[ml]"` (for scikit-learn), implement
`RealEventFuser.fuse` with DBSCAN, keep every test in `test_module.py` green,
then set `USE_REAL_FUSION=true`.

Treat DBSCAN noise (`label == -1`) as single-observation events, not as
discards. One bus seeing a large pothole at 0.9 still matters.
