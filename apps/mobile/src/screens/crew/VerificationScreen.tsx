/**
 * Repairs this crew has closed that are waiting on a bus to drive past and
 * confirm them.
 *
 * This is the loop that makes the system more than a ticket tracker: a crew
 * says the pothole is gone, and the fleet checks. Until a bus re-scans, the
 * repair is claimed, not verified — and the wording on this screen keeps that
 * distinction, because "repaired" and "confirmed repaired" are different
 * facts and only one of them was checked by a camera.
 */

import { useMemo } from 'react';
import { ScanLine, WifiOff } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { useEvents } from '../../lib/useEvents';
import { classLabel, timeAgo } from '../../lib/display';
import { AWAITING_VERIFICATION, MY_TEAM } from '../../lib/crew';
import { SEGMENTS } from '../../lib/cityRef';

/** Which route's buses will next drive the segment this defect sits on. */
function routeForSegment(segmentId: string | null): string | null {
  if (!segmentId) return null;
  return SEGMENTS.find((segment) => segment.road_id === segmentId)?.route_id ?? null;
}

export function VerificationScreen() {
  const { events, error } = useEvents();

  const blocks = useMemo<Block[]>(() => {
    if (events === null) return [{ kind: 'skeleton', id: 'loading', rows: 2 }];

    if (error) {
      return [
        {
          kind: 'empty',
          id: 'offline',
          icon: WifiOff,
          title: 'Cannot reach the city service',
          sub: 'Your closed repairs and their verification status will appear here as soon as you have signal.',
        },
      ];
    }

    const awaiting = (events ?? []).filter(
      (event) =>
        AWAITING_VERIFICATION.includes(event.status) &&
        (event.assigned_team === null || event.assigned_team === MY_TEAM),
    );

    const verified = (events ?? []).filter(
      (event) =>
        (event.status === 'VERIFIED' || event.status === 'RESOLVED') &&
        event.assigned_team === MY_TEAM,
    );

    if (awaiting.length === 0 && verified.length === 0) {
      return [
        {
          kind: 'empty',
          id: 'none',
          icon: ScanLine,
          title: 'Nothing awaiting a re-scan',
          sub: 'When you mark a repair complete it waits here until a bus drives the road again and the cameras confirm it.',
        },
      ];
    }

    const list: Block[] = [];

    if (awaiting.length) {
      list.push(
        { kind: 'label', id: 'awaiting-label', text: 'Awaiting a bus pass' },
        {
          kind: 'cards',
          id: 'awaiting',
          items: awaiting.map((event) => {
            const route = routeForSegment(event.road_segment_id);
            return {
              id: event.event_id,
              title: classLabel(event.detection_class),
              sub: event.road_segment_id ?? 'On a road you closed',
              meta: timeAgo(event.last_seen),
              chips: [{ label: 'Repair claimed', tone: 'warn' as const }],
              details: [
                {
                  icon: ScanLine,
                  text: route ? `Awaiting next pass · Route ${route}` : 'Awaiting the next bus pass',
                },
              ],
              to: `/crew/order/${event.event_id}`,
            };
          }),
        },
        {
          kind: 'note',
          id: 'awaiting-note',
          text: 'A repair is confirmed by the fleet, not by the crew that made it. These stay here until a bus drives the road and the cameras see a clean surface.',
        },
      );
    }

    if (verified.length) {
      list.push(
        { kind: 'label', id: 'done-label', text: 'Confirmed by the fleet' },
        {
          kind: 'cards',
          id: 'done',
          items: verified.slice(0, 10).map((event) => ({
            id: event.event_id,
            title: classLabel(event.detection_class),
            sub: event.road_segment_id ?? '',
            meta: timeAgo(event.last_seen),
            chips: [{ label: 'Verified', tone: 'good' as const }],
          })),
        },
      );
    }

    return list;
  }, [events, error]);

  return <BlockRenderer blocks={blocks} />;
}
