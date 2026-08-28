"""M1 REAL implementation — YOLOv8 road surface distress detection.

This is the file M1 replaces during the week. Everything else in the repo
already calls it through ``factory.get_defect_detector()``, so when the flag
flips nothing else has to change.

TODO (M1) — suggested order, roughly one item per day:
  1. Load a YOLOv8 checkpoint in __init__ and keep it on self._model.
     Lazy-load, do not import ultralytics at module scope — M5/M6 run a light
     env without torch and must still be able to import this file.
  2. Map your model's class indices to DetectionClass. Keep the mapping in
     _CLASS_MAP below so it is reviewable.
  3. Estimate real-world size from the bbox to get an IRC:82-2015 severity.
     A homography from four road-plane points is enough; see
     contracts.severity_from_dimensions once you have millimetres.
  4. Save the crop and put its URI in evidence_uri.
  5. Suppress duplicates across consecutive frames (IoU + GPS delta) so one
     pothole does not become forty observations.
  6. Run test_module.py — it tests the Protocol, not the mock, so it should
     pass unchanged against this class.
  7. Set USE_REAL_DEFECTS=true in your .env and demo it.

Reference datasets: RDD2022 (India subset), Cracks-and-Potholes-in-Road.
"""

from __future__ import annotations

from typing import Any

from contracts import DetectionClass, Frame, FrameMeta, Observation

from .config import DefectSettings, get_settings

#: model class index → contract class. Fill this in when your weights are trained.
_CLASS_MAP: dict[int, DetectionClass] = {
    0: DetectionClass.POTHOLE,
    1: DetectionClass.LONGITUDINAL_CRACK,
    2: DetectionClass.TRANSVERSE_CRACK,
    3: DetectionClass.ALLIGATOR_CRACK,
    4: DetectionClass.WATERLOGGING,
    5: DetectionClass.DAMAGED_DIVIDER,
    6: DetectionClass.DAMAGED_SIGN,
    7: DetectionClass.FADED_ZEBRA,
}


class RealDefectDetector:
    """Satisfies :class:`contracts.DefectDetector`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: DefectSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._model: Any = None  # populated by _ensure_model()

    def _ensure_model(self) -> Any:
        """Lazy import so this module stays importable in a torch-free env."""
        if self._model is None:
            from ultralytics import YOLO

            self._model = YOLO(self.settings.DEFECT_MODEL_PATH)
        return self._model

    def detect(self, frame: Frame, meta: FrameMeta) -> list[Observation]:
        raise NotImplementedError(
            "M1: real defect detection is not wired up yet. "
            "Keep USE_REAL_DEFECTS=false until this returns Observations."
        )

    # ── helpers M1 will want ────────────────────────────────────────────────
    def _bbox_to_millimetres(self, bbox: Any, meta: FrameMeta) -> tuple[float, float]:
        """TODO: homography from image plane to road plane → (across_mm, depth_mm)."""
        raise NotImplementedError

    def _save_evidence(self, frame: Frame, bbox: Any, meta: FrameMeta) -> str:
        """TODO: crop, JPEG-encode, upload, return the URI."""
        raise NotImplementedError
