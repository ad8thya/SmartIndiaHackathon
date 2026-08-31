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

    # ── the simulator models repair ─────────────────────────────────────────
    #: Stop emitting defect detections at places a crew has repaired.
    #:
    #: The replay is a world simulator: it decides what is physically on the
    #: road. "A crew laid tarmac, so the pothole is not there any more" is
    #: world state, and a simulator that kept generating a defect after it was
    #: fixed would be modelling a world where repairs do not work.
    #:
    #: A real fleet needs none of this — its cameras simply stop seeing the
    #: pothole. This flag exists because the mock detector reads fixed
    #: hotspots from `citydata` and has no way to learn anything happened.
    REPLAY_RESPECT_REPAIRS: bool = True
    #: The API's port. Read from the same `API_PORT` the API itself uses, so
    #: the two cannot drift — pointing the simulator at the wrong port fails
    #: silently as "no repairs are ever suppressed", which looks exactly like
    #: the feature being off.
    API_PORT: int = 8000
    #: Override the whole base URL when the API is not on localhost.
    REPLAY_API_BASE: str | None = None
    #: Real seconds between refreshes of that list. A repair is a human action
    #: on the order of minutes; polling faster only adds noise.
    REPLAY_REPAIR_POLL_SECONDS: float = 10.0
    #: How close a detection has to be to a repaired place to be suppressed.
    #: Matches REPAIR_VERIFY_RADIUS_M — the same patch of road either way.
    REPLAY_REPAIR_RADIUS_M: float = 40.0


    @property
    def api_base(self) -> str:
        """Where to ask which places have been repaired."""
        return self.REPLAY_API_BASE or f"http://localhost:{self.API_PORT}"


@lru_cache(maxsize=1)
def get_replay_settings() -> ReplaySettings:
    return ReplaySettings()
