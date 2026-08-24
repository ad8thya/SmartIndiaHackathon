"""M1 module settings. Owned by M1 — nobody else edits this file."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class DefectSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    #: flip to true only when your own tests pass
    USE_REAL_DEFECTS: bool = False

    DEFECT_MODEL_PATH: str = "models/defects-yolov8n.pt"
    DEFECT_CONF_THRESHOLD: float = 0.45
    DEFECT_IOU_THRESHOLD: float = 0.45
    DEFECT_DEVICE: str = "cpu"
    #: below this speed the bus is stationary and frames are near-duplicates
    DEFECT_MIN_SPEED_KMPH: float = 3.0
    #: a hotspot fires when the bus passes within this many metres
    DEFECT_HOTSPOT_RADIUS_M: float = 70.0
    #: Probability per frame of an unscripted "new" defect (mock only). Keep it
    #: low: these are single-sighting events by construction, so a high rate
    #: buries the corroborated hotspots the demo is actually about.
    DEFECT_NOVEL_RATE: float = 0.008
    DEFECT_EVIDENCE_BASE_URI: str = "s3://urban-twin/evidence"


@lru_cache(maxsize=1)
def get_settings() -> DefectSettings:
    return DefectSettings()
