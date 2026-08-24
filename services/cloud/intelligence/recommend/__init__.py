"""M2 · Infrastructure recommendations.

Protocol: :class:`contracts.RecommendationEngine`
Entry point: :func:`get_recommendation_engine`

AI intelligence layer — added alongside services/cloud/intelligence/urban_risk in the one-time
contracts unfreeze. Extends M2's what-if work: this is the "what should the
city actually build here" counterpart to "what happens if we close this road".
"""

from __future__ import annotations

from .config import RecommendSettings, get_settings
from .factory import get_recommendation_engine, reset_recommendation_engine
from .impl import RealRecommendationEngine
from .mock import MockRecommendationEngine

__all__ = [
    "MockRecommendationEngine",
    "RealRecommendationEngine",
    "RecommendSettings",
    "get_recommendation_engine",
    "get_settings",
    "reset_recommendation_engine",
]
