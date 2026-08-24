"""M2 module settings (recommendation engine). Owned by M2."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class RecommendSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    USE_REAL_RECOMMEND: bool = False

    #: a school within this distance justifies a ZEBRA_CROSSING recommendation
    RECOMMEND_SCHOOL_RADIUS_M: float = 150.0
    #: pedestrian sightings nearby above this, combined with a faded zebra and
    #: a nearby school, trigger ZEBRA_CROSSING
    RECOMMEND_PEDESTRIAN_THRESHOLD: float = 5.0
    #: average congestion above this reads as "recurring", not a one-off
    RECOMMEND_CONGESTION_THRESHOLD_PCT: float = 55.0
    RECOMMEND_CONGESTION_HIGH_PCT: float = 75.0
    #: waterlogging reports at which DRAINAGE fires, and the count at which its
    #: priority steps up from MODERATE to HIGH
    RECOMMEND_WATERLOGGING_MIN_COUNT: int = 2
    RECOMMEND_WATERLOGGING_HIGH_COUNT: int = 4
    #: near-misses in the context window at which a "cluster" is declared
    RECOMMEND_NEAR_MISS_CLUSTER_MIN: int = 2
    RECOMMEND_NEAR_MISS_CRITICAL_MIN: int = 3


@lru_cache(maxsize=1)
def get_settings() -> RecommendSettings:
    return RecommendSettings()
