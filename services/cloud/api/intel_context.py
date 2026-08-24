"""Shared RiskContext builder for the AI intelligence layer. Owned by M5.

`routers/intelligence.py`, `routers/roads.py` and `routers/analytics.py` all
need the same `RiskContext` for a given road. Building it in exactly one place
keeps the risk score an operator sees on `/api/roads` in sync with the one on
`/api/roads/{id}/risk` and the one behind `critical_risk_roads` in the KPI
strip — the same drift bug `routers/events.py::merged_events()` exists to
prevent for the event backlog.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from citydata import SCHOOL_ZONES, haversine_m, segment_by_id
from contracts import DetectionClass, RiskContext, RoadCondition

from services.edge.incidents.near_miss import scripted_near_misses

from .hub import LiveState

__all__ = ["build_risk_context", "near_miss_count_for_road"]

#: an observation counts towards a road's pedestrian density within this radius
_PEDESTRIAN_RADIUS_M = 250.0
#: near-misses older than this do not count towards the 7-day frequency
_NEAR_MISS_WINDOW = timedelta(days=7)

_PEDESTRIAN_CLASSES = (DetectionClass.PEDESTRIAN, DetectionClass.PEDESTRIAN_RISK)


def near_miss_count_for_road(road_id: str, now: datetime | None = None) -> int:
    """How many of the scripted near-miss events sit on this road, in the
    last 7 days. Shared so `/api/roads`, `/api/roads/{id}/risk` and the KPI
    strip's `near_misses_7d` never disagree."""
    now = now or datetime.now(tz=UTC)
    return sum(
        1
        for event in scripted_near_misses(now)
        if event.road_id == road_id and now - event.ts <= _NEAR_MISS_WINDOW
    )


def build_risk_context(
    road_id: str, state: LiveState, condition: RoadCondition | None
) -> RiskContext:
    """Everything RiskScorer and RecommendationEngine need for one road,
    assembled from LiveState plus static city reference data.

    An unknown `road_id` still returns a usable (mostly-empty) context rather
    than raising — the caller (an API route) has already 404'd by the time
    this would be reached for a genuinely unknown road; this defends against
    a road that traffic knows about but citydata's segment table does not.
    """
    try:
        lon, lat = segment_by_id(road_id).center
    except KeyError:
        lon = lat = None

    defect_counts = dict(condition.defect_counts) if condition is not None else {}
    avg_congestion_pct = condition.congestion_pct if condition is not None else 0.0
    pci_score = condition.pci_score if condition is not None else 100.0

    pedestrian_density = 0.0
    school_zone_distance_m: float | None = None
    if lat is not None and lon is not None:
        pedestrian_density = float(
            sum(
                1
                for obs in state.recent_observations()
                if obs.detection_class in _PEDESTRIAN_CLASSES
                and haversine_m(obs.lat, obs.lon, lat, lon) <= _PEDESTRIAN_RADIUS_M
            )
        )
        school_zone_distance_m = min(
            haversine_m(lat, lon, zone.center[1], zone.center[0]) for zone in SCHOOL_ZONES
        )

    recent_incident_count = sum(
        1 for incident in state.incidents if incident.road_segment_id == road_id
    )

    return RiskContext(
        defect_counts=defect_counts,
        avg_congestion_pct=avg_congestion_pct,
        pedestrian_density=pedestrian_density,
        near_miss_count=near_miss_count_for_road(road_id),
        school_zone_distance_m=school_zone_distance_m,
        pci_score=pci_score,
        recent_incident_count=recent_incident_count,
    )
