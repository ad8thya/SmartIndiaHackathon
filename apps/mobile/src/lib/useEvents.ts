/**
 * Events, from the one live cache.
 *
 * This used to fetch per screen. It now reads `store/live.ts`, which holds a
 * single copy fed by one REST hydrate and one WebSocket — so a defect that
 * escalates while a crew is looking at the queue updates the queue, and the
 * map, and the verification list, at the same instant and with the same value.
 *
 * The `publicOnly` flag is kept as a second gate rather than removed. The
 * store already refuses to admit a non-public event on a citizen session; this
 * filters again on read, and `toPublicEvent` strips the fields on render.
 * Three gates for one property is deliberate — see store/live.ts.
 */

import { useMemo } from 'react';
import { useLive } from '../store/live';
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
  const events = useLive((s) => s.events);
  const hydrated = useLive((s) => s.hydrated);
  const loadError = useLive((s) => s.loadError);

  const list = useMemo(() => {
    const all = Object.values(events);
    return publicOnly
      ? all.filter((event) => (PUBLIC_STATUSES as readonly string[]).includes(event.status))
      : all;
  }, [events, publicOnly]);

  return {
    // null still means "not loaded yet", so the skeleton logic in every screen
    // is unchanged by the move to a shared store.
    events: hydrated ? list : null,
    error: loadError,
    reload: () => undefined,
  };
}
