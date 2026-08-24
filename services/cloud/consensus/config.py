"""M3 module settings (fusion half). Owned by M3."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class FusionSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    USE_REAL_FUSION: bool = False

    #: DBSCAN eps, in metres — two detections closer than this are the same thing
    FUSION_EPS_METERS: float = 25.0
    FUSION_MIN_SAMPLES: int = 2
    #: observations older than this stop contributing to a live event
    FUSION_MAX_AGE_HOURS: int = 168
    #: below this fused confidence an event is not worth showing at all
    FUSION_MIN_CONFIDENCE: float = 0.35
    #: safety classes get a tighter radius — two people 25 m apart are two people
    FUSION_SAFETY_EPS_METERS: float = 12.0


@lru_cache(maxsize=1)
def get_settings() -> FusionSettings:
    return FusionSettings()
