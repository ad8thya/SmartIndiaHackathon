# M3 · Urban Risk Index

An explainable 0-100 risk score per road, computed as a transparent weighted
blend of six inputs. This is a government decision-support metric: a number
with no attribution is not decision support, it is a guess with a UI.

## Protocol you must satisfy

```python
class RiskScorer(Protocol):
    def score(self, road_id: str, ctx: RiskContext) -> UrbanRiskScore: ...
```

`RiskContext` (a plain dataclass, not a wire model — see `contracts.RiskContext`)
carries: `defect_counts`, `avg_congestion_pct`, `pedestrian_density`,
`near_miss_count`, `school_zone_distance_m`, `pci_score`,
`recent_incident_count`. The API builds one per request from `LiveState` plus
the traffic/pedestrian/incident factories and hands the same instance to both
this Protocol and `RecommendationEngine`, so the two outputs are always
talking about the same evidence.

Invariants (enforced by `UrbanRiskScore` itself, not left to caller discipline):

- `components` values must sum to `score`, within 0.01
- `explanation` must never be empty
- `score` is bounded 0-100

## Mock behaviour

The weighted index, and the intended v1:

| component | weight |
|---|---|
| road damage / PCI | 30% |
| congestion | 20% |
| pedestrian density | 15% |
| school proximity | 15% |
| near-miss frequency | 12% |
| recent incidents | 8% |

Each input is normalised to `[0, 1]` against a saturation point (see
`RiskSettings` — e.g. 20 pedestrian sightings nearby maxes out that
component) and multiplied by its weight. Band thresholds: `<25` LOW, `<50`
MODERATE, `<75` HIGH, else CRITICAL.

## Run it standalone

```bash
.venv/bin/python -c "
from contracts import RiskContext
from services.risk import get_risk_scorer

ctx = RiskContext(
    defect_counts={'POTHOLE': 5}, avg_congestion_pct=71.0, pedestrian_density=9.0,
    near_miss_count=1, school_zone_distance_m=40.0, pci_score=46.0, recent_incident_count=1,
)
result = get_risk_scorer().score('SEG-27B-014', ctx)
print(result.score, result.band)
for line in result.explanation:
    print(' -', line)
"
```

Tests: `MEMBER=m3 make mine`.

## Going real

See `impl.py`'s TODO block: gradient boosting over repair-outcome data, once
enough Events have reached RESOLVED/VERIFIED to have a real label. The
explainability requirement does not go away — swap SHAP values in for the
hand-weighted components, do not swap in a black box.
