"""M4 module settings. Owned by M4."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class IncidentSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    USE_REAL_INCIDENTS: bool = False

    INCIDENT_MODEL_PATH: str = "models/incidents-yolov8n.pt"
    INCIDENT_CONF_THRESHOLD: float = 0.55
    INCIDENT_DEVICE: str = "cpu"
    ANPR_LANG: str = "en"
    ANPR_MIN_CONFIDENCE: float = 0.60
    #: DPDP Act 2023 §8 — plates are salted-hashed before they touch storage.
    #: CHANGE THIS BEFORE THE DEMO. A default salt is not a salt.
    PLATE_HASH_SALT: str = "change-me-before-demo"
    #: frames buffered around a candidate incident
    INCIDENT_WINDOW_FRAMES: int = 45
    #: lateral acceleration (m/s²) that reads as rash driving
    RASH_LATERAL_ACCEL_MS2: float = 4.0
    INCIDENT_EVIDENCE_BASE_URI: str = "s3://urban-twin/evidence"


@lru_cache(maxsize=1)
def get_settings() -> IncidentSettings:
    return IncidentSettings()


def hash_plate(plate_text: str, salt: str | None = None) -> str:
    """Salted sha256 of a normalised plate.

    This is the only representation of a number plate that is allowed to be
    persisted or published on MQTT. The readable string exists solely in the
    live dossier shown to an authorised operator.
    """
    import hashlib

    salt = salt if salt is not None else get_settings().PLATE_HASH_SALT
    normalised = "".join(plate_text.split()).upper()
    return hashlib.sha256(f"{salt}:{normalised}".encode()).hexdigest()
