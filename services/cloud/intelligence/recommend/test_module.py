"""M2 recommendation module tests — Protocol level."""

from __future__ import annotations

import pytest
from contracts import (
    InfrastructureRecommendation,
    RecommendationEngine,
    RecommendationType,
    RiskBand,
    RiskContext,
)

from services.cloud.intelligence.recommend import (
    MockRecommendationEngine,
    get_recommendation_engine,
)

ROAD = "SEG-27B-000"


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
def engine() -> RecommendationEngine:
    return get_recommendation_engine()


def types_of(recs: list[InfrastructureRecommendation]) -> set[RecommendationType]:
    return {rec.rec_type for rec in recs}


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_satisfies_the_protocol(engine: RecommendationEngine) -> None:
    assert isinstance(engine, RecommendationEngine)


def test_default_env_gives_the_mock(engine: RecommendationEngine) -> None:
    assert isinstance(engine, MockRecommendationEngine)


def test_an_unremarkable_road_gets_no_recommendations(engine: RecommendationEngine) -> None:
    assert engine.recommend(ROAD, ctx()) == []


def test_unknown_road_id_is_survivable(engine: RecommendationEngine) -> None:
    """An operator will click something stale. It must not 500."""
    assert engine.recommend("SEG-DOES-NOT-EXIST", ctx(defect_counts={"DAMAGED_DIVIDER": 3})) == []


# ── every recommendation carries its evidence ───────────────────────────────
def test_every_recommendation_has_rationale_and_evidence(engine: RecommendationEngine) -> None:
    recs = engine.recommend(
        ROAD,
        ctx(
            defect_counts={"ZEBRA_CROSSING": 2, "DAMAGED_DIVIDER": 1, "WATERLOGGING": 3},
            school_zone_distance_m=50.0,
            pedestrian_density=8.0,
            avg_congestion_pct=80.0,
            near_miss_count=3,
        ),
    )
    assert recs
    for rec in recs:
        assert rec.rationale
        assert rec.evidence_event_ids
        assert rec.road_id == ROAD


# ── each rule fires on its trigger and not otherwise ────────────────────────
def test_zebra_crossing_needs_all_three_conditions(engine: RecommendationEngine) -> None:
    # zebra crossing alone: no
    assert RecommendationType.ZEBRA_CROSSING not in types_of(
        engine.recommend(ROAD, ctx(defect_counts={"ZEBRA_CROSSING": 1}))
    )
    # zebra crossing + school, but low pedestrian density: no
    assert RecommendationType.ZEBRA_CROSSING not in types_of(
        engine.recommend(
            ROAD,
            ctx(defect_counts={"ZEBRA_CROSSING": 1}, school_zone_distance_m=50.0, pedestrian_density=1.0),
        )
    )
    # all three: yes, and HIGH priority
    recs = engine.recommend(
        ROAD,
        ctx(
            defect_counts={"ZEBRA_CROSSING": 1},
            school_zone_distance_m=50.0,
            pedestrian_density=8.0,
        ),
    )
    zebra = next(r for r in recs if r.rec_type is RecommendationType.ZEBRA_CROSSING)
    assert zebra.priority is RiskBand.HIGH


def test_signal_timing_needs_sustained_congestion(engine: RecommendationEngine) -> None:
    assert RecommendationType.SIGNAL_TIMING not in types_of(
        engine.recommend(ROAD, ctx(avg_congestion_pct=30.0))
    )
    recs = engine.recommend(ROAD, ctx(avg_congestion_pct=80.0))
    signal = next(r for r in recs if r.rec_type is RecommendationType.SIGNAL_TIMING)
    assert signal.priority is RiskBand.HIGH

    moderate = engine.recommend(ROAD, ctx(avg_congestion_pct=60.0))
    signal_moderate = next(r for r in moderate if r.rec_type is RecommendationType.SIGNAL_TIMING)
    assert signal_moderate.priority is RiskBand.MODERATE


def test_divider_needs_a_damaged_divider_defect(engine: RecommendationEngine) -> None:
    assert RecommendationType.DIVIDER not in types_of(engine.recommend(ROAD, ctx()))
    assert RecommendationType.DIVIDER in types_of(
        engine.recommend(ROAD, ctx(defect_counts={"DAMAGED_DIVIDER": 1}))
    )


def test_drainage_needs_repeated_waterlogging(engine: RecommendationEngine) -> None:
    assert RecommendationType.DRAINAGE not in types_of(
        engine.recommend(ROAD, ctx(defect_counts={"WATERLOGGING": 1}))
    )
    recs = engine.recommend(ROAD, ctx(defect_counts={"WATERLOGGING": 5}))
    drainage = next(r for r in recs if r.rec_type is RecommendationType.DRAINAGE)
    assert drainage.priority is RiskBand.HIGH


def test_speed_calming_needs_a_near_miss_cluster(engine: RecommendationEngine) -> None:
    assert RecommendationType.SPEED_CALMING not in types_of(
        engine.recommend(ROAD, ctx(near_miss_count=1))
    )
    recs = engine.recommend(ROAD, ctx(near_miss_count=2))
    calming = next(r for r in recs if r.rec_type is RecommendationType.SPEED_CALMING)
    assert calming.priority is RiskBand.HIGH

    critical = engine.recommend(ROAD, ctx(near_miss_count=3))
    calming_critical = next(r for r in critical if r.rec_type is RecommendationType.SPEED_CALMING)
    assert calming_critical.priority is RiskBand.CRITICAL


def test_recommendations_are_deterministic(engine: RecommendationEngine) -> None:
    """Rehearsability: the same road+context must give the same recommendation
    ids on stage, not a fresh uuid4 every request."""
    one_ctx = ctx(defect_counts={"DAMAGED_DIVIDER": 2})
    first = engine.recommend(ROAD, one_ctx)
    second = engine.recommend(ROAD, one_ctx)
    assert [r.evidence_event_ids for r in first] == [r.evidence_event_ids for r in second]


def test_recommendation_sits_at_the_road_segment(engine: RecommendationEngine) -> None:
    recs = engine.recommend(ROAD, ctx(defect_counts={"DAMAGED_DIVIDER": 1}))
    assert recs
    assert -90.0 <= recs[0].lat <= 90.0
    assert -180.0 <= recs[0].lon <= 180.0
