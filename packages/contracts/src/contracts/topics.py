"""MQTT topic layout. Shared so the publisher and the subscriber cannot drift."""

from __future__ import annotations

__all__ = [
    "ALL_INCIDENTS",
    "ALL_OBSERVATIONS",
    "ALL_POSITIONS",
    "INCIDENT_TOPIC",
    "OBSERVATION_TOPIC",
    "POSITION_TOPIC",
    "incident_topic",
    "observation_topic",
    "position_topic",
]

POSITION_TOPIC = "bus/{bus_id}/position"
OBSERVATION_TOPIC = "bus/{bus_id}/observation"
INCIDENT_TOPIC = "bus/{bus_id}/incident"

ALL_POSITIONS = "bus/+/position"
ALL_OBSERVATIONS = "bus/+/observation"
ALL_INCIDENTS = "bus/+/incident"


def position_topic(bus_id: str) -> str:
    return POSITION_TOPIC.format(bus_id=bus_id)


def observation_topic(bus_id: str) -> str:
    return OBSERVATION_TOPIC.format(bus_id=bus_id)


def incident_topic(bus_id: str) -> str:
    return INCIDENT_TOPIC.format(bus_id=bus_id)
