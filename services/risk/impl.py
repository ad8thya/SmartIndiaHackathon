"""M3 REAL implementation — the LEARNED upgrade path.

TODO (M3), once repair-outcome data exists (i.e. enough Events have reached
RESOLVED/VERIFIED with a real before/after to check against):
  1. Frame this as supervised regression: features are the same six inputs in
     RiskContext (plus whatever else the DB accumulates — repair history, time
     since last resurfacing), label is a real outcome signal (did this road
     generate another Event within N months of being "fixed"? an incident?).
  2. Gradient boosting (LightGBM/XGBoost) over hand-crafted features beats a
     neural net here — the dataset will be small (one city, one demo season)
     and boosting handles that far better, and it keeps a feature-importance
     story that maps back onto components.
  3. THE EXPLAINABILITY REQUIREMENT DOES NOT GO AWAY. `components` must still
     sum to `score` and `explanation` must still be non-empty — use SHAP values
     (or the model's own feature importances, scaled to sum to the prediction)
     as the components, not a black-box scalar with no attribution. A risk
     score a municipal engineer cannot audit is not shippable, however
     accurate it is.
  4. Retrain offline, ship a pickled model + a fixed feature order. Never train
     at request time.
  5. Validate against the mock's weighted index before cutting over: on the
     seeded data, the learned model's ranking of roads by risk should broadly
     agree with the mock's. If it does not, that is a modelling bug, not
     evidence the mock was wrong — the mock's weights encode real domain
     knowledge (PCI and pedestrian exposure genuinely matter more than one
     recent incident count).
"""

from __future__ import annotations

from typing import Any

from contracts import RiskContext, UrbanRiskScore

from .config import RiskSettings, get_settings


class RealRiskScorer:
    """Satisfies :class:`contracts.RiskScorer`. NOT IMPLEMENTED YET."""

    def __init__(self, settings: RiskSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._model: Any = None

    def _ensure_model(self) -> Any:
        if self._model is None:
            import pickle
            from pathlib import Path

            cache = Path("data/urban_risk_model.pkl")
            if not cache.exists():
                raise FileNotFoundError(
                    f"{cache} missing — train the gradient-boosted model offline first. "
                    "Do not train at request time."
                )
            self._model = pickle.loads(cache.read_bytes())
        return self._model

    def score(self, road_id: str, ctx: RiskContext) -> UrbanRiskScore:
        raise NotImplementedError(
            "M3: the learned risk model is not wired up yet. "
            "Keep USE_REAL_RISK=false until this returns UrbanRiskScores."
        )

    def _feature_importances(self, ctx: RiskContext) -> dict[str, float]:
        """TODO: SHAP values (or scaled feature importances) per input,
        summing to the predicted score — see class docstring point 3."""
        raise NotImplementedError
