"""M3 MOCK — a real, transparent weighted index.

This is not a placeholder standing in for something smarter later — it *is*
the intended v1 implementation. A government engineer who has to justify a
work order needs to see exactly why a road scored 62, not trust a black box.
The learned upgrade (impl.py, once repair-outcome data exists) has to beat
this on accuracy AND keep the same explainability, or it is not an upgrade.

    road damage / PCI        30%
    congestion                20%
    pedestrian density        15%
    school proximity          15%
    near-miss frequency       12%
    recent incidents           8%

Every component is computed independently from `RiskContext`, so `components`
always sums to `score` exactly (up to float precision, which is what
UrbanRiskScore's 0.01 tolerance absorbs) and `explanation` always has one
human-readable line per component — even a component contributing 0.0 gets a
line, so the list is never empty.
"""

from __future__ import annotations

from datetime import UTC, datetime

from contracts import RiskBand, RiskContext, UrbanRiskScore

from .config import RiskSettings, get_settings


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


class MockRiskScorer:
    """Satisfies :class:`contracts.RiskScorer`."""

    def __init__(self, settings: RiskSettings | None = None) -> None:
        self.settings = settings or get_settings()

    # ── Protocol ────────────────────────────────────────────────────────────
    def score(self, road_id: str, ctx: RiskContext) -> UrbanRiskScore:
        s = self.settings

        defect_total = sum(ctx.defect_counts.values())
        damage = _clamp01((100.0 - ctx.pci_score) / 100.0) * s.RISK_WEIGHT_DAMAGE
        congestion = _clamp01(ctx.avg_congestion_pct / 100.0) * s.RISK_WEIGHT_CONGESTION
        pedestrian = (
            _clamp01(ctx.pedestrian_density / s.RISK_PEDESTRIAN_SATURATION)
            * s.RISK_WEIGHT_PEDESTRIAN
        )
        if ctx.school_zone_distance_m is None:
            school = 0.0
        else:
            school = (
                _clamp01(1.0 - ctx.school_zone_distance_m / s.RISK_SCHOOL_RADIUS_M)
                * s.RISK_WEIGHT_SCHOOL
            )
        near_miss = (
            _clamp01(ctx.near_miss_count / s.RISK_NEAR_MISS_SATURATION) * s.RISK_WEIGHT_NEAR_MISS
        )
        incidents = (
            _clamp01(ctx.recent_incident_count / s.RISK_INCIDENT_SATURATION)
            * s.RISK_WEIGHT_INCIDENTS
        )

        components = {
            "road_damage": damage,
            "congestion": congestion,
            "pedestrian_density": pedestrian,
            "school_proximity": school,
            "near_miss_frequency": near_miss,
            "recent_incidents": incidents,
        }
        # sum, not a rounded re-addition — components must add back to this
        # exactly (within UrbanRiskScore's 0.01 tolerance), not to a rounded
        # look-alike of it
        score = sum(components.values())

        explanation = [
            f"{defect_total} defect(s), PCI {ctx.pci_score:.0f}/100 (+{damage:.1f})",
            f"{ctx.avg_congestion_pct:.0f}% average congestion (+{congestion:.1f})",
            f"{ctx.pedestrian_density:.0f} pedestrian sighting(s) nearby (+{pedestrian:.1f})",
            (
                f"school zone {ctx.school_zone_distance_m:.0f}m away (+{school:.1f})"
                if ctx.school_zone_distance_m is not None
                else f"no school zone within range (+{school:.1f})"
            ),
            f"{ctx.near_miss_count} near-miss event(s) in 7d (+{near_miss:.1f})",
            f"{ctx.recent_incident_count} recent incident(s) (+{incidents:.1f})",
        ]

        return UrbanRiskScore(
            road_id=road_id,
            score=score,
            band=self._band(score),
            computed_at=datetime.now(tz=UTC),
            components=components,
            explanation=explanation,
        )

    # ── internals ───────────────────────────────────────────────────────────
    def _band(self, score: float) -> RiskBand:
        s = self.settings
        if score < s.RISK_BAND_LOW_MAX:
            return RiskBand.LOW
        if score < s.RISK_BAND_MODERATE_MAX:
            return RiskBand.MODERATE
        if score < s.RISK_BAND_HIGH_MAX:
            return RiskBand.HIGH
        return RiskBand.CRITICAL
