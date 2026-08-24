"""M2 module settings (traffic half). Owned by M2."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class TrafficSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    USE_REAL_TRAFFIC: bool = False

    #: rolling window for density / speed aggregation
    TRAFFIC_WINDOW_MINUTES: int = 15
    #: an observation is assigned to the nearest segment within this radius
    TRAFFIC_SNAP_RADIUS_M: float = 250.0
    #: jam density (veh/km/lane) used to normalise congestion to a percentage
    TRAFFIC_JAM_DENSITY: float = 120.0
    #: minutes of delay a bus accrues per 10% of congestion, per segment
    TRAFFIC_DELAY_PER_10PCT_MIN: float = 0.8
    #: PCI floor — a road never scores below this in the demo
    TRAFFIC_MIN_PCI: float = 15.0


@lru_cache(maxsize=1)
def get_settings() -> TrafficSettings:
    return TrafficSettings()
