"""M3 module settings (pedestrian half). Owned by M3."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class PedestrianSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    USE_REAL_PEDESTRIAN: bool = False

    PEDESTRIAN_MODEL_PATH: str = "models/pedestrian-yolov8n.pt"
    PEDESTRIAN_CONF_THRESHOLD: float = 0.50
    PEDESTRIAN_DEVICE: str = "cpu"
    #: a pedestrian inside this radius of a school zone centre is "in zone"
    SCHOOL_ZONE_RADIUS_M: float = 180.0
    #: time-to-collision below this many seconds is a RISK, not a sighting
    RISK_TTC_SECONDS: float = 2.5
    #: passing a school zone above this speed escalates the risk
    SCHOOL_ZONE_SPEED_LIMIT_KMPH: float = 25.0
    #: mock only — chance a frame near a zone produces a risk event
    RISK_EVENT_RATE: float = 0.35
    PEDESTRIAN_EVIDENCE_BASE_URI: str = "s3://urban-twin/evidence"


@lru_cache(maxsize=1)
def get_settings() -> PedestrianSettings:
    return PedestrianSettings()
