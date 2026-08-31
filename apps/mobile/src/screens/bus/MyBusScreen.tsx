/**
 * One card: bus, route, shift, status.
 *
 * This role stays small on purpose. A driver is driving; the phone is a
 * status check at the depot, not a dashboard. Every temptation to add a KPI
 * grid here should be resisted — the analytics belong to the roles that sit
 * at a desk, and putting them in front of someone about to pull into traffic
 * is a safety decision dressed up as a feature.
 */

import { useMemo } from 'react';
import { Bus, Gauge, MapPin, Radio, Users } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { useMyBus } from '../../lib/useFleet';
import { timeAgo } from '../../lib/display';

export function MyBusScreen() {
  const { bus, route, error, loaded } = useMyBus();

  const blocks = useMemo<Block[]>(() => {
    if (!loaded) return [{ kind: 'skeleton', id: 'loading', rows: 2 }];

    if (error || !bus) {
      return [
        {
          kind: 'empty',
          id: 'nobus',
          icon: Bus,
          title: 'No bus assigned',
          sub: error
            ? 'The fleet service is not reachable right now. Your bus will appear here when it is.'
            : 'Nothing is running under your depot at the moment.',
        },
      ];
    }

    const moving = bus.speed_kmph > 2;

    return [
      {
        kind: 'cards',
        id: 'bus',
        items: [
          {
            id: bus.bus_id,
            title: bus.bus_id,
            sub: route ? `${route.name} · route ${route.route_id}` : `Route ${bus.route_id ?? '—'}`,
            chips: [
              { label: moving ? 'In service' : 'Stopped', tone: moving ? 'good' : 'neutral' },
              ...(bus.delay_min > 5
                ? [{ label: `${Math.round(bus.delay_min)} min late`, tone: 'warn' as const }]
                : []),
            ],
            meta: timeAgo(bus.ts),
            details: [
              { icon: Gauge, text: `${Math.round(bus.speed_kmph)} km/h` },
              { icon: MapPin, text: bus.next_stop ? `Next stop ${bus.next_stop}` : 'Between stops' },
              { icon: Users, text: `${Math.round(bus.occupancy_pct)}% full` },
            ],
            progress: bus.progress,
            progressLabel: `${Math.round(bus.progress * 100)}% of route`,
          },
        ],
      },
      {
        kind: 'list',
        id: 'shift',
        rows: [
          { id: 'route', icon: MapPin, label: 'Route', value: bus.route_id ?? '—' },
          {
            id: 'cameras',
            icon: Radio,
            label: 'Cameras',
            value: 'Check',
            to: '/bus/cameras',
          },
          { id: 'today', icon: Bus, label: "Today's route", value: 'View', to: '/bus/route' },
        ],
      },
      {
        kind: 'note',
        id: 'note',
        text: 'Your cameras record the road surface as you drive. You do not have to do anything with them — this screen is only so you can tell if one has stopped working.',
      },
    ];
  }, [bus, route, error, loaded]);

  return <BlockRenderer blocks={blocks} />;
}
