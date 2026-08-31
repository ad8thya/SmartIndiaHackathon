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
 * Exactly what `GET /api/events/public` and `ws?audience=public` send.
 *
 * Mirrors `services/cloud/api/projection.py`: an Event minus
 * fused_confidence, observation_count, distinct_bus_count, assigned_team,
 * sla_due and evidence_uris. Keep the two in step — this is the shape the
 * server actually produces, not a wish about it.
 */
export interface PublicEvent {
  event_id: string;
  lat: number;
  lon: number;
  detection_class: UTEvent['detection_class'];
  severity: UTEvent['severity'];
  status: UTEvent['status'];
  road_segment_id: string | null;
  first_seen: string;
  last_seen: string;
}

/**
 * What the live store holds, whichever role is signed in.
 *
 * The public fields are always present; the operator fields are present only
 * on an operational session, because on a citizen session the server never
 * sent them. Typed as optional rather than asserted away, so every read of an
 * operator field is a place TypeScript makes you decide what happens when it
 * is genuinely absent. That is the correct amount of friction: those reads
 * are exactly the ones that would have leaked.
 */
export type StoredEvent = PublicEvent &
  Partial<
    Pick<
      UTEvent,
      | 'fused_confidence'
      | 'observation_count'
      | 'distinct_bus_count'
      | 'assigned_team'
      | 'sla_due'
      | 'evidence_uris'
    >
  >;

/**
 * Belt to the server's braces. The projection already removed these fields
 * before they reached this device; this makes a citizen component's type
 * reflect that, and keeps working if someone ever points a citizen session at
 * the operator endpoint by mistake.
 */
export function toPublicEvent(event: StoredEvent): PublicEvent {
  return {
    event_id: event.event_id,
    lat: event.lat,
    lon: event.lon,
    detection_class: event.detection_class,
    severity: event.severity,
    status: event.status,
    road_segment_id: event.road_segment_id,
    first_seen: event.first_seen,
    last_seen: event.last_seen,
    // Deliberately absent: fused_confidence, observation_count,
    // distinct_bus_count, assigned_team, sla_due, evidence_uris — removed by
    // services/cloud/api/projection.py before they ever reached this device.
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
