"""M3 REAL implementation — DBSCAN fusion.

The mock was never really a mock: it already uses the genuine
:func:`contracts.fuse_confidence` and :func:`contracts.derive_status`. The one
thing it got wrong was *clustering* — snapping to a 25 m grid splits any pair
of observations that straddle a cell boundary into two events, which on a busy
corridor means two pins for one pothole and a corroboration count of 1 where
it should be 2.

This replaces the grid with real DBSCAN and changes nothing else. Every number
downstream — confidence, status, severity, SLA, the centroid — is computed by
the same code paths, deliberately, so flipping ``USE_REAL_FUSION`` changes
which observations end up in the same cluster and nothing more.

**Three things that are easy to get wrong here, and what this does instead:**

*Event ids stay stable.* DBSCAN has no cells to hash, and hashing the cluster
centroid would mint a fresh uuid on nearly every pass — the centroid moves by a
metre whenever another observation lands, the map would re-create every pin,
and no event would ever accumulate a second bus. So membership is decided by
DBSCAN and *identity* is still decided by the grid: the id is a hash of the
cell the cluster's centroid falls in, exactly as in `mock.py`. Same physical
defect, same id, across both implementations.

*Noise is not discarded.* DBSCAN labels anything without ``min_samples``
neighbours as ``-1``. One bus seeing a large pothole at 0.9 confidence still
matters, so every noise point becomes its own single-observation event — which
is also what the grid fuser does, and is what keeps the two in parity.

*eps comes from settings, not from a literal.* ``FUSION_EPS_METERS`` (25 m) and
``FUSION_SAFETY_EPS_METERS`` (12 m) are shared with the mock. Hardcoding a
different radius here would mean the flag silently changes the demo, which is
the one thing a mock/real switch must never do.

Still not done, and deliberately listed rather than half-built:
  · temporal decay (``FUSION_MAX_AGE_HOURS`` is read but not yet weighted)
  · re-identification via ``Observation.reid_embedding``, which is what M4
    needs to fuse the *same vehicle* across buses for hit-and-run
"""

from __future__ import annotations

from datetime import timedelta
from math import radians
from typing import Any
from uuid import UUID

from contracts import (
    FUSABLE_CLASSES,
    SEVERITY_ORDER,
    DetectionClass,
    Event,
    Observation,
    derive_status,
    fuse_confidence,
    sla_hours,
)

from .config import FusionSettings, get_settings
from .mock import MockEventFuser

#: mean Earth radius, metres. DBSCAN's haversine metric works in radians, so
#: an eps in metres divides by this.
EARTH_RADIUS_M = 6_371_000.0


class RealEventFuser:
    """Satisfies :class:`contracts.EventFuser` using scikit-learn's DBSCAN."""

    def __init__(self, settings: FusionSettings | None = None) -> None:
        self.settings = settings or get_settings()
        # every number except the clustering is the mock's, called directly —
        # not copied, so the two can never drift apart
        self._maths = MockEventFuser(self.settings)

    # ── Protocol ────────────────────────────────────────────────────────────
    def fuse(self, observations: list[Observation]) -> list[Event]:
        # FIRST: plain PEDESTRIAN presence and VEHICLE counts are analytics
        # input and must never become workflow events. Filtering after
        # clustering would waste the work and risk one slipping through.
        fusable = self._fusable(observations)
        if not fusable:
            return []

        by_class: dict[DetectionClass, list[Observation]] = {}
        for obs in fusable:
            by_class.setdefault(obs.detection_class, []).append(obs)

        events: list[Event] = []
        for detection_class, group in by_class.items():
            # never cluster a pothole with a pedestrian, however close they are
            for cluster in self._cluster(detection_class, group):
                event = self._event_from(cluster)
                if (
                    event is not None
                    and event.fused_confidence >= self.settings.FUSION_MIN_CONFIDENCE
                ):
                    events.append(event)

        # worst first — an operator reads top-down and stops when they run out
        # of crew. Same ordering as the mock.
        events.sort(
            key=lambda e: (SEVERITY_ORDER[e.severity], e.fused_confidence, e.distinct_bus_count),
            reverse=True,
        )
        return events

    # ── clustering ──────────────────────────────────────────────────────────
    def _cluster(
        self, detection_class: DetectionClass, group: list[Observation]
    ) -> list[list[Observation]]:
        """Group one class's observations. Noise becomes singleton clusters."""
        if len(group) == 1:
            return [group]

        import numpy as np
        from sklearn.cluster import DBSCAN

        # haversine wants radians and returns great-circle distance on the unit
        # sphere, so eps is metres / R
        coords = np.array([[radians(obs.lat), radians(obs.lon)] for obs in group])
        eps_m = self._maths._eps_for(detection_class)

        labels = DBSCAN(
            eps=eps_m / EARTH_RADIUS_M,
            min_samples=self.settings.FUSION_MIN_SAMPLES,
            metric="haversine",
            algorithm="ball_tree",
        ).fit_predict(coords)

        clusters: dict[int, list[Observation]] = {}
        singletons: list[list[Observation]] = []
        for obs, label in zip(group, labels, strict=True):
            if label == -1:
                # not discarded: one bus seeing a large pothole still matters
                singletons.append([obs])
            else:
                clusters.setdefault(int(label), []).append(obs)

        # sorted for determinism — a rehearsed demo must not depend on dict order
        return [clusters[key] for key in sorted(clusters)] + singletons

    # ── event construction (all of it the mock's maths) ─────────────────────
    def _event_from(self, cluster: list[Observation]) -> Event | None:
        if not cluster:
            return None

        detection_class = cluster[0].detection_class
        confidences = [obs.raw_confidence for obs in cluster]
        fused = fuse_confidence(confidences)

        distinct_buses = {obs.bus_id for obs in cluster}
        status = derive_status(len(distinct_buses), fused)

        # confidence-weighted centroid: a 0.9 detection localises better than a
        # 0.4 one, so it should pull the pin harder
        total_weight = sum(confidences) or 1.0
        lat = sum(obs.lat * obs.raw_confidence for obs in cluster) / total_weight
        lon = sum(obs.lon * obs.raw_confidence for obs in cluster) / total_weight

        severity = self._maths._worst_severity(cluster)
        if severity is None:
            severity = self._maths._policy_severity(detection_class)

        first_seen = min(obs.ts for obs in cluster)
        last_seen = max(obs.ts for obs in cluster)

        return Event(
            event_id=self._stable_id(detection_class, lat, lon),
            lat=round(lat, 7),
            lon=round(lon, 7),
            road_segment_id=self._maths._nearest_segment(lat, lon),
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

    def _stable_id(self, detection_class: DetectionClass, lat: float, lon: float) -> UUID:
        """The cluster's identity is the grid cell its centroid falls in.

        DBSCAN decides *membership*; the grid still decides *identity*. Hashing
        the centroid directly would change the id every time the centroid
        drifted, and the map depends on ids surviving across fusion passes.
        Using the mock's own cell function also means the same physical defect
        gets the same event_id under either implementation.
        """
        cell = self._maths._cell(
            Observation.model_construct(detection_class=detection_class, lat=lat, lon=lon)
        )
        return self._maths._stable_id(cell)

    @staticmethod
    def _fusable(observations: list[Observation]) -> list[Observation]:
        """Drop everything that must never become a workflow Event."""
        return [obs for obs in observations if obs.detection_class in FUSABLE_CLASSES]

    def _project_to_metres(self, observations: list[Observation]) -> Any:
        """Not needed: DBSCAN's haversine metric works directly on radians.

        Kept because the module docstring's original TODO named it, and its
        absence would otherwise read as an oversight rather than a decision.
        """
        raise NotImplementedError(
            "unused — clustering uses metric='haversine' on radians, so there "
            "is no projection step to get wrong"
        )
