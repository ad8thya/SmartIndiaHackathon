"""M3 REAL implementation — DBSCAN fusion.

The mock already uses the correct confidence and status maths; what it gets
wrong is clustering. Snap-to-grid splits any pair of observations that straddle
a cell boundary into two events, which on a busy corridor means duplicate pins.

TODO (M3):
  1. Project lat/lon to metres (equirectangular around the cluster centroid is
     plenty at city scale) so DBSCAN's eps is actually metres.
  2. sklearn.cluster.DBSCAN(eps=FUSION_EPS_METERS, min_samples=FUSION_MIN_SAMPLES,
     metric="euclidean") per detection_class — never cluster a pothole with a
     pedestrian.
  3. Treat DBSCAN noise (label -1) as single-observation events, not as
     discards. One bus seeing a large pothole at 0.9 still matters.
  4. Keep using contracts.fuse_confidence / derive_status. Do not invent a
     second ladder — M5's API and the panels both read the same one.
  5. Add temporal decay: an observation from six days ago should count less
     than one from this morning. FUSION_MAX_AGE_HOURS is the cut-off.
  6. Consider re-identification: Observation.reid_embedding lets you fuse the
     same *vehicle* across buses, which is what M4 needs for hit-and-run.
  7. Keep event ids stable across runs (see _stable_id in mock.py) or the map
     re-creates every pin on every reload.
  8. Call `_fusable()` FIRST, before clustering. Plain PEDESTRIAN presence and
     VEHICLE counts must never become workflow Events — see the note on
     contracts.FUSABLE_CLASSES. The mock enforces this today; the rule has to
     survive the swap to this class.
  9. Do NOT invent a severity when a cluster has none. Mirror mock.py: return
     None from your worst-severity helper and resolve it through an explicit
     per-class policy, so a collision never renders as a SMALL blue dot.
"""

from __future__ import annotations

from typing import Any

from contracts import FUSABLE_CLASSES, Event, Observation

from .config import FusionSettings, get_settings


class RealEventFuser:
    """Satisfies :class:`contracts.EventFuser`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: FusionSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._dbscan: Any = None

    def _ensure_dbscan(self) -> Any:
        if self._dbscan is None:
            from sklearn.cluster import DBSCAN

            self._dbscan = DBSCAN(
                eps=self.settings.FUSION_EPS_METERS,
                min_samples=self.settings.FUSION_MIN_SAMPLES,
                metric="euclidean",
            )
        return self._dbscan

    def fuse(self, observations: list[Observation]) -> list[Event]:
        raise NotImplementedError(
            "M3: DBSCAN fusion is not wired up yet. "
            "Keep USE_REAL_FUSION=false — the grid-cell fuser in mock.py is "
            "already using the correct confidence and status maths."
        )

    @staticmethod
    def _fusable(observations: list[Observation]) -> list[Observation]:
        """Drop everything that must never become a workflow Event.

        Not a TODO — this is the shared rule, and it is already correct. Call it
        as the first line of `fuse()`.
        """
        return [obs for obs in observations if obs.detection_class in FUSABLE_CLASSES]

    def _project_to_metres(self, observations: list[Observation]) -> Any:
        """TODO: equirectangular projection around the centroid → Nx2 metres."""
        raise NotImplementedError
