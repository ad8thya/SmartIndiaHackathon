"""M3 module settings (urban risk index). Owned by M3.

The six weights below sum to 100 — that identity is asserted in
test_module.py. Change one, change another to compensate.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class RiskSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    USE_REAL_RISK: bool = False

    # ── component weights (must sum to 100) ─────────────────────────────────
    RISK_WEIGHT_DAMAGE: float = 30.0
    RISK_WEIGHT_CONGESTION: float = 20.0
    RISK_WEIGHT_PEDESTRIAN: float = 15.0
    RISK_WEIGHT_SCHOOL: float = 15.0
    RISK_WEIGHT_NEAR_MISS: float = 12.0
    RISK_WEIGHT_INCIDENTS: float = 8.0

    # ── normalisation: the input value at which a component saturates ───────
    #: pedestrian sightings nearby at which the pedestrian-density component
    #: reaches its full weight
    RISK_PEDESTRIAN_SATURATION: float = 20.0
    #: beyond this distance a school contributes nothing to the score
    RISK_SCHOOL_RADIUS_M: float = 500.0
    #: near-misses in 7d at which the near-miss component reaches full weight
    RISK_NEAR_MISS_SATURATION: float = 3.0
    #: recent incidents at which the incidents component reaches full weight
    RISK_INCIDENT_SATURATION: float = 5.0

    # ── band thresholds (spec: <25 LOW, <50 MODERATE, <75 HIGH, else CRITICAL)
    RISK_BAND_LOW_MAX: float = 25.0
    RISK_BAND_MODERATE_MAX: float = 50.0
    RISK_BAND_HIGH_MAX: float = 75.0


@lru_cache(maxsize=1)
def get_settings() -> RiskSettings:
    return RiskSettings()
