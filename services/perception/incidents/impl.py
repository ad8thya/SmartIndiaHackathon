"""M4 REAL implementation — incident detection + ANPR.

Unlike the other detectors this one takes a *window* of frames, because an
incident is a temporal pattern: nothing in a single frame distinguishes a car
that stopped from a car that was hit.

TODO (M4):
  1. Lazy-load a vehicle detector + tracker in _ensure_model (no module-scope
     ultralytics import — M5/M6 run torch-free).
  2. Track vehicles across the window. Flag:
       COLLISION    — two tracks converge and at least one loses velocity abruptly
       RASH_DRIVING — lateral acceleration over RASH_LATERAL_ACCEL_MS2, or
                      repeated lane changes inside a short window
  3. Crop the plate from the best frame of the offending track (sharpest,
     largest, most frontal) and run PaddleOCR.
  4. Normalise the OCR string to the TN format and sanity-check it. Reject
     below ANPR_MIN_CONFIDENCE rather than publishing a guess — a wrong plate
     in a hit-and-run report is worse than no plate.
  5. PRIVACY, non-negotiable: put the readable string in `plate_text` (operator
     dossier, in memory) and `hash_plate(...)` output in `plate_hash`. Nothing
     that reaches the database or MQTT may contain a readable plate.
     See config.hash_plate — use it, do not roll your own.
  6. Write a narrative a human can read. The dossier is evidence; "COLLISION
     0.87" is not evidence.
"""

from __future__ import annotations

from typing import Any

from contracts import Frame, FrameMeta, IncidentReport

from .config import IncidentSettings, get_settings


class RealIncidentDetector:
    """Satisfies :class:`contracts.IncidentDetector`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: IncidentSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._model: Any = None
        self._ocr: Any = None

    def _ensure_model(self) -> Any:
        if self._model is None:
            from ultralytics import YOLO

            self._model = YOLO(self.settings.INCIDENT_MODEL_PATH)
        return self._model

    def _ensure_ocr(self) -> Any:
        if self._ocr is None:
            from paddleocr import PaddleOCR

            self._ocr = PaddleOCR(use_angle_cls=True, lang=self.settings.ANPR_LANG)
        return self._ocr

    def process(self, frames: list[Frame], meta: FrameMeta) -> list[IncidentReport]:
        raise NotImplementedError(
            "M4: real incident detection is not wired up yet. "
            "Keep USE_REAL_INCIDENTS=false until this returns IncidentReports."
        )

    def _read_plate(self, crop: Frame) -> tuple[str, float] | None:
        """TODO: OCR a plate crop → (normalised text, confidence), or None."""
        raise NotImplementedError

    def _classify_window(self, tracks: Any, meta: FrameMeta) -> Any:
        """TODO: COLLISION vs RASH_DRIVING vs nothing."""
        raise NotImplementedError
