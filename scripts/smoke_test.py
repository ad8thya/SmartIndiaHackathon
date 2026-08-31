#!/usr/bin/env python
"""Green/red checklist for every moving part. Owned by M5.

    make smoke

Answers one question honestly: is the system actually up, or does it just look
up? Each check prints PASS/FAIL with the reason, and the exit code is non-zero
if anything required failed — so this works in CI as well as on a laptop three
minutes before a demo.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


@dataclass
class Result:
    name: str
    ok: bool
    detail: str = ""
    required: bool = True


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)

    def add(self, name: str, ok: bool, detail: str = "", required: bool = True) -> bool:
        self.results.append(Result(name, ok, detail, required))
        mark = (
            f"{GREEN}✔ PASS{RESET}"
            if ok
            else (f"{RED}✘ FAIL{RESET}" if required else f"{YELLOW}~ SKIP{RESET}")
        )
        line = f"  {mark}  {name}"
        if detail:
            line += f"  {DIM}{detail}{RESET}"
        print(line)
        return ok

    @property
    def failed(self) -> list[Result]:
        return [r for r in self.results if not r.ok and r.required]


def section(title: str) -> None:
    print(f"\n{DIM}── {title} {'─' * max(0, 58 - len(title))}{RESET}")


# ── checks ──────────────────────────────────────────────────────────────────
async def check_postgres(report: Report) -> None:
    section("postgres + postgis")
    try:
        from db import session_scope
        from sqlalchemy import text

        async with session_scope() as session:
            await session.execute(text("SELECT 1"))
            report.add("postgres accepts connections", True)

            version = await session.scalar(text("SELECT postgis_version()"))
            report.add("postgis extension installed", version is not None, str(version))

            rows = await session.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
            )
            present = {row[0] for row in rows}
            expected = {
                "routes",
                "buses",
                "bus_positions",
                "observations",
                "events",
                "event_observations",
                "work_orders",
                "incidents",
                "school_zones",
            }
            missing = expected - present
            report.add(
                f"all {len(expected)} tables present",
                not missing,
                f"missing: {', '.join(sorted(missing))}" if missing else f"{len(present)} tables",
            )

            geography = await session.scalar(
                text("SELECT count(*) FROM geography_columns WHERE f_table_schema='public'")
            )
            report.add(
                "geography columns registered",
                bool(geography),
                f"{geography} spatial columns (metres, not degrees)",
            )

            gist = await session.scalar(
                text("SELECT count(*) FROM pg_indexes WHERE indexdef ILIKE '%USING gist%'")
            )
            report.add("GIST indexes on geometry", bool(gist), f"{gist} indexes")

            events = await session.scalar(text("SELECT count(*) FROM events"))
            report.add(
                "seed data loaded",
                bool(events and events > 10),
                f"{events} events — run `make seed` if this is 0",
            )
    except Exception as exc:
        report.add("postgres reachable", False, f"{type(exc).__name__}: {exc}")


async def check_redis(report: Report) -> None:
    section("redis")
    try:
        import redis.asyncio as aioredis

        from services.cloud.api.config import get_api_settings

        client = aioredis.from_url(get_api_settings().REDIS_URL)
        try:
            started = time.perf_counter()
            await client.ping()
            elapsed = (time.perf_counter() - started) * 1000
            report.add("redis PING", True, f"{elapsed:.1f} ms")
            await client.set("urban-twin:smoke", "ok", ex=30)
            value = await client.get("urban-twin:smoke")
            report.add("redis SET/GET roundtrip", value == b"ok")
        finally:
            await client.aclose()
    except Exception as exc:
        report.add("redis reachable", False, f"{type(exc).__name__}: {exc}")


def check_mqtt(report: Report) -> None:
    section("mosquitto")
    try:
        import paho.mqtt.client as mqtt
        from contracts import position_topic

        from services.tools.replay.config import get_replay_settings

        settings = get_replay_settings()
        received: list[str] = []

        subscriber = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smoke-sub")
        subscriber.on_message = lambda c, u, m: received.append(m.payload.decode())
        subscriber.connect(settings.MQTT_HOST, settings.MQTT_PORT, 10)
        report.add("mqtt connect", True, f"{settings.MQTT_HOST}:{settings.MQTT_PORT}")

        topic = position_topic("MTC-SMOKE-0001")
        subscriber.subscribe(topic)
        subscriber.loop_start()

        publisher = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smoke-pub")
        publisher.connect(settings.MQTT_HOST, settings.MQTT_PORT, 10)
        publisher.publish(topic, json.dumps({"smoke": True}))

        deadline = time.monotonic() + 5.0
        while not received and time.monotonic() < deadline:
            time.sleep(0.1)

        subscriber.loop_stop()
        subscriber.disconnect()
        publisher.disconnect()

        report.add(
            "mqtt publish → subscribe roundtrip",
            bool(received),
            "check infra/mosquitto/mosquitto.conf has allow_anonymous true" if not received else "",
        )
    except Exception as exc:
        report.add(
            "mqtt reachable",
            False,
            f"{type(exc).__name__}: {exc} — mosquitto 2.x needs an explicit config file",
        )


def check_factories(report: Report) -> None:
    section("module factories (all six owners, eight Protocols)")
    from citydata import DEFECT_HOTSPOTS, segment_by_id
    from contracts import (
        DefectDetector,
        EventFuser,
        FrameMeta,
        IncidentDetector,
        PedestrianRiskDetector,
        RecommendationEngine,
        RiskContext,
        RiskScorer,
        TrafficAnalyzer,
        WhatIfEngine,
        WhatIfRequest,
    )

    from services.cloud.consensus import get_event_fuser
    from services.cloud.intelligence.recommend import get_recommendation_engine
    from services.cloud.intelligence.traffic_analytics import get_traffic_analyzer
    from services.cloud.intelligence.urban_risk import get_risk_scorer
    from services.cloud.intelligence.whatif import get_whatif_engine
    from services.edge.defects import get_defect_detector
    from services.edge.incidents import get_incident_detector
    from services.edge.pedestrian import get_pedestrian_detector

    hotspot = DEFECT_HOTSPOTS[0]
    meta = FrameMeta(
        bus_id="MTC-ADYAR-1042",
        route_id="27B",
        ts=datetime.now(tz=UTC),
        lat=hotspot.center[1],
        lon=hotspot.center[0],
        heading_deg=180.0,
        speed_kmph=25.0,
    )
    risk_ctx = RiskContext(
        defect_counts={"POTHOLE": 2},
        avg_congestion_pct=40.0,
        pedestrian_density=4.0,
        near_miss_count=1,
        school_zone_distance_m=200.0,
        pci_score=70.0,
        recent_incident_count=0,
    )

    checks = [
        (
            "M1 DefectDetector",
            get_defect_detector,
            DefectDetector,
            lambda impl: impl.detect(None, meta),
        ),
        (
            "M3 PedestrianRiskDetector",
            get_pedestrian_detector,
            PedestrianRiskDetector,
            lambda impl: impl.detect(None, meta),
        ),
        (
            "M4 IncidentDetector",
            get_incident_detector,
            IncidentDetector,
            lambda impl: impl.process([], meta),
        ),
        (
            "M2 TrafficAnalyzer",
            get_traffic_analyzer,
            TrafficAnalyzer,
            lambda impl: impl.analyze([]),
        ),
        ("M3 EventFuser", get_event_fuser, EventFuser, lambda impl: impl.fuse([])),
        (
            "M2 WhatIfEngine",
            get_whatif_engine,
            WhatIfEngine,
            lambda impl: impl.simulate(
                WhatIfRequest(closed_road_ids=[segment_by_id("SEG-27B-000").road_id])
            ),
        ),
        (
            "M3 RiskScorer",
            get_risk_scorer,
            RiskScorer,
            lambda impl: impl.score("SEG-27B-000", risk_ctx),
        ),
        (
            "M2 RecommendationEngine",
            get_recommendation_engine,
            RecommendationEngine,
            lambda impl: impl.recommend("SEG-27B-000", risk_ctx),
        ),
    ]

    for label, factory, protocol, exercise in checks:
        try:
            impl = factory()
            conforms = isinstance(impl, protocol)
            exercise(impl)
            report.add(
                f"{label} → {type(impl).__name__}",
                conforms,
                "" if conforms else "does not satisfy its Protocol",
            )
        except NotImplementedError:
            report.add(
                f"{label} → {type(factory()).__name__}",
                False,
                "USE_REAL_* is true but the implementation raises NotImplementedError",
            )
        except Exception as exc:
            report.add(f"{label}", False, f"{type(exc).__name__}: {exc}")


def check_api(report: Report) -> None:
    section("api")
    try:
        from fastapi.testclient import TestClient

        from services.cloud.api.main import app

        with TestClient(app) as client:
            response = client.get("/health")
            report.add("GET /health returns 200", response.status_code == 200)

            for path in (
                "/api/fleet",
                "/api/routes",
                "/api/events",
                "/api/roads/SEG-27B-000/condition",
                "/api/incidents",
                "/api/reports",
                "/api/analytics/summary",
                "/api/roads/SEG-27B-000/risk",
                "/api/recommendations",
                "/api/near-misses",
                "/api/junctions/dangerous",
            ):
                r = client.get(path)
                report.add(f"GET {path}", r.status_code == 200, f"HTTP {r.status_code}")

            r = client.post("/api/whatif/simulate", json={"closed_road_ids": ["SEG-27B-000"]})
            report.add(
                "POST /api/whatif/simulate",
                r.status_code == 200 and len(r.json()) > 0,
                f"{len(r.json()) if r.status_code == 200 else 0} route results",
            )

            with client.websocket_connect("/ws/live") as socket:
                hello = socket.receive_json()
                report.add("WS /ws/live accepts a connection", hello["type"] == "HELLO")

            # The check that would have caught the original bug: the phone's
            # report screen "worked" for weeks while writing to a browser cache
            # no operator could read. A report has to reach the API and come
            # back out of it with an id.
            filed = client.post(
                "/api/reports",
                json={
                    "category": "POTHOLE",
                    "description": "smoke test — safe to ignore",
                    "lat": 13.0067,
                    "lon": 80.2570,
                    "reporter_name": "smoke-test",
                },
            )
            stored = (
                filed.status_code == 201
                and client.get(f"/api/reports/{filed.json()['report_id']}").status_code == 200
            )
            report.add(
                "a citizen report reaches the API and is readable back",
                stored,
                "" if stored else f"HTTP {filed.status_code}",
            )
    except Exception as exc:
        report.add("api importable and serving", False, f"{type(exc).__name__}: {exc}")


def check_frontend(report: Report) -> None:
    section("frontend")
    root = Path(__file__).resolve().parents[1]
    for app_dir in ("apps/web", "apps/mobile"):
        installed = (root / app_dir / "node_modules").is_dir()
        report.add(
            f"{app_dir} dependencies installed",
            installed,
            "" if installed else "run `make setup`",
            required=False,
        )

    # Both apps read the same generated contract types. If they ever differ,
    # one of them was edited by hand — which is the exact bug the generator
    # exists to prevent (BUILD.md §5), so it is worth a red line here.
    web_types = root / "apps/web/src/lib/types.ts"
    mobile_types = root / "apps/mobile/src/lib/types.ts"
    if web_types.is_file() and mobile_types.is_file():
        same = web_types.read_text() == mobile_types.read_text()
        report.add(
            "contract types identical across both apps",
            same,
            "" if same else "run `make types` — one of them has drifted",
        )
    else:
        report.add(
            "contract types generated for both apps",
            False,
            "run `make types`",
        )

    # The mobile app deliberately ships no basemap of its own; it reads this
    # one, through a symlink in dev and the shared origin in production.
    basemap = root / "apps/mobile/public/map/chennai.pmtiles"
    report.add(
        "mobile basemap symlink resolves",
        basemap.is_file(),
        f"{basemap.stat().st_size // (1024 * 1024)} MB (shared with apps/web)"
        if basemap.is_file()
        else "apps/mobile/public/map is dangling",
        required=False,
    )

    buildings = root / "apps/web/public/data/buildings.geojson"
    report.add(
        "3D building footprints cached",
        buildings.is_file(),
        f"{buildings.stat().st_size // 1024} KB" if buildings.is_file() else "run `make buildings`",
        required=False,
    )


# ── main ────────────────────────────────────────────────────────────────────
async def run() -> int:
    print(f"\n{DIM}URBAN TWIN smoke test — {datetime.now(tz=UTC):%Y-%m-%d %H:%M:%S UTC}{RESET}")
    report = Report()

    await check_postgres(report)
    await check_redis(report)
    check_mqtt(report)
    check_factories(report)
    check_api(report)
    check_frontend(report)

    passed = sum(1 for r in report.results if r.ok)
    total = len(report.results)
    print()
    if report.failed:
        print(f"  {RED}✘ {len(report.failed)} of {total} checks failed{RESET}  ({passed} passed)")
        print()
        for result in report.failed:
            print(f"    {RED}·{RESET} {result.name}  {DIM}{result.detail}{RESET}")
        print(f"\n  {DIM}Troubleshooting lives in README.md § Troubleshooting{RESET}\n")
        return 1

    print(f"  {GREEN}✔ all {passed} checks passed{RESET}\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
