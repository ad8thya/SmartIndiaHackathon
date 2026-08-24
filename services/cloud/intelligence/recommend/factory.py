"""Mock <-> real switch for M2's recommendation engine."""

from __future__ import annotations

from functools import lru_cache

from contracts import RecommendationEngine

from .config import get_settings
from .impl import RealRecommendationEngine
from .mock import MockRecommendationEngine

__all__ = ["get_recommendation_engine", "reset_recommendation_engine"]


@lru_cache(maxsize=1)
def get_recommendation_engine() -> RecommendationEngine:
    settings = get_settings()
    if settings.USE_REAL_RECOMMEND:
        return RealRecommendationEngine(settings)
    return MockRecommendationEngine(settings)


def reset_recommendation_engine() -> None:
    get_recommendation_engine.cache_clear()
