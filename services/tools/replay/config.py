"""Replay/simulation settings. Owned by M5."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ReplaySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    #: virtual clock multiplier — 60 means one simulated minute per real second
    REPLAY_SPEED: float = 60.0
    REPLAY_BUSES: int = 6
    REPLAY_LOOP: bool = True
    #: real seconds between simulation ticks
    REPLAY_TICK_SECONDS: float = 1.0

    MQTT_HOST: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_CLIENT_PREFIX: str = "urban-twin"

    #: nominal cruising speed; the simulator varies around this
    REPLAY_CRUISE_KMPH: float = 28.0
    #: camera frame rate the perception factories are told about
    REPLAY_FPS: float = 15.0


@lru_cache(maxsize=1)
def get_replay_settings() -> ReplaySettings:
    return ReplaySettings()
