"""M2 MOCK — deterministic proximity rules.

Five triggers, each keyed off `RiskContext` (the same evidence `RiskScorer`
sees, so the two never disagree about what is happening on a road):

    zebra crossing + school within 150m + elevated pedestrian density
        -> ZEBRA_CROSSING, priority HIGH
    recurring congestion (approximated here as sustained average congestion —
    RiskContext does not carry hour-of-day granularity)
        -> SIGNAL_TIMING
    damaged divider present
        -> DIVIDER
    repeated waterlogging at one point
        -> DRAINAGE
    near-miss cluster
        -> SPEED_CALMING

`SIGNAGE` and `STREET_LIGHT` are reserved `RecommendationType` members with no
mock trigger yet — the real implementation's richer rule set (impl.py) is
expected to use them once it has evidence to key off (e.g. a DAMAGED_SIGN
defect, or incidents clustering after dark).

Every recommendation carries `rationale` and `evidence_event_ids` — the mock
fabricates stable, deterministic evidence ids (uuid5 off road_id + rule) since
`RiskContext` does not carry raw Event ids; the real implementation looks up
the actual triggering Events from postgres (see impl.py).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid5

from citydata import segment_by_id
from contracts import (
    DetectionClass,
    InfrastructureRecommendation,
    RecommendationType,
    RiskBand,
    RiskContext,
)

from .config import RecommendSettings, get_settings

#: stable namespace for fabricated evidence ids — see module docstring
_EVIDENCE_NAMESPACE = UUID("2a9e6c68-2d63-4b7a-9b0e-2b3f6a1d7c40")


def _evidence_ids(road_id: str, rec_type: RecommendationType, count: int) -> list[UUID]:
    count = max(1, min(count, 5))
    return [uuid5(_EVIDENCE_NAMESPACE, f"{road_id}:{rec_type}:{i}") for i in range(count)]


class MockRecommendationEngine:
    """Satisfies :class:`contracts.RecommendationEngine`."""

    def __init__(self, settings: RecommendSettings | None = None) -> None:
        self.settings = settings or get_settings()

    # ── Protocol ────────────────────────────────────────────────────────────
    def recommend(self, road_id: str, ctx: RiskContext) -> list[InfrastructureRecommendation]:
        try:
            lon, lat = segment_by_id(road_id).center
        except KeyError:
            # an operator will click something stale — no crash, no recommendations
            return []

        now = datetime.now(tz=UTC)
        recs: list[InfrastructureRecommendation] = []

        zebra = self._zebra_crossing(road_id, ctx, lat, lon, now)
        if zebra is not None:
            recs.append(zebra)

        signal = self._signal_timing(road_id, ctx, lat, lon, now)
        if signal is not None:
            recs.append(signal)

        divider = self._divider(road_id, ctx, lat, lon, now)
        if divider is not None:
            recs.append(divider)

        drainage = self._drainage(road_id, ctx, lat, lon, now)
        if drainage is not None:
            recs.append(drainage)

        speed_calming = self._speed_calming(road_id, ctx, lat, lon, now)
        if speed_calming is not None:
            recs.append(speed_calming)

        return recs

    # ── rules ───────────────────────────────────────────────────────────────
    def _zebra_crossing(
        self, road_id: str, ctx: RiskContext, lat: float, lon: float, now: datetime
    ) -> InfrastructureRecommendation | None:
        crossings = ctx.defect_counts.get(str(DetectionClass.ZEBRA_CROSSING), 0)
        near_school = (
            ctx.school_zone_distance_m is not None
            and ctx.school_zone_distance_m <= self.settings.RECOMMEND_SCHOOL_RADIUS_M
        )
        elevated_peds = ctx.pedestrian_density >= self.settings.RECOMMEND_PEDESTRIAN_THRESHOLD
        if not (crossings > 0 and near_school and elevated_peds):
            return None

        return InfrastructureRecommendation(
            road_id=road_id,
            lat=lat,
            lon=lon,
            rec_type=RecommendationType.ZEBRA_CROSSING,
            priority=RiskBand.HIGH,
            rationale=[
                f"{crossings} zebra crossing report(s) on this road",
                f"school zone {ctx.school_zone_distance_m:.0f}m away "
                f"(within {self.settings.RECOMMEND_SCHOOL_RADIUS_M:.0f}m)",
                f"{ctx.pedestrian_density:.0f} pedestrian sighting(s) nearby "
                f"(≥ {self.settings.RECOMMEND_PEDESTRIAN_THRESHOLD:.0f})",
            ],
            evidence_event_ids=_evidence_ids(road_id, RecommendationType.ZEBRA_CROSSING, crossings),
            estimated_beneficiaries=int(ctx.pedestrian_density * 20),
            detected_at=now,
        )

    def _signal_timing(
        self, road_id: str, ctx: RiskContext, lat: float, lon: float, now: datetime
    ) -> InfrastructureRecommendation | None:
        if ctx.avg_congestion_pct < self.settings.RECOMMEND_CONGESTION_THRESHOLD_PCT:
            return None

        priority = (
            RiskBand.HIGH
            if ctx.avg_congestion_pct >= self.settings.RECOMMEND_CONGESTION_HIGH_PCT
            else RiskBand.MODERATE
        )
        return InfrastructureRecommendation(
            road_id=road_id,
            lat=lat,
            lon=lon,
            rec_type=RecommendationType.SIGNAL_TIMING,
            priority=priority,
            rationale=[
                f"sustained average congestion of {ctx.avg_congestion_pct:.0f}% "
                f"(≥ {self.settings.RECOMMEND_CONGESTION_THRESHOLD_PCT:.0f}%) reads as recurring, "
                f"not a one-off incident"
            ],
            evidence_event_ids=_evidence_ids(road_id, RecommendationType.SIGNAL_TIMING, 1),
            estimated_beneficiaries=int(ctx.avg_congestion_pct * 50),
            detected_at=now,
        )

    def _divider(
        self, road_id: str, ctx: RiskContext, lat: float, lon: float, now: datetime
    ) -> InfrastructureRecommendation | None:
        damaged = ctx.defect_counts.get(str(DetectionClass.DAMAGED_DIVIDER), 0)
        if damaged <= 0:
            return None

        return InfrastructureRecommendation(
            road_id=road_id,
            lat=lat,
            lon=lon,
            rec_type=RecommendationType.DIVIDER,
            priority=RiskBand.HIGH,
            rationale=[f"{damaged} damaged median divider report(s) on this road"],
            evidence_event_ids=_evidence_ids(road_id, RecommendationType.DIVIDER, damaged),
            estimated_beneficiaries=damaged * 100,
            detected_at=now,
        )

    def _drainage(
        self, road_id: str, ctx: RiskContext, lat: float, lon: float, now: datetime
    ) -> InfrastructureRecommendation | None:
        waterlogging = ctx.defect_counts.get(str(DetectionClass.WATERLOGGING), 0)
        if waterlogging < self.settings.RECOMMEND_WATERLOGGING_MIN_COUNT:
            return None

        priority = (
            RiskBand.HIGH
            if waterlogging >= self.settings.RECOMMEND_WATERLOGGING_HIGH_COUNT
            else RiskBand.MODERATE
        )
        return InfrastructureRecommendation(
            road_id=road_id,
            lat=lat,
            lon=lon,
            rec_type=RecommendationType.DRAINAGE,
            priority=priority,
            rationale=[
                f"{waterlogging} waterlogging reports at this point "
                f"(≥ {self.settings.RECOMMEND_WATERLOGGING_MIN_COUNT}) — repeated, not one storm"
            ],
            evidence_event_ids=_evidence_ids(road_id, RecommendationType.DRAINAGE, waterlogging),
            estimated_beneficiaries=waterlogging * 150,
            detected_at=now,
        )

    def _speed_calming(
        self, road_id: str, ctx: RiskContext, lat: float, lon: float, now: datetime
    ) -> InfrastructureRecommendation | None:
        if ctx.near_miss_count < self.settings.RECOMMEND_NEAR_MISS_CLUSTER_MIN:
            return None

        priority = (
            RiskBand.CRITICAL
            if ctx.near_miss_count >= self.settings.RECOMMEND_NEAR_MISS_CRITICAL_MIN
            else RiskBand.HIGH
        )
        return InfrastructureRecommendation(
            road_id=road_id,
            lat=lat,
            lon=lon,
            rec_type=RecommendationType.SPEED_CALMING,
            priority=priority,
            rationale=[
                f"{ctx.near_miss_count} near-miss events in 7d "
                f"(≥ {self.settings.RECOMMEND_NEAR_MISS_CLUSTER_MIN}) — a cluster, not a one-off"
            ],
            evidence_event_ids=_evidence_ids(
                road_id, RecommendationType.SPEED_CALMING, ctx.near_miss_count
            ),
            estimated_beneficiaries=ctx.near_miss_count * 200,
            detected_at=now,
        )
