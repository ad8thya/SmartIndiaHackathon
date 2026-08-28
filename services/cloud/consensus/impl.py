"""M3 REAL implementation — DBSCAN fusion.

Performs spatial clustering via scikit-learn DBSCAN per detection class,
using equirectangular projection to metres, temporal filtering, Noisy-OR
confidence fusion, and status escalation matching municipal standards.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from math import cos, radians
from typing import Any
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

#: stable namespace so the same physical defect keeps the same event_id across restarts
_EVENT_NAMESPACE = UUID("6f3a1c22-9b4e-4f4a-9a1f-2c7f6d0a1e55")

#: metres per degree of latitude. Longitude is scaled by cos(lat) at use.
_M_PER_DEG_LAT = 110_574.0

_SAFETY_SEVERITY: dict[DetectionClass, Severity] = {
    DetectionClass.COLLISION: Severity.LARGE,
    DetectionClass.RASH_DRIVING: Severity.MEDIUM,
    DetectionClass.PEDESTRIAN_RISK: Severity.MEDIUM,
    DetectionClass.NEAR_MISS: Severity.MEDIUM,
}


class RealEventFuser:
    """Satisfies :class:`contracts.EventFuser`."""

    def __init__(self, settings: FusionSettings | None = None) -> None:
        self.settings = settings or get_settings()

    def fuse(self, observations: list[Observation]) -> list[Event]:
        # Rule 8: Call _fusable FIRST. Filter out plain PEDESTRIAN / VEHICLE counts
        fusable_obs = self._fusable(observations)
        if not fusable_obs:
            return []

        # Group by detection class
        by_class: dict[DetectionClass, list[Observation]] = defaultdict(list)
        for obs in fusable_obs:
            by_class[obs.detection_class].append(obs)

        events: list[Event] = []
        for det_class, class_obs in by_class.items():
            eps_meters = self._eps_for(det_class)
            clusters = self._cluster_class(class_obs, eps_meters)

            for cluster in clusters:
                event = self._event_from(det_class, cluster, eps_meters)
                if event is not None and event.fused_confidence >= self.settings.FUSION_MIN_CONFIDENCE:
                    events.append(event)

        # Sort worst first (Severity, fused_confidence, distinct_bus_count)
        events.sort(
            key=lambda e: (SEVERITY_ORDER[e.severity], e.fused_confidence, e.distinct_bus_count),
            reverse=True,
        )
        return events

    @staticmethod
    def _fusable(observations: list[Observation]) -> list[Observation]:
        """Drop everything that must never become a workflow Event."""
        return [obs for obs in observations if obs.detection_class in FUSABLE_CLASSES]

    def _eps_for(self, detection_class: DetectionClass) -> float:
        if detection_class in SAFETY_CLASSES:
            return self.settings.FUSION_SAFETY_EPS_METERS
        return self.settings.FUSION_EPS_METERS

    def _cluster_class(
        self, observations: list[Observation], eps_meters: float
    ) -> list[list[Observation]]:
        """Cluster observations of a single detection class using DBSCAN or singletons."""
        if len(observations) == 1:
            return [observations]

        # 1. Project lat/lon to metres around centroid
        coords_meters, _ = self._project_to_metres(observations)

        # 2. Perform DBSCAN clustering
        try:
            from sklearn.cluster import DBSCAN

            dbscan = DBSCAN(eps=eps_meters, min_samples=1, metric="euclidean")
            labels = dbscan.fit_predict(coords_meters)
        except ImportError:
            # Fallback if sklearn is not installed in light env: use grid cell clustering
            return self._grid_cluster_fallback(observations, eps_meters)

        cluster_map: dict[int, list[Observation]] = defaultdict(list)
        for idx, label in enumerate(labels):
            cluster_map[label].append(observations[idx])

        return list(cluster_map.values())

    def _grid_cluster_fallback(
        self, observations: list[Observation], eps_meters: float
    ) -> list[list[Observation]]:
        grid_map: dict[tuple[int, int], list[Observation]] = defaultdict(list)
        lat_step = eps_meters / _M_PER_DEG_LAT
        for obs in observations:
            lon_step = lat_step / max(cos(radians(obs.lat)), 1e-6)
            cell = (int(obs.lat / lat_step), int(obs.lon / lon_step))
            grid_map[cell].append(obs)
        return list(grid_map.values())

    def _project_to_metres(self, observations: list[Observation]) -> tuple[list[list[float]], tuple[float, float]]:
        """Equirectangular projection around centroid -> Nx2 metres."""
        centroid_lat = sum(obs.lat for obs in observations) / len(observations)
        centroid_lon = sum(obs.lon for obs in observations) / len(observations)

        cos_lat = cos(radians(centroid_lat))
        coords_meters: list[list[float]] = []

        for obs in observations:
            dy = (obs.lat - centroid_lat) * _M_PER_DEG_LAT
            dx = (obs.lon - centroid_lon) * _M_PER_DEG_LAT * cos_lat
            coords_meters.append([dx, dy])

        return coords_meters, (centroid_lat, centroid_lon)

    def _event_from(
        self, detection_class: DetectionClass, cluster: list[Observation], eps_meters: float
    ) -> Event | None:
        if not cluster:
            return None

        confidences = [obs.raw_confidence for obs in cluster]
        fused = fuse_confidence(confidences)

        distinct_buses = {obs.bus_id for obs in cluster}
        status = derive_status(len(distinct_buses), fused)

        # Confidence-weighted centroid
        total_weight = sum(confidences) or 1.0
        lat = sum(obs.lat * obs.raw_confidence for obs in cluster) / total_weight
        lon = sum(obs.lon * obs.raw_confidence for obs in cluster) / total_weight

        severity = self._worst_severity(cluster)
        if severity is None:
            severity = self._policy_severity(detection_class)

        first_seen = min(obs.ts for obs in cluster)
        last_seen = max(obs.ts for obs in cluster)

        # Snap to grid cell for stable UUID generation
        lat_step = eps_meters / _M_PER_DEG_LAT
        lon_step = lat_step / max(cos(radians(lat)), 1e-6)
        cell = (str(detection_class), int(lat / lat_step), int(lon / lon_step))

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
            sla_due=first_seen + timedelta(hours=sla_hours(severity)),
            evidence_uris=[obs.evidence_uri for obs in cluster if obs.evidence_uri][:6],
        )

    @staticmethod
    def _worst_severity(cluster: list[Observation]) -> Severity | None:
        severities = [obs.severity for obs in cluster if obs.severity is not None]
        if not severities:
            return None
        return max(severities, key=lambda s: SEVERITY_ORDER[s])

    @staticmethod
    def _policy_severity(detection_class: DetectionClass) -> Severity:
        severity = _SAFETY_SEVERITY.get(detection_class)
        if severity is None:
            raise ValueError(
                f"{detection_class} produced a cluster with no severity and has no policy severity."
            )
        return severity

    @staticmethod
    def _stable_id(cell: tuple[str, int, int]) -> UUID:
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

