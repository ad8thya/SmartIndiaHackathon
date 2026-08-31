"""What a member of the public is allowed to receive. Owned by M5.

THE POINT OF THIS MODULE: privacy that is true on the wire, not in a
component.

The citizen map was filtered three times in the phone app — at ingest, at
read, and again at render — and none of that stopped the server sending
`fused_confidence`, `distinct_bus_count`, `observation_count`,
`assigned_team` and `sla_due` to a citizen's device. A render filter is a
presentation choice. Anyone with devtools, a proxy, or a modified client saw
the operator's view. We claim privacy-by-design under the DPDP Act; that has
to mean the bytes never leave.

So the projection happens here, once, and both the REST route and the
WebSocket pump use it. Two paths, one definition — a filter applied to the
fetch but not the socket looks correct for the first second of a session and
leaks for the rest of it.

Kept out of `packages/contracts` deliberately. This is a policy about who may
see what, not a wire shape both sides must agree on: the public payload is an
`Event` with fields removed, and a consumer that ignores the missing keys
still works. Putting it in contracts would mean a fourth amendment for a rule
that only the server needs to enforce.
"""

from __future__ import annotations

from typing import Any

from contracts import Event, WorkflowStatus

#: Fields an operator may see and a member of the public may not.
#:
#: Every one of these is either a machine-confidence signal or an internal
#: workflow detail:
#:   fused_confidence   — how sure the model is; an accusation with a number on it
#:   observation_count  — how many times cameras saw it
#:   distinct_bus_count — how many buses corroborated, i.e. surveillance density
#:   assigned_team      — which municipal crew owns it; internal routing
#:   sla_due            — the city's internal commitment, not a public promise
#:   evidence_uris      — frames from the street, which may contain bystanders
OPERATOR_ONLY_FIELDS: frozenset[str] = frozenset(
    {
        "fused_confidence",
        "observation_count",
        "distinct_bus_count",
        "assigned_team",
        "sla_due",
        "evidence_uris",
    }
)

#: The rungs a member of the public may see at all.
#:
#: The ladder starts with machine output: DETECTED is one bus with low
#: confidence, AI_VERIFIED is corroborated but unreviewed. Publishing those
#: puts unreviewed algorithmic claims about specific streets in front of the
#: public. REJECTED is worse — it publishes the ones the city looked at and
#: disagreed with. So the public dataset starts at AUTHORITY_NOTIFIED, the
#: rung where a human has been told and the city owns the item.
PUBLIC_STATUSES: frozenset[WorkflowStatus] = frozenset(
    {
        WorkflowStatus.AUTHORITY_NOTIFIED,
        WorkflowStatus.INSPECTION,
        WorkflowStatus.MAINTENANCE_ASSIGNED,
        WorkflowStatus.REPAIR_COMPLETED,
        WorkflowStatus.VERIFIED,
        WorkflowStatus.RESOLVED,
    }
)


def is_public(event: Event) -> bool:
    """Whether this event may be shown to a member of the public at all."""
    return event.status in PUBLIC_STATUSES


def project_event(event: Event) -> dict[str, Any]:
    """An event with the operator-only fields REMOVED, not blanked.

    Removed rather than nulled: a `None` where a confidence used to be still
    tells a reader the field exists and invites a client to start expecting
    it. An absent key says the public dataset does not have this concept.
    """
    payload = event.model_dump(mode="json")
    for field in OPERATOR_ONLY_FIELDS:
        payload.pop(field, None)
    return payload


def project_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Same, for a payload already serialised — the WebSocket path."""
    return {key: value for key, value in payload.items() if key not in OPERATOR_ONLY_FIELDS}
