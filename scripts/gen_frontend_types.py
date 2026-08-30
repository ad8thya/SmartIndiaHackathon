"""Generate apps/web/src/lib/types.ts from packages/contracts.

The frontend used to carry three hand-mirrored copies of the contract types
(apps/command, apps/field, apps/roles) — and one of them drifted (see BUILD.md
§5). This script replaces all of them with a single generated file, produced by
introspecting the actual pydantic models and StrEnums in `contracts`.

Run:  .venv/bin/python scripts/gen_frontend_types.py
It is deterministic; CI can diff the output against the committed file.
"""

from __future__ import annotations

import datetime
import enum
import types
import typing
import uuid
from pathlib import Path

from pydantic import BaseModel

import contracts
from contracts import enums as contract_enums

OUT = Path(__file__).resolve().parent.parent / "apps/web/src/lib/types.ts"

# contracts names that collide with DOM/global names in TS land
RENAME = {"Event": "UTEvent", "Route": "UTRoute"}

ENUMS = [
    contract_enums.DetectionClass,
    contract_enums.Severity,
    contract_enums.WorkflowStatus,
    contract_enums.RiskLevel,
    contract_enums.RiskBand,
    contract_enums.RecommendationType,
    contract_enums.WSMessageType,
]

MODELS = [
    contracts.BBox,
    contracts.Observation,
    contracts.Event,
    contracts.BusPosition,
    contracts.Route,
    contracts.RoadCondition,
    contracts.UrbanRiskScore,
    contracts.InfrastructureRecommendation,
    contracts.NearMissEvent,
    contracts.WhatIfRequest,
    contracts.WhatIfResult,
    contracts.IncidentReport,
    contracts.WorkOrder,
    contracts.AnalyticsSummary,
    contracts.HealthStatus,
]

ENUM_NAMES = {e.__name__ for e in ENUMS}


def ts_type(annotation: object) -> str:
    """Map a python annotation to a TypeScript type string."""
    if annotation is None or annotation is type(None):
        return "null"
    origin = typing.get_origin(annotation)
    args = typing.get_args(annotation)

    if origin in (typing.Union, types.UnionType):
        return " | ".join(dict.fromkeys(ts_type(a) for a in args))
    if origin in (list, tuple, set, frozenset):
        if origin is tuple and len(args) == 2 and all(a is float for a in args):
            return "LonLat"
        inner = ts_type(args[0]) if args else "unknown"
        return f"{inner}[]" if " " not in inner else f"Array<{inner}>"
    if origin is dict:
        key = ts_type(args[0]) if args else "string"
        val = ts_type(args[1]) if len(args) > 1 else "unknown"
        return f"Record<{key}, {val}>"

    if isinstance(annotation, type):
        if issubclass(annotation, enum.Enum):
            return annotation.__name__ if annotation.__name__ in ENUM_NAMES else "string"
        if issubclass(annotation, bool):
            return "boolean"
        if issubclass(annotation, (int, float)):
            return "number"
        if issubclass(annotation, (str, uuid.UUID, datetime.datetime, datetime.date)):
            return "string"
        if issubclass(annotation, BaseModel):
            return RENAME.get(annotation.__name__, annotation.__name__)
    # Annotated[...] and pydantic constrained aliases resolve through metadata
    if args:
        return ts_type(args[0])
    return "unknown"


def emit_enum(cls: type[enum.Enum]) -> str:
    members = "\n  | ".join(f"'{m.value}'" for m in cls)
    return f"export type {cls.__name__} =\n  | {members};\n"


def emit_model(cls: type[BaseModel]) -> str:
    name = RENAME.get(cls.__name__, cls.__name__)
    lines = [f"export interface {name} {{"]
    for field_name, field in cls.model_fields.items():
        lines.append(f"  {field_name}: {ts_type(field.annotation)};")
    lines.append("}\n")
    return "\n".join(lines)


def class_list(name: str, values: typing.Iterable[enum.Enum]) -> str:
    ordered = [m.value for m in contract_enums.DetectionClass if m in set(values)]
    body = ",\n  ".join(f"'{v}'" for v in ordered)
    return (
        f"export const {name}: readonly DetectionClass[] = [\n  {body},\n] as const;\n"
    )


HAND_WRITTEN = """\
/** GeoJSON order throughout: [lon, lat]. */
export type LonLat = [number, number];

export const WORKFLOW_ORDER: readonly WorkflowStatus[] = [
  'DETECTED',
  'AI_VERIFIED',
  'AUTHORITY_NOTIFIED',
  'INSPECTION',
  'MAINTENANCE_ASSIGNED',
  'REPAIR_COMPLETED',
  'VERIFIED',
  'RESOLVED',
  'REJECTED',
] as const;

/** API-level shape (routers/intelligence.py) — not a wire model in contracts. */
export interface DangerousJunction {
  road_id: string;
  name: string;
  lat: number;
  lon: number;
  risk_score: number;
  risk_band: RiskBand;
  near_miss_count_7d: number;
}

export interface WSMessage<T = Record<string, unknown>> {
  type: WSMessageType;
  ts: string;
  payload: T;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }>;
}

/**
 * Every command-console panel receives exactly these props. One shape, five
 * owners, no negotiation — a panel can be developed against mock props.
 */
export interface PanelProps {
  events: UTEvent[];
  roads: RoadCondition[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}
"""


def main() -> None:
    parts = [
        "/**\n"
        " * GENERATED from packages/contracts — do not edit by hand.\n"
        " * Regenerate with:  .venv/bin/python scripts/gen_frontend_types.py\n"
        f" * contracts version: {getattr(contracts, '__version__', 'unknown')}\n"
        " */\n",
    ]
    parts += [emit_enum(e) for e in ENUMS]
    parts.append(
        class_list("INFRASTRUCTURE_CLASSES", contract_enums.INFRASTRUCTURE_CLASSES)
    )
    parts.append(class_list("FUSABLE_CLASSES", contract_enums.FUSABLE_CLASSES))
    parts.append(HAND_WRITTEN)
    parts += [emit_model(m) for m in MODELS]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(parts))
    print(f"wrote {OUT.relative_to(Path.cwd())}")


if __name__ == "__main__":
    main()
