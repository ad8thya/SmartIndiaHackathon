"""API settings. Owned by M5."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_BASE_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "http://localhost:5173"
    #: matches every vite dev port from a browser on localhost OR on the same
    #: private LAN (a phone on the office wifi hitting the laptop's 192.168.x.x
    #: address) — without this, "open it on your phone" only ever half-works:
    #: the page loads (vite binds 0.0.0.0) but every fetch() to the api gets
    #: rejected because the phone's origin is never literally "localhost".
    CORS_ORIGIN_REGEX: str = (
        r"^http://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r"|192\.168\.\d{1,3}\.\d{1,3}):\d+$"
    )
    LOG_LEVEL: str = "INFO"

    #: Where the built frontend lives, for the one-container deployment. Unset
    #: (the default) means "look in the usual places, and if there is no build,
    #: assume vite is serving the UI" — see services/cloud/api/spa.py.
    WEB_DIST: str | None = None

    #: Same, for apps/mobile. It is mounted under /m rather than / because
    #: `/` is left free for a console build (WEB_DIST) — the mobile
    #: build is produced with `VITE_BASE=/m/` to match.
    MOBILE_DIST: str | None = None

    #: Where the offline basemap lives: the pmtiles extract, its glyphs and its
    #: sprites. Served at `/map` unconditionally — NOT off `WEB_DIST`.
    #:
    #: It used to be part of apps/web's build output, which meant the phone
    #: app's map depended on the desktop app being deployed. Two clients read
    #: this and neither owns it, so it is a repo-level asset with its own
    #: setting. Relative paths resolve from the process working directory,
    #: which is the repo root under `make dev` and `/app` in the container.
    MAP_DIR: str = "assets/map"

    #: Where citizen report photos are written. Files, not rows: a base64
    #: data URI in the table would ride along in every list response and in
    #: the WebSocket frame. Defaults under `data/` so `make dev` needs no
    #: setup; the container overrides it to a mounted volume.
    MEDIA_DIR: str = "data/media"

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
