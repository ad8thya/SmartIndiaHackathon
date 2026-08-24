"""M5 API tests.

These run WITHOUT postgres, redis or mosquitto. That is deliberate: the API is
required to degrade rather than fail when infrastructure is starting up, and
these tests are what keeps that true.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from citydata import ROUTES, SEGMENTS
from contracts import (
    DetectionClass,
    Event,
    Observation,
    Severity,
    WorkflowStatus,
    WSMessageType,
)
from fastapi.testclient import TestClient

from services.api.hub import state

NOW = datetime.now(tz=UTC)


@pytest.fixture(scope="module")
def client() -> TestClient:
    from services.api.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def seeded_state() -> None:
    """Put a little live data in the hub so the endpoints have something to say."""
    state.buses.clear()
    state.events.clear()
    state.observations.clear()
    state.incidents.clear()

    from contracts import BusPosition

    for index, route in enumerate(ROUTES[:3]):
        state.upsert_bus(
            BusPosition(
                bus_id=f"MTC-TEST-{1000 + index:04d}",
                route_id=route.route_id,
                ts=NOW,
                lat=route.polyline[0][1],
                lon=route.polyline[0][0],
                heading_deg=90.0,
                speed_kmph=24.0,
            )
        )

    segment = SEGMENTS[0]
    for index in range(20):
        state.add_observation(
            Observation(
                obs_id=uuid4(),
                bus_id="MTC-TEST-1000",
                route_id=segment.route_id,
                ts=NOW,
                lat=segment.center[1],
                lon=segment.center[0],
                gps_accuracy_m=4.0,
                heading_deg=90.0,
                speed_kmph=20.0,
                detection_class=(DetectionClass.VEHICLE if index % 2 else DetectionClass.POTHOLE),
                raw_confidence=0.8,
                severity=None if index % 2 else Severity.MEDIUM,
            )
        )


def make_event(status: WorkflowStatus = WorkflowStatus.DETECTED) -> Event:
    event = Event(
        event_id=uuid4(),
        lat=13.0067,
        lon=80.2570,
        road_segment_id=SEGMENTS[0].road_id,
        detection_class=DetectionClass.POTHOLE,
        severity=Severity.LARGE,
        fused_confidence=0.91,
        observation_count=4,
        distinct_bus_count=3,
        first_seen=NOW,
        last_seen=NOW,
        status=status,
    )
    state.replace_event(event)
    return event


# ── ops ─────────────────────────────────────────────────────────────────────
def test_health_answers_even_with_no_infrastructure(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"ok", "database", "postgis", "redis", "mqtt", "detail"}


def test_root_advertises_the_entry_points(client: TestClient) -> None:
    body = client.get("/").json()
    assert body["websocket"] == "/ws/live"


# ── fleet ───────────────────────────────────────────────────────────────────
def test_fleet_lists_live_buses(client: TestClient) -> None:
    body = client.get("/api/fleet").json()
    assert len(body) == 3
    assert all("bus_id" in item and "lat" in item for item in body)


def test_fleet_filters_by_route(client: TestClient) -> None:
    route_id = ROUTES[0].route_id
    body = client.get("/api/fleet", params={"route_id": route_id}).json()
    assert {item["route_id"] for item in body} == {route_id}


def test_unknown_bus_is_404(client: TestClient) -> None:
    assert client.get("/api/fleet/MTC-NOPE-0000").status_code == 404


# ── routes ──────────────────────────────────────────────────────────────────
def test_routes_are_valid_geojson(client: TestClient) -> None:
    body = client.get("/api/routes").json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == len(ROUTES)
    geometry = body["features"][0]["geometry"]
    assert geometry["type"] == "LineString"
    assert len(geometry["coordinates"]) > 2
    lon, lat = geometry["coordinates"][0]
    assert 79 < lon < 81 and 12 < lat < 14, "coordinates must be GeoJSON order (lon, lat)"


def test_route_models_endpoint(client: TestClient) -> None:
    body = client.get("/api/routes/list").json()
    assert {item["route_id"] for item in body} == {route.route_id for route in ROUTES}


def test_unknown_route_is_404(client: TestClient) -> None:
    assert client.get("/api/routes/999X").status_code == 404


# ── roads → M2's factory ────────────────────────────────────────────────────
def test_road_condition_is_populated(client: TestClient) -> None:
    road_id = SEGMENTS[0].road_id
    body = client.get(f"/api/roads/{road_id}/condition").json()
    assert body["road_id"] == road_id
    assert 0 <= body["congestion_pct"] <= 100
    assert 0 <= body["pci_score"] <= 100
    assert body["risk_level"] in {"LOW", "MODERATE", "HIGH", "SEVERE"}


def test_all_roads_returns_the_whole_network(client: TestClient) -> None:
    assert len(client.get("/api/roads").json()) == len(SEGMENTS)


def test_unknown_road_is_404_with_a_hint(client: TestClient) -> None:
    response = client.get("/api/roads/SEG-NOPE-000/condition")
    assert response.status_code == 404
    assert "SEG-" in response.json()["detail"]


# ── what-if → M2's factory ──────────────────────────────────────────────────
def test_whatif_returns_deltas(client: TestClient) -> None:
    response = client.post(
        "/api/whatif/simulate", json={"closed_road_ids": ["SEG-27B-000"], "horizon_minutes": 60}
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == len(ROUTES)
    affected = next(item for item in body if item["route_id"] == "27B")
    assert affected["delta_min"] > 0


def test_whatif_rejects_an_empty_closure_list(client: TestClient) -> None:
    assert client.post("/api/whatif/simulate", json={"closed_road_ids": []}).status_code == 422


# ── incidents → M4's factory ────────────────────────────────────────────────
def test_incidents_bootstrap_from_the_detector(client: TestClient) -> None:
    """With nothing on MQTT yet, the panel must still have a dossier to open."""
    body = client.get("/api/incidents").json()
    assert body
    assert {"incident_class", "narrative", "confidence"} <= set(body[0])


def test_incident_filter_by_class(client: TestClient) -> None:
    body = client.get("/api/incidents", params={"class": "COLLISION"}).json()
    assert all(item["incident_class"] == "COLLISION" for item in body)


# ── events ──────────────────────────────────────────────────────────────────
def test_events_list_and_filter(client: TestClient) -> None:
    make_event()
    make_event(WorkflowStatus.AUTHORITY_NOTIFIED)

    everything = client.get("/api/events").json()
    assert len(everything) >= 2

    filtered = client.get("/api/events", params={"status": "AUTHORITY_NOTIFIED"}).json()
    assert all(item["status"] == "AUTHORITY_NOTIFIED" for item in filtered)

    by_class = client.get("/api/events", params={"class": "POTHOLE"}).json()
    assert all(item["detection_class"] == "POTHOLE" for item in by_class)


def test_events_bbox_filter(client: TestClient) -> None:
    make_event()
    inside = client.get("/api/events", params={"bbox": "80.0,12.9,80.5,13.3"}).json()
    outside = client.get("/api/events", params={"bbox": "70.0,20.0,71.0,21.0"}).json()
    assert inside and not outside


def test_events_malformed_bbox_is_422(client: TestClient) -> None:
    assert client.get("/api/events", params={"bbox": "nonsense"}).status_code == 422


def test_get_one_event(client: TestClient) -> None:
    event = make_event()
    body = client.get(f"/api/events/{event.event_id}").json()
    assert body["event_id"] == str(event.event_id)


def test_unknown_event_is_404(client: TestClient) -> None:
    assert client.get(f"/api/events/{uuid4()}").status_code == 404


def test_patch_status_advances_the_workflow(client: TestClient) -> None:
    event = make_event()
    response = client.patch(
        f"/api/events/{event.event_id}/status",
        json={
            "status": "MAINTENANCE_ASSIGNED",
            "assigned_team": "GCC-Zone-13-Adyar",
            "notes": "Cold-mix patch, crew of 3.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "MAINTENANCE_ASSIGNED"
    assert body["assigned_team"] == "GCC-Zone-13-Adyar"
    assert state.events[event.event_id].status is WorkflowStatus.MAINTENANCE_ASSIGNED


def test_patch_does_not_touch_last_seen(client: TestClient) -> None:
    """last_seen is sensor data, not workflow data.

    Regression: it used to be stamped with wall-clock time on every status
    change. Under the replay clock, events carry *simulated* timestamps that run
    ahead of wall time, so the new last_seen landed before first_seen and the
    Event validator rejected the response with a 500.
    """
    future = NOW + timedelta(hours=6)  # as if produced by a 60x replay clock
    event = make_event().model_copy(update={"first_seen": future, "last_seen": future})
    state.replace_event(event)

    response = client.patch(f"/api/events/{event.event_id}/status", json={"status": "INSPECTION"})
    assert response.status_code == 200
    assert response.json()["last_seen"] == future.isoformat().replace("+00:00", "Z")


def test_patch_rejects_a_status_outside_the_enum(client: TestClient) -> None:
    event = make_event()
    response = client.patch(
        f"/api/events/{event.event_id}/status", json={"status": "PROBABLY_FINE"}
    )
    assert response.status_code == 422


# ── AI intelligence layer ────────────────────────────────────────────────────
def test_road_condition_carries_the_risk_fields(client: TestClient) -> None:
    road_id = SEGMENTS[0].road_id
    body = client.get(f"/api/roads/{road_id}/condition").json()
    assert 0 <= body["urban_risk_score"] <= 100
    assert body["risk_band"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
    assert body["near_miss_count_7d"] >= 0


def test_road_risk_is_populated_and_explained(client: TestClient) -> None:
    road_id = SEGMENTS[0].road_id
    body = client.get(f"/api/roads/{road_id}/risk").json()
    assert body["road_id"] == road_id
    assert 0 <= body["score"] <= 100
    assert body["band"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
    assert body["explanation"], "an unexplained risk score is worthless"
    assert sum(body["components"].values()) == pytest.approx(body["score"], abs=0.05)


def test_unknown_road_risk_is_404(client: TestClient) -> None:
    assert client.get("/api/roads/SEG-NOPE-000/risk").status_code == 404


def test_recommendations_list_and_filter(client: TestClient) -> None:
    everything = client.get("/api/recommendations").json()
    assert isinstance(everything, list)
    for rec in everything:
        assert rec["rationale"]
        assert rec["evidence_event_ids"]

    by_type = client.get("/api/recommendations", params={"type": "DIVIDER"}).json()
    assert all(rec["rec_type"] == "DIVIDER" for rec in by_type)

    by_priority = client.get("/api/recommendations", params={"priority": "HIGH"}).json()
    assert all(rec["priority"] == "HIGH" for rec in by_priority)


def test_near_misses_returns_the_scripted_events(client: TestClient) -> None:
    body = client.get("/api/near-misses").json()
    assert body
    for event in body:
        assert event["min_ttc_seconds"] >= 0.0
        assert event["severity"] in {"SMALL", "MEDIUM", "LARGE"}


def test_near_misses_bbox_filter(client: TestClient) -> None:
    inside = client.get("/api/near-misses", params={"bbox": "79.9,12.7,80.5,13.4"}).json()
    outside = client.get("/api/near-misses", params={"bbox": "70.0,20.0,71.0,21.0"}).json()
    assert inside and not outside


def test_near_misses_malformed_bbox_is_422(client: TestClient) -> None:
    assert client.get("/api/near-misses", params={"bbox": "nonsense"}).status_code == 422


def test_near_misses_since_filter(client: TestClient) -> None:
    from datetime import UTC, datetime

    future = datetime.now(tz=UTC) + timedelta(days=1)
    assert client.get("/api/near-misses", params={"since": future.isoformat()}).json() == []


def test_dangerous_junctions_are_ranked_worst_first(client: TestClient) -> None:
    body = client.get("/api/junctions/dangerous", params={"limit": 10}).json()
    assert 0 < len(body) <= 10
    scores = [row["risk_score"] for row in body]
    assert scores == sorted(scores, reverse=True)
    for row in body:
        assert row["risk_band"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}


# ── analytics ───────────────────────────────────────────────────────────────
def test_analytics_summary_shape(client: TestClient) -> None:
    make_event()
    body = client.get("/api/analytics/summary").json()
    assert body["buses_online"] == 3
    assert body["open_events"] >= 1
    assert body["avg_network_speed_kmph"] > 0
    assert isinstance(body["events_by_status"], dict)


def test_summary_open_events_matches_the_event_list(client: TestClient) -> None:
    """The KPI strip and the panel underneath it must never disagree.

    Regression: `summary` counted only in-memory events while `/api/events`
    merged postgres + memory, so the top bar undercounted the list below it by
    everything written before the current API process started.
    """
    for status in ("DETECTED", "AI_VERIFIED", "RESOLVED", "REJECTED", "INSPECTION"):
        make_event(WorkflowStatus(status))

    summary = client.get("/api/analytics/summary").json()
    events = client.get("/api/events", params={"limit": 5000}).json()

    open_from_list = sum(1 for event in events if event["status"] not in {"RESOLVED", "REJECTED"})
    assert summary["open_events"] == open_from_list

    # and the breakdowns are drawn from the same population
    assert sum(summary["events_by_status"].values()) == len(events)
    assert sum(summary["events_by_class"].values()) == len(events)


def test_summary_includes_intelligence_layer_fields(client: TestClient) -> None:
    body = client.get("/api/analytics/summary").json()
    assert set(body) >= {"critical_risk_roads", "open_recommendations", "near_misses_7d"}
    assert body["near_misses_7d"] >= 0


def test_summary_counts_terminal_statuses_as_closed(client: TestClient) -> None:
    """Asserted as a delta, because this suite runs both with and without a
    populated postgres — an absolute count would only pass on an empty DB."""
    before = client.get("/api/analytics/summary").json()

    make_event(WorkflowStatus.DETECTED)
    make_event(WorkflowStatus.RESOLVED)
    make_event(WorkflowStatus.REJECTED)

    after = client.get("/api/analytics/summary").json()
    assert after["open_events"] - before["open_events"] == 1
    assert sum(after["events_by_status"].values()) - sum(before["events_by_status"].values()) == 3


# ── websocket ───────────────────────────────────────────────────────────────
def test_websocket_opens_with_a_full_picture(client: TestClient) -> None:
    make_event()
    with client.websocket_connect("/ws/live") as socket:
        hello = socket.receive_json()
        assert hello["type"] == WSMessageType.HELLO
        assert len(hello["payload"]["buses"]) == 3
        assert hello["payload"]["events"]


def test_websocket_receives_broadcasts(client: TestClient) -> None:
    from services.api.hub import broadcaster

    with client.websocket_connect("/ws/live") as socket:
        socket.receive_json()  # HELLO
        broadcaster.publish(WSMessageType.EVENT_NEW, {"event_id": "test"})
        frame = socket.receive_json()
        assert frame["type"] == WSMessageType.EVENT_NEW
        assert frame["payload"]["event_id"] == "test"
