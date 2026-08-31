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
import { AlertTriangle, Bus, Check, ScanLine, WifiOff } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { useEvents } from '../../lib/useEvents';
import { classLabel, timeAgo } from '../../lib/display';
import { AWAITING_VERIFICATION, MY_TEAM } from '../../lib/crew';
import { SEGMENTS } from '../../lib/cityRef';
import { byEvent, useVerification } from '../../lib/verification';

/** Which route's buses will next drive the segment this defect sits on. */
function routeForSegment(segmentId: string | null): string | null {
  if (!segmentId) return null;
  return SEGMENTS.find((segment) => segment.road_id === segmentId)?.route_id ?? null;
}

export function VerificationScreen() {
  const { events, error } = useEvents();
  const { rows: verification } = useVerification();
  const progressFor = byEvent(verification);

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

    const blocked = awaiting.filter((event) => {
      const p = progressFor[event.event_id.replace(/-/g, '')];
      return p?.needs_manual || (p?.dirty_passes ?? 0) > 0;
    });

    if (blocked.length) {
      list.push(
        { kind: 'label', id: 'blocked-label', text: 'Needs you' },
        {
          kind: 'note',
          id: 'blocked-note',
          icon: AlertTriangle,
          text: `${blocked.length} repair${blocked.length === 1 ? '' : 's'} cannot be confirmed automatically — either no bus has driven the road, only one bus serves it, or a camera saw the defect again. Open the order to sign it off or reopen it.`,
        },
      );
    }

    if (awaiting.length) {
      list.push(
        { kind: 'label', id: 'awaiting-label', text: 'Awaiting a bus pass' },
        {
          kind: 'cards',
          id: 'awaiting',
          items: awaiting.map((event) => {
            const route = routeForSegment(event.road_segment_id);
            const p = progressFor[event.event_id.replace(/-/g, '')];

            // The wait, made visible. "Awaiting next pass" with no end was
            // the thing this screen existed to stop showing.
            const details = [
              {
                icon: ScanLine,
                text: p
                  ? p.detail
                  : route
                    ? `Awaiting the next bus on route ${route}`
                    : 'Awaiting the next bus pass',
              },
            ];
            if (p && p.buses_seen.length > 0) {
              details.push({
                icon: Bus,
                text: `Seen by ${p.buses_seen.join(', ')}`,
              });
            }

            const chip = !p
              ? { label: 'Repair claimed', tone: 'warn' as const }
              : p.dirty_passes > 0
                ? { label: 'Still there', tone: 'bad' as const }
                : p.needs_manual
                  ? { label: 'Needs sign-off', tone: 'bad' as const }
                  : { label: `${p.clean_passes}/${p.passes_required} clean`, tone: 'warn' as const };

            return {
              id: event.event_id,
              title: classLabel(event.detection_class),
              sub: event.road_segment_id ?? 'On a road you closed',
              meta: timeAgo(event.last_seen),
              chips: [chip],
              // Progress toward the threshold, so the crew can see it move.
              progress: p ? Math.min(1, p.clean_passes / p.passes_required) : 0,
              progressLabel: p
                ? `${p.distinct_buses}/${p.buses_required} buses`
                : 'no passes yet',
              progressTone: p?.needs_manual || p?.dirty_passes ? ('bad' as const) : ('warn' as const),
              details,
              to: `/crew/order/${event.event_id}`,
            };
          }),
        },
        {
          kind: 'note',
          id: 'awaiting-note',
          icon: Check,
          text: `A repair is confirmed by the fleet, not by the crew that made it — the same corroboration a defect needs to appear. It closes itself after enough clean passes from enough different buses; one bus reporting clean could simply have a dirty lens.`,
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
  }, [events, error, verification]);

  return <BlockRenderer blocks={blocks} />;
}
