"""M2 MOCK — congestion that breathes with the clock.

The heatmap has to *animate* or the twin looks like a screenshot. So congestion
here is a function of hour-of-day rather than of the observations: a twin-peaked
sinusoid with a morning peak around 09:00 and a heavier evening peak around
18:30, which is what Chennai actually does.

Observations still matter — they modulate the baseline, so as buses report more
VEHICLE detections on a corridor its density rises above the curve. That way
plugging in the real analyzer changes the numbers without changing the shape of
the UI.

PCI comes from the defect observations seen on each segment, so a road that M1
keeps finding potholes on visibly degrades over the course of a demo.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from math import cos, pi, sin

from citydata import SEGMENTS, SegmentSpec, haversine_m
from contracts import (
    INFRASTRUCTURE_CLASSES,
    DetectionClass,
    Observation,
    RiskLevel,
    RoadCondition,
    Severity,
)

from .config import TrafficSettings, get_settings

#: how much each severity knocks off a segment's Pavement Condition Index
_PCI_PENALTY = {Severity.SMALL: 1.5, Severity.MEDIUM: 4.0, Severity.LARGE: 9.0}


def congestion_curve(when: datetime, seed: float = 0.0) -> float:
    """Twin-peaked daily congestion, 0–100.

    Two gaussian-ish humps riding on a low overnight baseline. ``seed`` shifts
    each corridor slightly so the whole city does not pulse in unison — which
    would look synthetic on the heatmap.
    """
    hour = when.hour + when.minute / 60.0
    morning = 42.0 * _hump(hour, centre=9.0, width=2.4)
    evening = 55.0 * _hump(hour, centre=18.5, width=2.9)
    baseline = 12.0 + 6.0 * sin((hour / 24.0) * 2 * pi + seed)
    ripple = 4.0 * cos(hour * 1.7 + seed * 3.1)
    return max(0.0, min(100.0, baseline + morning + evening + ripple))


def _hump(x: float, centre: float, width: float) -> float:
    """Cheap bell curve without importing numpy."""
    z = (x - centre) / width
    return float(pow(2.718281828, -0.5 * z * z))


class MockTrafficAnalyzer:
    """Satisfies :class:`contracts.TrafficAnalyzer`."""

    def __init__(self, settings: TrafficSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._segments = list(SEGMENTS)

    # ── Protocol ────────────────────────────────────────────────────────────
    def analyze(self, observations: list[Observation]) -> dict[str, RoadCondition]:
        now = self._reference_time(observations)
        by_segment = self._bucket_by_segment(observations)

        conditions: dict[str, RoadCondition] = {}
        for index, segment in enumerate(self._segments):
            bucket = by_segment.get(segment.road_id, [])
            conditions[segment.road_id] = self._condition_for(segment, bucket, now, index)
        return conditions

    # ── internals ───────────────────────────────────────────────────────────
    @staticmethod
    def _reference_time(observations: list[Observation]) -> datetime:
        """Use the newest observation's clock so replay at 60x animates the curve."""
        if observations:
            return max(obs.ts for obs in observations)
        from datetime import UTC

        return datetime.now(tz=UTC)

    def _bucket_by_segment(self, observations: list[Observation]) -> dict[str, list[Observation]]:
        """Snap each observation to its nearest segment centre."""
        buckets: dict[str, list[Observation]] = defaultdict(list)
        radius = self.settings.TRAFFIC_SNAP_RADIUS_M
        for obs in observations:
            best: tuple[float, str] | None = None
            for segment in self._segments:
                distance = haversine_m(obs.lat, obs.lon, segment.center[1], segment.center[0])
                if distance <= radius and (best is None or distance < best[0]):
                    best = (distance, segment.road_id)
            if best is not None:
                buckets[best[1]].append(obs)
        return buckets

    def _condition_for(
        self,
        segment: SegmentSpec,
        observations: list[Observation],
        now: datetime,
        index: int,
    ) -> RoadCondition:
        # phase-shift each corridor so the city does not pulse in unison
        congestion = congestion_curve(now, seed=index * 0.7)

        vehicle_count = sum(
            1 for obs in observations if obs.detection_class is DetectionClass.VEHICLE
        )
        # observed traffic pushes the curve up, capped so the shape survives
        congestion = min(100.0, congestion + min(18.0, vehicle_count * 1.5))

        density = round(self.settings.TRAFFIC_JAM_DENSITY * (congestion / 100.0), 1)
        # Greenshields: speed falls linearly with density towards jam density
        avg_speed = round(max(4.0, segment.free_flow_kmph * (1.0 - 0.85 * (congestion / 100.0))), 1)
        delay = round((congestion / 10.0) * self.settings.TRAFFIC_DELAY_PER_10PCT_MIN, 1)

        defect_counts: dict[str, int] = defaultdict(int)
        pci = 100.0
        for obs in observations:
            if obs.detection_class in INFRASTRUCTURE_CLASSES:
                defect_counts[str(obs.detection_class)] += 1
                if obs.severity is not None:
                    pci -= _PCI_PENALTY[obs.severity]
        # a deterministic per-segment baseline so freshly seeded roads are not all 100
        pci -= index * 7 % 23
        pci = round(max(self.settings.TRAFFIC_MIN_PCI, pci), 1)

        return RoadCondition(
            road_id=segment.road_id,
            name=segment.name,
            density=density,
            avg_speed_kmph=avg_speed,
            congestion_pct=round(congestion, 1),
            pci_score=pci,
            defect_counts=dict(defect_counts),
            bus_delay_min=delay,
            risk_level=self._risk(congestion, pci),
        )

    @staticmethod
    def _risk(congestion: float, pci: float) -> RiskLevel:
        """Bad surface plus heavy traffic is the combination that hurts people."""
        score = congestion * 0.6 + (100.0 - pci) * 0.4
        if score >= 75.0:
            return RiskLevel.SEVERE
        if score >= 55.0:
            return RiskLevel.HIGH
        if score >= 35.0:
            return RiskLevel.MODERATE
        return RiskLevel.LOW
