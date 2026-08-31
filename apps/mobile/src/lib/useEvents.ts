/**
 * Events from the API, with the citizen privacy filter applied at the source.
 *
 * `publicOnly` is not a display option. When it is set, the request itself
 * asks only for the public statuses and the fields a member of the public may
 * see are the only ones that reach the component — so there is no code path
 * where a confidence score or a bus id is in memory on a citizen screen
 * waiting for someone to render it by accident.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { PUBLIC_STATUSES } from './display';
import type { UTEvent } from './types';

/**
 * What a citizen screen is allowed to hold. Structurally a subset of UTEvent,
 * so nothing can hand a full event to a component expecting this one and have
 * TypeScript stay quiet about the extra fields — the fields are gone, not
 * hidden behind a flag.
 */
export interface PublicEvent {
  event_id: string;
  lat: number;
  lon: number;
  detection_class: UTEvent['detection_class'];
  severity: UTEvent['severity'];
  status: UTEvent['status'];
  road_segment_id: string | null;
  last_seen: string;
}

/** Strips everything an operator may see and a citizen may not. */
export function toPublicEvent(event: UTEvent): PublicEvent {
  return {
    event_id: event.event_id,
    lat: event.lat,
    lon: event.lon,
    detection_class: event.detection_class,
    severity: event.severity,
    status: event.status,
    road_segment_id: event.road_segment_id,
    last_seen: event.last_seen,
    // Deliberately absent: fused_confidence, observation_count,
    // distinct_bus_count, assigned_team, sla_due, evidence_uris. See
    // apps/mobile/README.md § The privacy story.
  };
}

export function useEvents({ publicOnly = false }: { publicOnly?: boolean } = {}) {
  const [events, setEvents] = useState<UTEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const fetched = await api.events(
        publicOnly ? { status: [...PUBLIC_STATUSES], limit: 500 } : { limit: 500 },
      );
      setEvents(fetched);
      setError(null);
    } catch (cause) {
      // Empty, not null. `null` means "still loading", and leaving it null on
      // failure leaves every consumer showing a skeleton forever — which is
      // the worst of the three states: it says "nearly there" indefinitely
      // while the phone has no signal at all.
      setEvents([]);
      setError(cause instanceof Error ? cause.message : 'could not load');
    }
  }, [publicOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return { events, error, reload: load };
}
