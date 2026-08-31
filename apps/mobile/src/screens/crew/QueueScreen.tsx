/**
 * The crew's queue: work orders assigned to them, worst first.
 *
 * Sorted by SLA rather than by distance or severity. A crew's day is governed
 * by what is about to breach, and a list that sorts by "nearest" quietly
 * optimises for the wrong thing — the nearest job is often the one with a week
 * left on it.
 */

import { useEffect, useMemo } from 'react';
import { ClipboardCheck, Wifi } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { useEvents } from '../../lib/useEvents';
import { useGeolocation } from '../../lib/useGeolocation';
import { classLabel, timeAgo } from '../../lib/display';
import { isQueued, MY_TEAM, orderDetails, slaFor } from '../../lib/crew';

export function QueueScreen() {
  const { events, error } = useEvents();
  const { state: geo, locate } = useGeolocation();

  // Distance is the second most useful column on this screen, so ask for a fix
  // on open rather than waiting for the crew to press something.
  useEffect(() => {
    locate();
  }, [locate]);

  const from = geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : null;

  const queue = useMemo(() => {
    const mine = (events ?? [])
      .filter(isQueued)
      // Unassigned work is still this crew's problem — an event that reached
      // AUTHORITY_NOTIFIED and was never routed to a team would otherwise sit
      // in nobody's list at all, which is how an SLA quietly breaches.
      .filter((event) => event.assigned_team === null || event.assigned_team === MY_TEAM);
    return mine.sort((a, b) => slaFor(a).msLeft - slaFor(b).msLeft);
  }, [events]);

  const blocks = useMemo<Block[]>(() => {
    if (events === null && !error) return [{ kind: 'skeleton', id: 'loading', rows: 4 }];

    if (error) {
      return [
        {
          kind: 'empty',
          id: 'error',
          icon: Wifi,
          title: 'Cannot reach the city service',
          sub: 'Your queue could not be loaded. It will fill in as soon as you have signal again.',
        },
      ];
    }

    if (queue.length === 0) {
      return [
        {
          kind: 'empty',
          id: 'clear',
          icon: ClipboardCheck,
          title: 'Queue is clear',
          sub: `Nothing is assigned to ${MY_TEAM} right now. New orders appear here as the console assigns them.`,
        },
      ];
    }

    const overdue = queue.filter((event) => slaFor(event).overdue).length;
    const soon = queue.filter((event) => !slaFor(event).overdue && slaFor(event).tone === 'warn').length;

    return [
      {
        kind: 'kpis',
        id: 'kpis',
        items: [
          { id: 'open', label: 'Open orders', value: queue.length },
          {
            id: 'overdue',
            label: overdue > 0 ? 'Overdue' : 'Due within 6 h',
            value: overdue > 0 ? overdue : soon,
            tone: overdue > 0 ? 'bad' : soon > 0 ? 'warn' : 'good',
          },
        ],
      },
      { kind: 'label', id: 'label', text: `${MY_TEAM} · soonest first` },
      {
        kind: 'cards',
        id: 'queue',
        items: queue.map((event) => {
          const sla = slaFor(event);
          return {
            id: event.event_id,
            title: classLabel(event.detection_class),
            sub: event.road_segment_id ?? 'Location on the map',
            meta: timeAgo(event.last_seen),
            to: `/crew/order/${event.event_id}`,
            stripe: sla.tone,
            chips: [
              { label: event.severity.toLowerCase(), tone: severityTone(event.severity) },
              { label: sla.label, tone: sla.tone },
            ],
            details: orderDetails(event, from),
          };
        }),
      },
      {
        kind: 'note',
        id: 'sla-note',
        text: 'Times are against the IRC:82 response window for each severity. Tap an order for evidence and the recommended treatment.',
      },
    ];
  }, [events, error, queue, from]);

  return <BlockRenderer blocks={blocks} />;
}

function severityTone(severity: string): 'accent' | 'warn' | 'bad' {
  return severity === 'LARGE' ? 'bad' : severity === 'MEDIUM' ? 'warn' : 'accent';
}
