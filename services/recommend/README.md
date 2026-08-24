# M2 · Infrastructure Recommendations

Turns a road's `RiskContext` into concrete "build this here" proposals — the
counterpart to what-if's "what happens if we close this road". Where what-if
answers a closure question, this answers a capital-planning one.

## Protocol you must satisfy

```python
class RecommendationEngine(Protocol):
    def recommend(self, road_id: str, ctx: RiskContext) -> list[InfrastructureRecommendation]: ...
```

Invariants:

- zero or more per road — an unremarkable road gets `[]`, not a fabricated recommendation
- every recommendation carries `rationale` (non-empty) and `evidence_event_ids` (non-empty)
- an unknown `road_id` returns `[]`, never raises
- keep `recommend()` pure and fast; the API calls it per request

## Mock behaviour — five deterministic rules

| trigger | recommendation | priority |
|---|---|---|
| faded zebra + school ≤150m + elevated pedestrian density | `ZEBRA_CROSSING` | HIGH |
| sustained average congestion ≥55% | `SIGNAL_TIMING` | MODERATE/HIGH |
| damaged divider present | `DIVIDER` | HIGH |
| repeated waterlogging (≥2 reports) | `DRAINAGE` | MODERATE/HIGH |
| near-miss cluster (≥2 in 7d) | `SPEED_CALMING` | HIGH/CRITICAL |

`SIGNAGE` and `STREET_LIGHT` are reserved `RecommendationType` members with no
trigger yet — see `mock.py`'s docstring.

Evidence ids are fabricated deterministically (`uuid5` off road_id + rule) since
`RiskContext` carries no raw Event ids — the real implementation (`impl.py`)
looks those up from postgres.

## Run it standalone

```bash
.venv/bin/python -c "
from contracts import RiskContext
from services.recommend import get_recommendation_engine

ctx = RiskContext(
    defect_counts={'FADED_ZEBRA': 1}, avg_congestion_pct=0.0, pedestrian_density=8.0,
    near_miss_count=0, school_zone_distance_m=50.0, pci_score=100.0, recent_incident_count=0,
)
for rec in get_recommendation_engine().recommend('SEG-42A-002', ctx):
    print(rec.rec_type, rec.priority, rec.rationale)
"
```

Tests: `MEMBER=m2 make mine`.

## Going real

See `impl.py`'s TODO block: real hour-bucketed congestion history instead of
the mock's single average, and evidence ids pulled from postgres instead of
fabricated placeholders.
