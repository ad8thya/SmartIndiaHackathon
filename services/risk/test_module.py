"""M3 risk module tests — Protocol level."""

from __future__ import annotations

import pytest
from contracts import RiskBand, RiskContext, RiskScorer, UrbanRiskScore

from services.risk import MockRiskScorer, get_risk_scorer, get_settings


def ctx(**overrides: object) -> RiskContext:
    base: dict[str, object] = {
        "defect_counts": {},
        "avg_congestion_pct": 0.0,
        "pedestrian_density": 0.0,
        "near_miss_count": 0,
        "school_zone_distance_m": None,
        "pci_score": 100.0,
        "recent_incident_count": 0,
    }
    base.update(overrides)
    return RiskContext(**base)  # type: ignore[arg-type]


@pytest.fixture
def scorer() -> RiskScorer:
    return get_risk_scorer()


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_satisfies_the_protocol(scorer: RiskScorer) -> None:
    assert isinstance(scorer, RiskScorer)


def test_default_env_gives_the_mock(scorer: RiskScorer) -> None:
    assert isinstance(scorer, MockRiskScorer)


def test_weights_sum_to_100() -> None:
    s = get_settings()
    total = (
        s.RISK_WEIGHT_DAMAGE
        + s.RISK_WEIGHT_CONGESTION
        + s.RISK_WEIGHT_PEDESTRIAN
        + s.RISK_WEIGHT_SCHOOL
        + s.RISK_WEIGHT_NEAR_MISS
        + s.RISK_WEIGHT_INCIDENTS
    )
    assert total == pytest.approx(100.0)


# ── the explainability contract ─────────────────────────────────────────────
def test_a_clean_road_scores_at_the_floor(scorer: RiskScorer) -> None:
    result = scorer.score("SEG-27B-000", ctx())
    assert isinstance(result, UrbanRiskScore)
    assert result.score == pytest.approx(0.0, abs=0.01)
    assert result.band is RiskBand.LOW


def test_a_maxed_out_road_scores_at_the_ceiling(scorer: RiskScorer) -> None:
    result = scorer.score(
        "SEG-27B-000",
        ctx(
            pci_score=0.0,
            avg_congestion_pct=100.0,
            pedestrian_density=999.0,
            school_zone_distance_m=0.0,
            near_miss_count=999,
            recent_incident_count=999,
        ),
    )
    assert result.score == pytest.approx(100.0, abs=0.01)
    assert result.band is RiskBand.CRITICAL


def test_components_always_sum_to_the_score(scorer: RiskScorer) -> None:
    """The model itself enforces this, but prove the mock actually produces
    matching numbers rather than relying on the validator to catch a bug."""
    for pci, congestion, peds, dist, nm, inc in [
        (100.0, 0.0, 0.0, None, 0, 0),
        (55.0, 42.0, 6.0, 80.0, 1, 0),
        (10.0, 90.0, 25.0, 500.0, 5, 10),
    ]:
        result = scorer.score(
            "SEG-27B-000",
            ctx(
                pci_score=pci,
                avg_congestion_pct=congestion,
                pedestrian_density=peds,
                school_zone_distance_m=dist,
                near_miss_count=nm,
                recent_incident_count=inc,
            ),
        )
        assert sum(result.components.values()) == pytest.approx(result.score, abs=0.01)


def test_explanation_is_never_empty(scorer: RiskScorer) -> None:
    for c in (ctx(), ctx(pci_score=0.0, near_miss_count=5)):
        assert len(scorer.score("SEG-27B-000", c).explanation) > 0


def test_worse_pavement_condition_never_lowers_the_score(scorer: RiskScorer) -> None:
    good = scorer.score("SEG-27B-000", ctx(pci_score=90.0))
    bad = scorer.score("SEG-27B-000", ctx(pci_score=20.0))
    assert bad.score > good.score


def test_school_proximity_only_bites_within_range(scorer: RiskScorer) -> None:
    far = scorer.score("SEG-27B-000", ctx(school_zone_distance_m=10_000.0))
    near = scorer.score("SEG-27B-000", ctx(school_zone_distance_m=20.0))
    assert far.components["school_proximity"] == pytest.approx(0.0, abs=0.01)
    assert near.components["school_proximity"] > 0.0


def test_no_school_zone_contributes_nothing() -> None:
    scorer = MockRiskScorer()
    result = scorer.score("SEG-27B-000", ctx(school_zone_distance_m=None))
    assert result.components["school_proximity"] == 0.0


# ── band boundaries at exactly 25/50/75 ─────────────────────────────────────
@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0.0, RiskBand.LOW),
        (24.999, RiskBand.LOW),
        (25.0, RiskBand.MODERATE),
        (49.999, RiskBand.MODERATE),
        (50.0, RiskBand.HIGH),
        (74.999, RiskBand.HIGH),
        (75.0, RiskBand.CRITICAL),
        (100.0, RiskBand.CRITICAL),
    ],
)
def test_band_boundaries(score: float, expected: RiskBand) -> None:
    scorer = MockRiskScorer()
    assert scorer._band(score) is expected


def test_road_id_is_echoed_back(scorer: RiskScorer) -> None:
    assert scorer.score("SEG-42A-002", ctx()).road_id == "SEG-42A-002"


def test_scoring_is_deterministic(scorer: RiskScorer) -> None:
    """Rehearsability: the same inputs must give the same score on stage."""
    one_ctx = ctx(pci_score=55.0, avg_congestion_pct=42.0, near_miss_count=1)
    first = scorer.score("SEG-27B-000", one_ctx)
    second = scorer.score("SEG-27B-000", one_ctx)
    assert first.score == second.score
    assert first.components == second.components
