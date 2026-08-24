"""M3 · Urban risk index.

Protocol: :class:`contracts.RiskScorer`
Entry point: :func:`get_risk_scorer`

AI intelligence layer — added alongside services/recommend in the one-time
contracts unfreeze. Extends M3's fusion work: this is the road-level
explainable score that the recommendation engine and the IntelligencePanel
both read.
"""

from __future__ import annotations

from .config import RiskSettings, get_settings
from .factory import get_risk_scorer, reset_risk_scorer
from .impl import RealRiskScorer
from .mock import MockRiskScorer

__all__ = [
    "MockRiskScorer",
    "RealRiskScorer",
    "RiskSettings",
    "get_risk_scorer",
    "get_settings",
    "reset_risk_scorer",
]
