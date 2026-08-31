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

from services.cloud.api.hub import state

NOW = datetime.now(tz=UTC)


@pytest.fixture(scope="module")
def client() -> TestClient:
    from services.cloud.api.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def seeded_state() -> None:
    """Put a little live data in the hub so the endpoints have something to say."""
    state.buses.clear()
    state.events.clear()
    state.observations.clear()
    state.incidents.clear()
    state.reports.clear()

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
    from services.cloud.api.hub import broadcaster

    with client.websocket_connect("/ws/live") as socket:
        socket.receive_json()  # HELLO
        broadcaster.publish(WSMessageType.EVENT_NEW, {"event_id": "test"})
        frame = socket.receive_json()
        assert frame["type"] == WSMessageType.EVENT_NEW
        assert frame["payload"]["event_id"] == "test"


# ── citizen reports ─────────────────────────────────────────────────────────
# These are the reason T5 exists: the mobile app used to write a citizen report
# to localStorage and nowhere else, so it never reached a person and vanished
# on a cache clear. Like every other test here they run with no postgres, which
# is also the interesting path — a report the database never received must
# still come back with an id and still reach the console over the WebSocket.

#: 1x1 transparent PNG. Small enough to inline, real enough to decode.
TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.fixture
def media_dir(tmp_path: object) -> object:
    """Point photo storage at a temp dir so tests never write into data/."""
    from services.cloud.api.config import get_api_settings

    settings = get_api_settings()
    previous = settings.MEDIA_DIR
    settings.MEDIA_DIR = str(tmp_path)
    yield tmp_path
    settings.MEDIA_DIR = previous


def _report_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "category": "POTHOLE",
        "description": "Deep hole in the left lane, cars swerving into the bus lane.",
        "lat": 13.0067,
        "lon": 80.2570,
        "address": "Sardar Patel Rd, near Adyar depot",
        "reporter_name": "9840 012345",
        "ward": "Ward 173",
    }
    body.update(overrides)
    return body


def test_report_is_accepted_and_readable_back(client: TestClient, media_dir: object) -> None:
    created = client.post("/api/reports", json=_report_body())
    assert created.status_code == 201, created.text
    report = created.json()

    assert report["status"] == "SUBMITTED"
    assert report["linked_event_id"] is None
    assert report["report_id"]

    # The thing localStorage could never do: someone else can read it.
    fetched = client.get(f"/api/reports/{report['report_id']}")
    assert fetched.status_code == 200
    assert fetched.json()["description"] == report["description"]

    assert report["report_id"] in [r["report_id"] for r in client.get("/api/reports").json()]


def test_a_report_never_arrives_already_acknowledged(client: TestClient, media_dir: object) -> None:
    """The client does not get to choose its own status, id or timestamps.

    A phone that could set `status` could mark its own report resolved, and one
    that could set `linked_event_id` could attach itself to any event in the
    system. `extra="forbid"` on the request model is what stops both.
    """
    rejected = client.post(
        "/api/reports",
        json=_report_body(status="RESOLVED", report_id=str(uuid4())),
    )
    assert rejected.status_code == 422


def test_photo_is_stored_as_a_file_and_served_back(client: TestClient, media_dir: object) -> None:
    report = client.post("/api/reports", json=_report_body(photo=TINY_PNG)).json()

    # A path, never the base64 back — a data URI in the row would ride along in
    # every list response and in the WebSocket frame.
    assert report["photo_uri"].startswith("/api/reports/photos/")
    assert "base64" not in report["photo_uri"]

    stored = media_dir / "reports"  # type: ignore[operator]
    assert len(list(stored.iterdir())) == 1

    served = client.get(report["photo_uri"])
    assert served.status_code == 200
    assert served.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_photo_that_is_not_an_image_is_refused_loudly(client: TestClient, media_dir: object) -> None:
    """422, not a silently dropped photo.

    A citizen who took a picture and got back a report with no image would have
    no way to know the one piece of evidence they gathered was discarded.
    """
    refused = client.post(
        "/api/reports",
        json=_report_body(photo="data:application/x-sh;base64,ZWNobyBoaQ=="),
    )
    assert refused.status_code == 422
    assert "unsupported photo type" in refused.text

    assert client.post("/api/reports", json=_report_body(photo="not a data uri")).status_code == 422


def test_oversized_photo_is_refused_before_it_is_decoded(
    client: TestClient, media_dir: object
) -> None:
    from services.cloud.api.media import MAX_PHOTO_BYTES

    huge = "data:image/jpeg;base64," + "A" * (MAX_PHOTO_BYTES * 4 // 3 + 64)
    assert client.post("/api/reports", json=_report_body(photo=huge)).status_code == 413


def test_reports_filter_the_way_the_phone_asks(client: TestClient, media_dir: object) -> None:
    # Unique names per run. Unlike the rest of this file these reports may
    # actually reach postgres when a developer has the stack up, and rows
    # written by an earlier run are still there — so every assertion below
    # scopes itself to its own data rather than assuming an empty table.
    me = f"tester-{uuid4()}"
    someone_else = f"tester-{uuid4()}"

    client.post("/api/reports", json=_report_body(category="POTHOLE", reporter_name=someone_else))
    client.post("/api/reports", json=_report_body(category="GARBAGE", reporter_name=me))

    potholes = client.get("/api/reports", params={"category": "POTHOLE"}).json()
    assert potholes and all(r["category"] == "POTHOLE" for r in potholes)

    # "My reports" on the phone is this query and nothing cleverer.
    mine = client.get("/api/reports", params={"reporter_name": me}).json()
    assert [r["category"] for r in mine] == ["GARBAGE"]

    # Nothing arrives resolved, so this filter must not match what we just sent.
    resolved = client.get("/api/reports", params={"status": "RESOLVED"}).json()
    assert me not in [r["reporter_name"] for r in resolved]


def test_newest_report_is_first(client: TestClient, media_dir: object) -> None:
    first = client.post("/api/reports", json=_report_body(description="older")).json()
    second = client.post("/api/reports", json=_report_body(description="newer")).json()
    listed = [r["report_id"] for r in client.get("/api/reports").json()]
    # Relative order, so rows left over from a previous run cannot affect it.
    assert listed.index(second["report_id"]) < listed.index(first["report_id"])


def test_unknown_report_is_404(client: TestClient) -> None:
    assert client.get(f"/api/reports/{uuid4()}").status_code == 404


def test_photo_path_cannot_escape_the_photo_directory(
    client: TestClient, media_dir: object
) -> None:
    assert client.get("/api/reports/photos/..%2F..%2Fetc%2Fpasswd").status_code == 404


def test_submitting_a_report_broadcasts_report_new(client: TestClient, media_dir: object) -> None:
    """The half of T6 that makes a report appear on the console without a refresh."""
    import json

    from services.cloud.api.hub import broadcaster

    queue = broadcaster.subscribe()
    try:
        report = client.post("/api/reports", json=_report_body()).json()
        frames = []
        while not queue.empty():
            frames.append(json.loads(queue.get_nowait()))
    finally:
        broadcaster.unsubscribe(queue)

    new = [f for f in frames if f["type"] == WSMessageType.REPORT_NEW]
    assert len(new) == 1
    assert new[0]["payload"]["report_id"] == report["report_id"]
    # The frame carries the path, not the image — see the note on photo_uri.
    assert "base64" not in json.dumps(new[0])


# ── crew evidence, incident response, camera health ─────────────────────────
# The three endpoints that closed the phone app's "no backend yet" gaps. Each
# one used to be a button whose effect never left the device.


def test_crew_can_attach_a_photo_to_a_work_order(client: TestClient, media_dir: object) -> None:
    # Its own event, so the test does not depend on what happens to be seeded.
    event = make_event(WorkflowStatus.INSPECTION)
    before = len(event.evidence_uris)

    posted = client.post(
        f"/api/events/{event.event_id}/evidence",
        json={"photo": TINY_PNG, "note": "Patched and compacted.", "team": "GCC-Zone-13-Adyar"},
    )
    assert posted.status_code == 200, posted.text

    uris = posted.json()["evidence_uris"]
    assert len(uris) == before + 1
    # A path, never the base64 — the same rule citizen photos follow, and for
    # the same reason: this list rides along in every EVENT_UPDATED frame.
    assert uris[-1].startswith("/api/events/photos/")
    assert "base64" not in uris[-1]

    served = client.get(uris[-1])
    assert served.status_code == 200
    assert served.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_two_crew_photos_do_not_overwrite_each_other(
    client: TestClient, media_dir: object
) -> None:
    """The event id alone is not unique per upload — the suffix is what saves
    the first photo when a second arrives."""
    event = make_event(WorkflowStatus.INSPECTION)
    first = client.post(f"/api/events/{event.event_id}/evidence", json={"photo": TINY_PNG})
    second = client.post(f"/api/events/{event.event_id}/evidence", json={"photo": TINY_PNG})

    uris = second.json()["evidence_uris"]
    assert first.json()["evidence_uris"][-1] != uris[-1]
    assert client.get(uris[-2]).status_code == 200
    assert client.get(uris[-1]).status_code == 200


def test_empty_evidence_is_refused_rather_than_a_silent_no_op(
    client: TestClient, media_dir: object
) -> None:
    event = make_event()
    refused = client.post(f"/api/events/{event.event_id}/evidence", json={"note": "   "})
    assert refused.status_code == 422


def test_evidence_broadcasts_so_the_console_sees_the_photo(
    client: TestClient, media_dir: object
) -> None:
    import json

    from services.cloud.api.hub import broadcaster

    event = make_event()
    queue = broadcaster.subscribe()
    try:
        client.post(f"/api/events/{event.event_id}/evidence", json={"photo": TINY_PNG})
        frames = []
        while not queue.empty():
            frames.append(json.loads(queue.get_nowait()))
    finally:
        broadcaster.unsubscribe(queue)

    updated = [f for f in frames if f["type"] == WSMessageType.EVENT_UPDATED]
    assert len(updated) == 1
    assert "base64" not in json.dumps(updated[0])


def test_incident_response_advances_and_broadcasts(client: TestClient) -> None:
    import json

    from services.cloud.api.hub import broadcaster

    incident_id = str(uuid4())
    queue = broadcaster.subscribe()
    try:
        accepted = client.patch(
            f"/api/incidents/{incident_id}/response",
            json={"state": "ACCEPTED", "team": "GCC-Emergency-Adyar"},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["state"] == "ACCEPTED"

        dispatched = client.patch(
            f"/api/incidents/{incident_id}/response", json={"state": "DISPATCHED"}
        )
        assert dispatched.status_code == 200

        frames = []
        while not queue.empty():
            frames.append(json.loads(queue.get_nowait()))
    finally:
        broadcaster.unsubscribe(queue)

    responses = [f for f in frames if f["type"] == WSMessageType.INCIDENT_RESPONSE]
    assert [f["payload"]["state"] for f in responses] == ["ACCEPTED", "DISPATCHED"]


def test_response_cannot_go_backwards(client: TestClient) -> None:
    """A second phone tapping Accept on an incident already dispatched has
    stale state, and 409 is how it finds out."""
    incident_id = str(uuid4())
    client.patch(f"/api/incidents/{incident_id}/response", json={"state": "DISPATCHED"})

    backwards = client.patch(
        f"/api/incidents/{incident_id}/response", json={"state": "ACCEPTED"}
    )
    assert backwards.status_code == 409
    assert "already" in backwards.text

    # CLOSED is reachable from anywhere — a crew can stand down from an
    # incident they never reached.
    assert (
        client.patch(f"/api/incidents/{incident_id}/response", json={"state": "CLOSED"}).status_code
        == 200
    )


def test_response_history_keeps_every_state_change(client: TestClient) -> None:
    """The interval is the point. An overwritten status column would lose it."""
    incident_id = str(uuid4())
    # not `state` — that name is the module-level LiveState import
    for rung in ("ACCEPTED", "DISPATCHED", "ON_SCENE"):
        client.patch(f"/api/incidents/{incident_id}/response", json={"state": rung})

    history = client.get(f"/api/incidents/{incident_id}/response").json()
    assert [row["state"] for row in history] == ["ACCEPTED", "DISPATCHED", "ON_SCENE"]
    assert history[0]["at"] <= history[-1]["at"]


def test_responses_list_is_not_parsed_as_a_uuid(client: TestClient) -> None:
    """/api/incidents/responses must not match /api/incidents/{incident_id}."""
    assert client.get("/api/incidents/responses").status_code == 200


def test_camera_status_is_derived_and_says_so(client: TestClient) -> None:
    bus_id = client.get("/api/fleet").json()[0]["bus_id"]
    cameras = client.get(f"/api/fleet/{bus_id}/cameras").json()

    assert [c["lens"] for c in cameras] == ["front", "rear", "left", "right"]
    # The honesty flag is on the wire, not in a comment: a consumer can tell
    # this is inferred rather than sensed.
    assert all(c["derived"] is True for c in cameras)
    assert all(c["state"] in {"OK", "OBSTRUCTED", "OFFLINE"} for c in cameras)


def test_camera_obstruction_is_stable_for_a_bus(client: TestClient) -> None:
    """Deterministic, not random: a value that changes on every poll makes the
    screen flicker and the demo unreproducible."""
    bus_id = client.get("/api/fleet").json()[0]["bus_id"]
    first = client.get(f"/api/fleet/{bus_id}/cameras").json()
    second = client.get(f"/api/fleet/{bus_id}/cameras").json()
    assert [c["state"] for c in first] == [c["state"] for c in second]


def test_cameras_for_an_unknown_bus_are_404(client: TestClient) -> None:
    assert client.get("/api/fleet/MTC-NOPE-9999/cameras").status_code == 404


def test_the_obstructed_state_is_reachable_on_the_real_fleet() -> None:
    """An unreachable state is an untested state.

    The obstruction rule keyed off the wrong hash byte at first and missed all
    six seeded buses, so OBSTRUCTED never appeared on a stock `make dev` — and
    the whole reason that state exists is that a driver should recognise it
    before the day it happens. This pins the property, not the constant: any
    rule is fine as long as some seeded bus still shows it and not all of them
    do.
    """
    from citydata import BUSES

    from services.cloud.api.routers.fleet import _obstructed_lens

    fleet = [bus.bus_id for bus in BUSES]
    obstructed = [bus_id for bus_id in fleet if _obstructed_lens(bus_id) is not None]

    assert obstructed, "no seeded bus ever shows an obstructed lens — the state is unreachable"
    assert len(obstructed) < len(fleet), "every bus is obstructed — the rate is wrong"


# ── the public projection ───────────────────────────────────────────────────
# Privacy that is true on the wire. These assert absence, which is the only
# assertion that means anything here: a field that is merely blank is one
# refactor away from being filled in again.

OPERATOR_ONLY = {
    "fused_confidence",
    "observation_count",
    "distinct_bus_count",
    "assigned_team",
    "sla_due",
    "evidence_uris",
}


def test_public_events_omit_every_operator_field(client: TestClient) -> None:
    make_event(WorkflowStatus.MAINTENANCE_ASSIGNED)
    public = client.get("/api/events/public").json()
    assert public, "expected at least one public event"

    for event in public:
        leaked = OPERATOR_ONLY & set(event)
        assert not leaked, f"public event leaked {sorted(leaked)}"
        # The fields a citizen map genuinely needs are still there.
        assert {"event_id", "lat", "lon", "status", "severity", "detection_class"} <= set(event)


def test_public_events_omit_the_machine_rungs(client: TestClient) -> None:
    """DETECTED and AI_VERIFIED are unreviewed algorithmic claims about a
    specific street; REJECTED is one the city looked at and disagreed with."""
    for status in (WorkflowStatus.DETECTED, WorkflowStatus.AI_VERIFIED, WorkflowStatus.REJECTED):
        make_event(status)
    make_event(WorkflowStatus.RESOLVED)

    statuses = {event["status"] for event in client.get("/api/events/public").json()}
    assert not statuses & {"DETECTED", "AI_VERIFIED", "REJECTED"}
    assert "RESOLVED" in statuses


def test_operator_events_are_unchanged(client: TestClient) -> None:
    """The projection must not have narrowed the operator's own view."""
    make_event(WorkflowStatus.MAINTENANCE_ASSIGNED)
    events = client.get("/api/events").json()
    assert set(events[0]) >= OPERATOR_ONLY


def test_public_route_is_not_parsed_as_a_uuid(client: TestClient) -> None:
    """/api/events/public must not match /api/events/{event_id}."""
    assert client.get("/api/events/public").status_code == 200


def test_public_socket_strips_and_drops(client: TestClient) -> None:
    """The socket runs for the whole session; the fetch happens once. A filter
    on one and not the other looks correct for a second and leaks after."""
    import json as _json

    from services.cloud.api.hub import broadcaster
    from services.cloud.api.routers.ws import _for_public

    public_event = make_event(WorkflowStatus.MAINTENANCE_ASSIGNED)
    hidden_event = make_event(WorkflowStatus.DETECTED)

    queue = broadcaster.subscribe()
    try:
        broadcaster.publish(WSMessageType.EVENT_UPDATED, public_event.model_dump(mode="json"))
        broadcaster.publish(WSMessageType.EVENT_UPDATED, hidden_event.model_dump(mode="json"))
        raw = []
        while not queue.empty():
            raw.append(queue.get_nowait())
    finally:
        broadcaster.unsubscribe(queue)

    projected = [_for_public(message) for message in raw]

    kept = [_json.loads(m) for m in projected if m is not None]
    assert len(kept) == 1, "the DETECTED event should have been dropped, not projected"
    assert not OPERATOR_ONLY & set(kept[0]["payload"])
    assert kept[0]["payload"]["status"] == "MAINTENANCE_ASSIGNED"


def test_public_socket_drops_unknown_frame_types(client: TestClient) -> None:
    """An allowlist, not a denylist.

    The first version forwarded anything it did not recognise, which quietly
    sent INCIDENT — a collision dossier with evidence URIs, a narrative and a
    plate hash — to every citizen device with the app open.
    """
    import json as _json

    from services.cloud.api.routers.ws import _for_public

    incident = _json.dumps(
        {
            "type": "INCIDENT",
            "ts": NOW.isoformat(),
            "payload": {"narrative": "hit and run", "evidence_uris": ["s3://evidence/plate.jpg"]},
        }
    )
    assert _for_public(incident) is None

    invented = _json.dumps({"type": "SOMETHING_NEW", "ts": NOW.isoformat(), "payload": {}})
    assert _for_public(invented) is None

    assert _for_public("not json at all") is None
