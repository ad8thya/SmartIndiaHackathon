"""M2 module settings (what-if half). Owned by M2."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class WhatIfSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    USE_REAL_WHATIF: bool = False

    WHATIF_MAX_CLOSED_ROADS: int = 5
    #: a closure adding more than this many minutes is not recommended
    WHATIF_TOLERABLE_DELTA_MIN: float = 10.0
    #: nominal passengers per bus trip, for the "affected passengers" figure
    WHATIF_PASSENGERS_PER_TRIP: int = 460
    WHATIF_GRAPH_CACHE: str = "data/chennai_drive_graph.pkl"


@lru_cache(maxsize=1)
def get_settings() -> WhatIfSettings:
    return WhatIfSettings()
