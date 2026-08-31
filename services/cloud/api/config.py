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

    # ── repair verification ─────────────────────────────────────────────
    #: Clean passes needed before a repair is auto-verified.
    REPAIR_VERIFY_PASSES: int = 3
    #: ...from at least this many DISTINCT buses. Corroboration to appear,
    #: corroboration to disappear — see services/cloud/repair_verification.
    #: One bus reporting "clean" repeatedly may simply have a covered lens,
    #: which is a real state this system already models.
    REPAIR_VERIFY_MIN_BUSES: int = 2
    #: How close a bus must come to count as having driven past the defect.
    #: Wider than the report-link radius: this is "did a camera get a look at
    #: it", not "is this the same pothole".
    REPAIR_VERIFY_RADIUS_M: float = 40.0
    #: What one clean pass does to confidence while below threshold. Mirrors
    #: fusion's noisy-OR in the other direction: evidence of absence lowers
    #: the system's belief rather than closing the case outright.
    REPAIR_VERIFY_DECAY: float = 0.7
    #: No bus has driven this road in this long → the crew is told it is
    #: stalled rather than left watching a counter that is not moving.
    REPAIR_VERIFY_STALL_HOURS: float = 6.0
    #: How often the verifier looks at where the buses are.
    REPAIR_VERIFY_INTERVAL_S: float = 5.0

    #: How close a citizen report must be to an existing fused Event before
    #: the two are treated as the same real-world thing.
    #:
    #: 30 m is about the length of a bus. Wider and a report about one pothole
    #: attaches itself to a different pothole down the street, which is worse
    #: than not linking at all: the citizen is then told their report was
    #: fixed when the thing they photographed is still there. Narrower and
    #: ordinary phone GPS error (5–15 m in a street with buildings) stops a
    #: genuine match.
    REPORT_LINK_RADIUS_M: float = 30.0

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
