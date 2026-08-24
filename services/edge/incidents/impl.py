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

TODO (M4) — NEAR-MISS, the project's most novel feature. Read this twice
before touching near_miss.py's real implementation; it is easy to misbuild by
reaching for a new model when none is needed.

  THIS REQUIRES ZERO NEW MODELS. Everything it needs already exists once the
  vehicle tracker above and M3's pedestrian tracker are both running:

  1. Reuse the EXISTING ByteTrack output from both trackers — do NOT train a
     dedicated near-miss detector. A near-miss is a *geometric relationship*
     between two tracks that already exist, not a new visual class to learn.
  2. Ground-plane homography: project each track's image-plane bounding-box
     centre onto the road plane using the same camera calibration M1 derives
     for `severity_from_dimensions`'s bbox-to-mm conversion — do not derive a
     second calibration.
  3. Time-to-collision from relative position and closing velocity: for a
     vehicle track and a pedestrian track both present in the same window,
     project both trajectories forward on the ground plane and compute the
     time at which their separation would reach zero, using the closing
     velocity between them (not either track's raw speed alone).
  4. Flag a candidate when TTC < 1.5s AND the pedestrian's projected position
     falls inside the vehicle's projected path (not just "nearby" — a
     pedestrian on the far pavement with a low TTC because they are jogging
     alongside the bus is not a near-miss).
  5. Severity from TTC, not from IRC:82-2015 (that table is for surface
     distress dimensions and does not apply here):
       TTC < 0.5s  -> LARGE
       TTC < 1.0s  -> MEDIUM
       otherwise   -> SMALL
  6. Emit as an Observation with `detection_class=DetectionClass.NEAR_MISS`
     and the derived `severity`, exactly like `near_miss.py`'s mock does —
     the fusion path does not change between mock and real.
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
