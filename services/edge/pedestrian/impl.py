"""M3 REAL implementation — pedestrian detection + risk scoring.

TODO (M3):
  1. Lazy-load a YOLOv8 person model in _ensure_model (do NOT import ultralytics
     at module scope — M5/M6 run without torch and still import this file).
  2. Track people across frames (ByteTrack / a Kalman filter from filterpy) so
     the same person is one track_id, not thirty observations.
  3. Estimate time-to-collision from the track's image-plane trajectory and the
     bus speed in meta. Below RISK_TTC_SECONDS → PEDESTRIAN_RISK.
  4. Weight by school-zone membership and time of day (zones carry
     active_hours). A child at 08:00 outside a school is a different risk from
     an adult at 23:00 on the same pavement.
  5. Emit PEDESTRIAN for plain presence and PEDESTRIAN_RISK for the dangerous
     interactions only — the map is useless if everything is red.
  6. Keep severity None. These are not infrastructure classes.
"""

from __future__ import annotations

from typing import Any

from contracts import Frame, FrameMeta, Observation

from .config import PedestrianSettings, get_settings


class RealPedestrianRiskDetector:
    """Satisfies :class:`contracts.PedestrianRiskDetector`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: PedestrianSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._model: Any = None
        self._tracker: Any = None

    def _ensure_model(self) -> Any:
        if self._model is None:
            from ultralytics import YOLO

            self._model = YOLO(self.settings.PEDESTRIAN_MODEL_PATH)
        return self._model

    def detect(self, frame: Frame, meta: FrameMeta) -> list[Observation]:
        raise NotImplementedError(
            "M3: real pedestrian risk detection is not wired up yet. "
            "Keep USE_REAL_PEDESTRIAN=false until this returns Observations."
        )

    def _time_to_collision(self, track: Any, meta: FrameMeta) -> float:
        """TODO: seconds until the person's path intersects the bus path."""
        raise NotImplementedError
