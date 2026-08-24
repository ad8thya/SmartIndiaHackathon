"""M3 FUSION — grid-cell clustering with the real confidence maths.

This is the one "mock" in the repo that is not really a mock. Fusion is the
heart of the credibility story — *three different buses saw this, therefore it
is real* — so it uses the genuine
:func:`contracts.fuse_confidence` and :func:`contracts.derive_status` from day
one. Only the clustering is simplified: a snap-to-grid instead of DBSCAN.

Why grid-cell first:
  * O(n) with no scikit-learn dependency, so M5 and M6 can run fusion in a light
    env and still see events on the map
  * deterministic — the same observations always produce the same events, which
    matters when you are rehearsing a demo
  * good enough at 25 m: Chennai potholes are not 25 m apart

Its known weakness is the one DBSCAN fixes: two observations either side of a
cell boundary become two events. M3 replaces this with proper DBSCAN in
``impl.py``; the ladder maths does not change.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from math import cos, radians
from uuid import UUID, uuid5

from contracts import (
    FUSABLE_CLASSES,
    SAFETY_CLASSES,
    SEVERITY_ORDER,
    DetectionClass,
    Event,
    Observation,
    Severity,
    derive_status,
    fuse_confidence,
    sla_hours,
)

from .config import FusionSettings, get_settings

#: stable namespace so the same physical defect keeps the same event_id
#: across restarts — otherwise the map re-creates every pin on every reload
_EVENT_NAMESPACE = UUID("6f3a1c22-9b4e-4f4a-9a1f-2c7f6d0a1e55")

#: metres per degree of latitude. Longitude is scaled by cos(lat) at use.
_M_PER_DEG_LAT = 110_574.0

#: Severity for the four safety classes, which carry none on the Observation.
#:
#: This is an explicit, reviewable policy — NOT a fallback. The distinction
#: matters: a blanket default would render a hit-and-run as a small blue dot
#: next to a hairline crack, which is exactly backwards. Infrastructure classes
#: never reach this table because the Observation validator already guarantees
#: they carry an IRC:82-2015 severity.
#:
#: NEAR_MISS is usually set explicitly on the Observation (M4 derives it from
#: min_ttc_seconds — see services/perception/incidents/near_miss.py) so this
#: entry is the fallback for the rare cluster where none of the observations
#: carried one.
_SAFETY_SEVERITY: dict[DetectionClass, Severity] = {
    DetectionClass.COLLISION: Severity.LARGE,
    DetectionClass.RASH_DRIVING: Severity.MEDIUM,
    DetectionClass.PEDESTRIAN_RISK: Severity.MEDIUM,
    DetectionClass.NEAR_MISS: Severity.MEDIUM,
}


class MockEventFuser:
    """Satisfies :class:`contracts.EventFuser`."""

    def __init__(self, settings: FusionSettings | None = None) -> None:
        self.settings = settings or get_settings()

    # ── Protocol ────────────────────────────────────────────────────────────
    def fuse(self, observations: list[Observation]) -> list[Event]:
        clusters: dict[tuple[str, int, int], list[Observation]] = defaultdict(list)
        for obs in observations:
            # plain PEDESTRIAN presence and VEHICLE counts are analytics input,
            # not backlog items — see contracts.FUSABLE_CLASSES
            if obs.detection_class not in FUSABLE_CLASSES:
                continue
            clusters[self._cell(obs)].append(obs)

        events: list[Event] = []
        for cell, cluster in clusters.items():
            event = self._event_from(cell, cluster)
            if event is not None and event.fused_confidence >= self.settings.FUSION_MIN_CONFIDENCE:
                events.append(event)

        # worst first — an operator reads top-down and stops when they run out of crew
        events.sort(
            key=lambda e: (SEVERITY_ORDER[e.severity], e.fused_confidence, e.distinct_bus_count),
            reverse=True,
        )
        return events

    # ── internals ───────────────────────────────────────────────────────────
    def _eps_for(self, detection_class: DetectionClass) -> float:
        """Two people 25 m apart are two people; two pothole reports are one hole."""
        if detection_class in SAFETY_CLASSES:
            return self.settings.FUSION_SAFETY_EPS_METERS
        return self.settings.FUSION_EPS_METERS

    def _cell(self, obs: Observation) -> tuple[str, int, int]:
        """Snap to a grid whose cell size is the class's clustering radius."""
        eps = self._eps_for(obs.detection_class)
        lat_step = eps / _M_PER_DEG_LAT
        # a degree of longitude shrinks with latitude — at 13°N it is ~97% of a
        # degree of latitude, and ignoring this stretches cells east-west
        lon_step = lat_step / max(cos(radians(obs.lat)), 1e-6)
        return (str(obs.detection_class), int(obs.lat / lat_step), int(obs.lon / lon_step))

    def _event_from(self, cell: tuple[str, int, int], cluster: list[Observation]) -> Event | None:
        if not cluster:
            return None

        detection_class = cluster[0].detection_class
        confidences = [obs.raw_confidence for obs in cluster]
        fused = fuse_confidence(confidences)

        distinct_buses = {obs.bus_id for obs in cluster}
        status = derive_status(len(distinct_buses), fused)

        # centroid, weighted by confidence — a 0.9 detection localises better
        # than a 0.4 one, so it should pull the pin harder
        total_weight = sum(confidences) or 1.0
        lat = sum(obs.lat * obs.raw_confidence for obs in cluster) / total_weight
        lon = sum(obs.lon * obs.raw_confidence for obs in cluster) / total_weight

        severity = self._worst_severity(cluster)
        if severity is None:
            severity = self._policy_severity(detection_class)
        first_seen = min(obs.ts for obs in cluster)
        last_seen = max(obs.ts for obs in cluster)

        return Event(
            event_id=self._stable_id(cell),
            lat=round(lat, 7),
            lon=round(lon, 7),
            road_segment_id=self._nearest_segment(lat, lon),
            detection_class=detection_class,
            severity=severity,
            fused_confidence=round(fused, 4),
            observation_count=len(cluster),
            distinct_bus_count=len(distinct_buses),
            first_seen=first_seen,
            last_seen=last_seen,
            status=status,
            assigned_team=None,
            sla_due=last_seen + timedelta(hours=sla_hours(severity)),
            evidence_uris=[obs.evidence_uri for obs in cluster if obs.evidence_uri][:6],
        )

    @staticmethod
    def _worst_severity(cluster: list[Observation]) -> Severity | None:
        """Take the worst reported severity, not the average.

        If one bus says LARGE and three say SMALL, send a crew for a LARGE. The
        cost of over-preparing is a wasted trip; the cost of under-preparing is
        a second trip and a week's delay.

        Returns ``None`` when nothing in the cluster reported a severity. It
        deliberately does NOT invent one — the caller decides, visibly.
        """
        severities = [obs.severity for obs in cluster if obs.severity is not None]
        if not severities:
            return None
        return max(severities, key=lambda s: SEVERITY_ORDER[s])

    @staticmethod
    def _policy_severity(detection_class: DetectionClass) -> Severity:
        """Severity for a class whose Observations legitimately carry none.

        Only the three safety classes reach here. An infrastructure class with
        no severity means an Observation got past its own validator, which is a
        contract violation upstream — fail loudly rather than paper over it.
        """
        severity = _SAFETY_SEVERITY.get(detection_class)
        if severity is None:
            raise ValueError(
                f"{detection_class} produced a cluster with no severity and has no "
                f"policy severity. Infrastructure classes must always carry one — "
                f"check whoever constructed these Observations."
            )
        return severity

    @staticmethod
    def _stable_id(cell: tuple[str, int, int]) -> UUID:
        """Same physical thing → same event_id, run after run.

        Keyed off the *grid cell*, deliberately, not the cluster centroid. The
        centroid shifts by a metre or two every time another observation lands,
        so hashing it would mint a fresh uuid on nearly every fusion pass — the
        map would re-create every pin, and no event would ever accumulate a
        second corroborating bus.
        """
        detection_class, lat_cell, lon_cell = cell
        return uuid5(_EVENT_NAMESPACE, f"{detection_class}:{lat_cell}:{lon_cell}")

    @staticmethod
    def _nearest_segment(lat: float, lon: float) -> str | None:
        from citydata import SEGMENTS, haversine_m

        best: tuple[float, str] | None = None
        for segment in SEGMENTS:
            distance = haversine_m(lat, lon, segment.center[1], segment.center[0])
            if best is None or distance < best[0]:
                best = (distance, segment.road_id)
        if best is None or best[0] > 2_000.0:
            return None
        return best[1]
