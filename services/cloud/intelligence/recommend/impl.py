"""M2 REAL implementation — recommendations from actual evidence, not proxies.

TODO (M2):
  1. The mock approximates "recurring congestion" with a single average
     congestion figure because RiskContext carries no hour-of-day signal.
     Replace with a real query: congestion_pct for this road_id, bucketed by
     hour, over the last N days (join against whatever M2's traffic history
     ends up persisted as) — recommend SIGNAL_TIMING only when the SAME hour
     bucket is consistently congested, not just "congested on average".
  2. evidence_event_ids: query postgres for the actual Event ids that
     triggered each rule (e.g. the ZEBRA_CROSSING events near this road, the
     NEAR_MISS events forming the cluster) instead of the mock's fabricated
     uuid5 placeholders. A recommendation an operator can click through to its
     source events is worth far more than one that cannot be audited.
  3. estimated_beneficiaries: derive from real pedestrian counts / footfall
     data if it becomes available, or from bus occupancy at nearby stops —
     the mock's linear scale-ups are a placeholder, not a model.
  4. Consider a real prioritisation: a weighted sum of (this road's
     UrbanRiskScore, estimated_beneficiaries, cost-to-implement) rather than
     hand-set priority per rule. Needs a cost table per RecommendationType,
     which does not exist yet.
  5. Keep `recommend()` pure and fast — called per request, same as
     TrafficAnalyzer.analyze() and WhatIfEngine.simulate().
"""

from __future__ import annotations

from contracts import InfrastructureRecommendation, RiskContext

from .config import RecommendSettings, get_settings


class RealRecommendationEngine:
    """Satisfies :class:`contracts.RecommendationEngine`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: RecommendSettings | None = None) -> None:
        self.settings = settings or get_settings()

    def recommend(self, road_id: str, ctx: RiskContext) -> list[InfrastructureRecommendation]:
        raise NotImplementedError(
            "M2: real recommendation generation is not wired up yet. "
            "Keep USE_REAL_RECOMMEND=false until this returns InfrastructureRecommendations."
        )

    def _recurring_congestion_hours(self, road_id: str) -> list[int]:
        """TODO: hours of day where this road is consistently congested."""
        raise NotImplementedError

    def _evidence_for(self, road_id: str, detection_class: str) -> list[str]:
        """TODO: actual Event ids from postgres matching this road + class."""
        raise NotImplementedError
