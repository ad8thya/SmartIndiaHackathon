"""Mock <-> real switch for M3's risk scorer."""

from __future__ import annotations

from functools import lru_cache

from contracts import RiskScorer

from .config import get_settings
from .impl import RealRiskScorer
from .mock import MockRiskScorer

__all__ = ["get_risk_scorer", "reset_risk_scorer"]


@lru_cache(maxsize=1)
def get_risk_scorer() -> RiskScorer:
    settings = get_settings()
    if settings.USE_REAL_RISK:
        return RealRiskScorer(settings)
    return MockRiskScorer(settings)


def reset_risk_scorer() -> None:
    get_risk_scorer.cache_clear()
