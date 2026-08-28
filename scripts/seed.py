#!/usr/bin/env python
"""Seed the database so the map is never empty on first load. Owned by M5.

    make seed        (or)     .venv/bin/python scripts/seed.py

Loads:
  * 6 Chennai MTC routes with real-ish polylines
  * 6 buses, spread along their routes
  * 3 school zones
  * ~40 pre-placed defect events spanning the whole workflow, so the status
    ladder (grey → amber → green) is visible the second the page opens

Idempotent: re-running replaces the seeded rows rather than duplicating them.
"""

from __future__ import annotations

import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid5

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from citydata import (
    BUSES,
    DEFECT_HOTSPOTS,
    ROUTES,
    SCHOOL_ZONES,
    SEGMENTS,
    point_at_fraction,
)
from contracts import (
    DetectionClass,
    Severity,
    WorkflowStatus,
    fuse_confidence,
    sla_hours,
)
from db import (
    Bus,
    BusPosition,
    Event,
    Incident,
    Route,
    SchoolZone,
    WorkOrder,
    linestring,
    point,
    session_scope,
)
from sqlalchemy import delete, text

SEED_NAMESPACE = UUID("2c1b6b9e-0f2a-4a58-9f2f-7f9f1b3c4d5e")
NOW = datetime.now(tz=UTC)
RNG = random.Random(20260821)

#: how the ~40 seeded events are spread across the workflow. Weighted towards
#: the middle so the demo opens on a system that is visibly *working*, not on a
#: pile of untriaged alerts or a suspiciously clean board.
STATUS_MIX: list[tuple[WorkflowStatus, int]] = [
    (WorkflowStatus.DETECTED, 7),
    (WorkflowStatus.AI_VERIFIED, 8),
    (WorkflowStatus.AUTHORITY_NOTIFIED, 7),
    (WorkflowStatus.INSPECTION, 4),
    (WorkflowStatus.MAINTENANCE_ASSIGNED, 5),
    (WorkflowStatus.REPAIR_COMPLETED, 3),
    (WorkflowStatus.VERIFIED, 2),
    (WorkflowStatus.RESOLVED, 3),
    (WorkflowStatus.REJECTED, 2),
]

TEAMS = (
    "GCC-Zone-13-Adyar",
    "GCC-Zone-9-Teynampet",
    "GCC-Zone-5-Royapuram",
    "Highways-Dept-Chennai-South",
    "TNUIFSL-Contractor-4",
)


def _c(text_: str, colour: int) -> str:
    return f"\033[{colour}m{text_}\033[0m"


async def seed() -> None:
    async with session_scope() as session:
        print(_c("→ clearing previous seed", 36))
        # order matters: children first
        for table in (WorkOrder, Incident, Event, BusPosition, Bus, Route, SchoolZone):
            await session.execute(delete(table))

        print(_c(f"→ {len(ROUTES)} routes", 36))
        for spec in ROUTES:
            session.add(
                Route(
                    route_id=spec.route_id,
                    name=spec.name,
                    geom=linestring(spec.polyline),
                    stops=spec.stops,
                    color=spec.color,
                    length_km=spec.length_km,
                )
            )
        await session.flush()

        print(_c(f"→ {len(BUSES)} buses", 36))
        for spec in BUSES:
            session.add(
                Bus(
                    bus_id=spec.bus_id,
                    route_id=spec.route_id,
                    depot=spec.depot,
                    device_serial=spec.device_serial,
                    camera_count=2,
                    active=True,
                )
            )
        await session.flush()

        # one starting position each so /api/fleet is not empty before replay runs
        for spec in BUSES:
            route = next(r for r in ROUTES if r.route_id == spec.route_id)
            (lon, lat), heading = point_at_fraction(route.polyline, spec.start_progress)
            session.add(
                BusPosition(
                    bus_id=spec.bus_id,
                    route_id=spec.route_id,
                    ts=NOW,
                    geom=point(lat, lon),
                    heading_deg=heading,
                    speed_kmph=round(RNG.uniform(12.0, 34.0), 1),
                    progress=spec.start_progress,
                    occupancy_pct=round(RNG.uniform(25.0, 85.0), 1),
                    next_stop=route.stops[0] if route.stops else None,
                    delay_min=round(RNG.uniform(-2.0, 12.0), 1),
                )
            )

        print(_c(f"→ {len(SCHOOL_ZONES)} school zones", 36))
        for zone in SCHOOL_ZONES:
            session.add(
                SchoolZone(
                    zone_id=zone.zone_id,
                    name=zone.name,
                    geom=point(zone.center[1], zone.center[0]),
                    radius_m=zone.radius_m,
                    active_hours=zone.active_hours,
                )
            )

        events = _build_events()
        print(_c(f"→ {len(events)} events across {len(STATUS_MIX)} workflow states", 36))
        work_orders = 0
        for event in events:
            session.add(event)
            if event.status in {
                WorkflowStatus.MAINTENANCE_ASSIGNED,
                WorkflowStatus.REPAIR_COMPLETED,
                WorkflowStatus.VERIFIED,
                WorkflowStatus.RESOLVED,
            }:
                session.add(_work_order_for(event))
                work_orders += 1
        print(_c(f"→ {work_orders} work orders", 36))

    print()
    print(_c("  ✔ seed complete", 32))
    await _summarise()


def _build_events() -> list[Event]:
    """Place events on the seeded hotspots first, then scatter the rest."""
    events: list[Event] = []
    statuses = [status for status, count in STATUS_MIX for _ in range(count)]
    RNG.shuffle(statuses)

    for index, status in enumerate(statuses):
        if index < len(DEFECT_HOTSPOTS):
            hotspot = DEFECT_HOTSPOTS[index]
            lon, lat = hotspot.center
            detection_class = DetectionClass(hotspot.detection_class)
            severity = Severity(hotspot.severity)
            segment_id = hotspot.road_id
        else:
            segment = RNG.choice(SEGMENTS)
            lon = segment.center[0] + RNG.uniform(-0.006, 0.006)
            lat = segment.center[1] + RNG.uniform(-0.006, 0.006)
            detection_class = RNG.choice(
                [
                    DetectionClass.POTHOLE,
                    DetectionClass.POTHOLE,
                    DetectionClass.ALLIGATOR_CRACK,
                    DetectionClass.LONGITUDINAL_CRACK,
                    DetectionClass.TRANSVERSE_CRACK,
                    DetectionClass.WATERLOGGING,
                    DetectionClass.ZEBRA_CROSSING,
                    DetectionClass.DAMAGED_DIVIDER,
                    DetectionClass.DAMAGED_SIGN,
                ]
            )
            severity = RNG.choices(
                [Severity.SMALL, Severity.MEDIUM, Severity.LARGE], weights=(4, 4, 2)
            )[0]
            segment_id = segment.road_id

        # advanced statuses imply more corroboration — otherwise the escalation
        # ladder on the map contradicts itself
        buses = _buses_for(status)
        observations = buses * RNG.randint(2, 5)
        confidences = [RNG.uniform(0.62, 0.93) for _ in range(observations)]

        first_seen = NOW - timedelta(hours=RNG.uniform(6, 240))
        last_seen = first_seen + timedelta(hours=RNG.uniform(0.5, 48))

        events.append(
            Event(
                event_id=uuid5(SEED_NAMESPACE, f"seed-event-{index}"),
                geom=point(lat, lon),
                road_segment_id=segment_id,
                detection_class=str(detection_class),
                severity=str(severity),
                fused_confidence=round(fuse_confidence(confidences), 4),
                observation_count=observations,
                distinct_bus_count=buses,
                first_seen=first_seen,
                last_seen=min(last_seen, NOW),
                status=str(status),
                assigned_team=(
                    RNG.choice(TEAMS)
                    if status not in {WorkflowStatus.DETECTED, WorkflowStatus.AI_VERIFIED}
                    else None
                ),
                sla_due=last_seen + timedelta(hours=sla_hours(severity)),
                evidence_uris=[
                    f"s3://urban-twin/evidence/seed-{index:03d}-{shot}.jpg"
                    for shot in range(RNG.randint(1, 3))
                ],
            )
        )
    return events


def _buses_for(status: WorkflowStatus) -> int:
    if status in {WorkflowStatus.DETECTED, WorkflowStatus.REJECTED}:
        return 1
    if status is WorkflowStatus.AI_VERIFIED:
        return RNG.randint(1, 2)
    return RNG.randint(3, 5)


def _work_order_for(event: Event) -> WorkOrder:
    from uuid import uuid4

    completed = event.status in {
        WorkflowStatus.REPAIR_COMPLETED,
        WorkflowStatus.VERIFIED,
        WorkflowStatus.RESOLVED,
    }
    return WorkOrder(
        work_order_id=uuid4(),
        event_id=event.event_id,
        assigned_team=event.assigned_team or RNG.choice(TEAMS),
        status=event.status,
        sla_due=event.sla_due,
        completed_at=event.last_seen + timedelta(hours=RNG.uniform(2, 60)) if completed else None,
        notes=RNG.choice(
            [
                "Cold-mix patch, 2 m². Crew of 3.",
                "Full-depth reinstatement required; traffic management booked.",
                "Thermoplastic re-marking scheduled for the night shift.",
                "Gully cleared, kerb inlet re-cut.",
                "Sign plate re-fixed to the gantry.",
            ]
        ),
        cost_estimate_inr=round(RNG.uniform(2500, 48000), -2),
    )


async def _summarise() -> None:
    async with session_scope() as session:
        for label, query in (
            ("routes", "SELECT count(*) FROM routes"),
            ("buses", "SELECT count(*) FROM buses"),
            ("school zones", "SELECT count(*) FROM school_zones"),
            ("events", "SELECT count(*) FROM events"),
            ("work orders", "SELECT count(*) FROM work_orders"),
        ):
            count = await session.scalar(text(query))
            print(f"    {label:<14} {count}")

        print()
        rows = await session.execute(
            text("SELECT status, count(*) FROM events GROUP BY status ORDER BY 2 DESC")
        )
        for status, count in rows:
            print(f"    {status:<22} {'▇' * count} {count}")


def main() -> int:
    try:
        asyncio.run(seed())
    except Exception as exc:
        print()
        print(_c(f"  ✘ seed failed: {type(exc).__name__}: {exc}", 31))
        print("    Is postgres up and migrated?   make up && make migrate")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
