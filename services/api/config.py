"""API settings. Owned by M5."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_BASE_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174"
    LOG_LEVEL: str = "INFO"

    REDIS_URL: str = "redis://localhost:6379/0"
    MQTT_HOST: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_CLIENT_PREFIX: str = "urban-twin"

    #: how many recent observations the analytics endpoints work over
    OBSERVATION_BUFFER: int = 5000
    #: how often the background fuser turns observations into events
    FUSION_INTERVAL_SECONDS: float = 4.0
    #: how often a heartbeat TICK goes out on the websocket
    WS_TICK_SECONDS: float = 5.0
    #: newly fused events are written to postgres in batches this size
    EVENT_FLUSH_BATCH: int = 100

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_api_settings() -> ApiSettings:
    return ApiSettings()
