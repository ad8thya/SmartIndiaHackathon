"""M2 what-if module tests — Protocol level."""

from __future__ import annotations

import pytest
from citydata import ROUTES, SEGMENTS
from contracts import WhatIfEngine, WhatIfRequest, WhatIfResult

from services.cloud.intelligence.whatif import MockWhatIfEngine, get_whatif_engine


@pytest.fixture
def engine() -> WhatIfEngine:
    return get_whatif_engine()


# ── Protocol conformance ────────────────────────────────────────────────────
def test_factory_satisfies_the_protocol(engine: WhatIfEngine) -> None:
    assert isinstance(engine, WhatIfEngine)


def test_default_env_gives_the_mock(engine: WhatIfEngine) -> None:
    assert isinstance(engine, MockWhatIfEngine)


def test_returns_a_row_for_every_route(engine: WhatIfEngine) -> None:
    """Unaffected routes need a row too — 'no result' reads as 'not computed'."""
    results = engine.simulate(WhatIfRequest(closed_road_ids=["SEG-27B-000"]))
    assert {r.route_id for r in results} == {route.route_id for route in ROUTES}
    assert all(isinstance(r, WhatIfResult) for r in results)


# ── arithmetic consistency ──────────────────────────────────────────────────
def test_delta_matches_the_two_times(engine: WhatIfEngine) -> None:
    for result in engine.simulate(WhatIfRequest(closed_road_ids=["SEG-51C-001"])):
        assert result.simulated_min == pytest.approx(
            result.baseline_min + result.delta_min, abs=0.05
        )


def test_closing_a_road_never_makes_a_route_faster(engine: WhatIfEngine) -> None:
    for result in engine.simulate(WhatIfRequest(closed_road_ids=[s.road_id for s in SEGMENTS[:3]])):
        assert result.delta_min >= 0.0


def test_unaffected_routes_have_zero_delta(engine: WhatIfEngine) -> None:
    results = {
        r.route_id: r for r in engine.simulate(WhatIfRequest(closed_road_ids=["SEG-27B-000"]))
    }
    assert results["27B"].delta_min > 0.0
    assert results["570"].delta_min == 0.0
    assert results["570"].recommended is True


def test_more_closures_cost_more(engine: WhatIfEngine) -> None:
    one = engine.simulate(WhatIfRequest(closed_road_ids=["SEG-27B-000"]))
    two = engine.simulate(WhatIfRequest(closed_road_ids=["SEG-27B-000", "SEG-27B-001"]))
    delta_one = next(r.delta_min for r in one if r.route_id == "27B")
    delta_two = next(r.delta_min for r in two if r.route_id == "27B")
    assert delta_two > delta_one


def test_results_are_deterministic(engine: WhatIfEngine) -> None:
    """Rehearsability: the same question must give the same answer on stage."""
    request = WhatIfRequest(closed_road_ids=["SEG-21G-002"])
    assert engine.simulate(request) == engine.simulate(request)


# ── the headline numbers the pitch quotes ───────────────────────────────────
@pytest.mark.parametrize(
    ("road_id", "route_id", "expected_delta"),
    [("SEG-27B-000", "27B", 6.0), ("SEG-51C-001", "51C", 14.0), ("SEG-570-000", "570", 3.0)],
)
def test_headline_deltas(
    engine: WhatIfEngine, road_id: str, route_id: str, expected_delta: float
) -> None:
    results = {r.route_id: r for r in engine.simulate(WhatIfRequest(closed_road_ids=[road_id]))}
    assert results[route_id].delta_min == pytest.approx(expected_delta)


def test_tolerable_closures_are_recommended(engine: WhatIfEngine) -> None:
    results = {
        r.route_id: r for r in engine.simulate(WhatIfRequest(closed_road_ids=["SEG-570-000"]))
    }
    assert results["570"].recommended is True


def test_expensive_closures_are_not_recommended(engine: WhatIfEngine) -> None:
    """Kamarajar Salai has no parallel route — closing it is a 16 minute hit."""
    results = {
        r.route_id: r for r in engine.simulate(WhatIfRequest(closed_road_ids=["SEG-21G-002"]))
    }
    assert results["21G"].delta_min > 10.0
    assert results["21G"].recommended is False


# ── map-facing extras ───────────────────────────────────────────────────────
def test_affected_routes_get_a_diversion_to_draw(engine: WhatIfEngine) -> None:
    results = {
        r.route_id: r for r in engine.simulate(WhatIfRequest(closed_road_ids=["SEG-27B-001"]))
    }
    assert len(results["27B"].diversion_polyline) > 2
    assert results["27B"].affected_passengers > 0
    assert results["570"].diversion_polyline == []


def test_request_rejects_an_empty_closure_list() -> None:
    with pytest.raises(Exception):  # noqa: B017 — pydantic ValidationError
        WhatIfRequest(closed_road_ids=[])


def test_unknown_road_id_is_survivable(engine: WhatIfEngine) -> None:
    """An operator will click something stale. It must not 500."""
    results = engine.simulate(WhatIfRequest(closed_road_ids=["SEG-DOES-NOT-EXIST"]))
    assert all(r.delta_min == 0.0 for r in results)
