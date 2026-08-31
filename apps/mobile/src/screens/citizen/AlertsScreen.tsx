/**
 * Notices for this person's area.
 *
 * There is no alerts service. Rather than inventing one, this derives notices
 * from data that is genuinely there — confirmed events on the public map, and
 * the status of this person's own reports — and says where each one came from.
 * A fabricated "Water supply disruption in Ward 173" would demo better and be
 * a lie about a capability that does not exist.
 *
 * **"Their ward" is proximity, and the screen says so.** Chennai has 200 wards
 * and this project does not have their boundaries, so scoping by ward id would
 * mean inventing one. What it does instead is scope to a radius around the
 * phone and label it as a radius. If the phone has no fix, the scope falls
 * back to everything and the header says "across the city" rather than
 * implying a local filter that is not running — a list quietly showing the
 * whole city under the word "nearby" is the failure worth avoiding here.
 */

import { useEffect, useMemo } from 'react';
import { Bell, MapPin, Navigation, WifiOff, Wrench } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { toPublicEvent, useEvents } from '../../lib/useEvents';
import { useMyReports } from '../../lib/useReports';
import { useGeolocation } from '../../lib/useGeolocation';
import { distanceLabel, distanceM } from '../../lib/display';
import {
  CATEGORY_LABEL,
  classLabel,
  isPublic,
  PUBLIC_STATUS_LABEL,
  REPORT_STATUS_LABEL,
  timeAgo,
} from '../../lib/display';

/** What counts as "near you". A walkable radius, not a ward boundary. */
const NEARBY_RADIUS_M = 2_000;

export function AlertsScreen() {
  const { events, error: eventsError } = useEvents({ publicOnly: true });
  const { reports, error: reportsError } = useMyReports();
  const { state: geo, locate } = useGeolocation();
  const offline = eventsError !== null && reportsError !== null;

  useEffect(() => {
    locate();
  }, [locate]);

  const here = geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : null;

  const blocks = useMemo<Block[]>(() => {
    if (events === null && reports === null) {
      return [{ kind: 'skeleton', id: 'loading', rows: 3 }];
    }

    // "Nothing to tell you" and "I cannot reach the city" are different facts,
    // and showing the first when the second is true is the stale-data lie this
    // app is not allowed to tell.
    if (offline) {
      return [
        {
          kind: 'empty',
          id: 'offline',
          icon: WifiOff,
          title: 'You are offline',
          sub: 'Alerts about your reports and about roads near you will appear as soon as you have signal.',
        },
      ];
    }

    const list: Block[] = [];

    // Anything that happened to a report this person filed is the most
    // relevant thing on the screen, so it goes first.
    const mine = (reports ?? []).filter((report) => report.status !== 'SUBMITTED');
    if (mine.length) {
      list.push(
        { kind: 'label', id: 'yours-label', text: 'Your reports' },
        {
          kind: 'cards',
          id: 'yours',
          items: mine.slice(0, 6).map((report) => ({
            id: report.report_id,
            title: `${CATEGORY_LABEL[report.category]} — ${REPORT_STATUS_LABEL[report.status].toLowerCase()}`,
            sub: report.address || 'Report you sent',
            meta: timeAgo(report.created_at),
            to: '/citizen/reports',
            chips: [{ label: 'Your report', tone: 'accent' }],
          })),
        },
      );
    }

    const all = (events ?? []).filter((event) => isPublic(event.status)).map(toPublicEvent);

    // Scoped only when there is a real fix to scope against. Without one the
    // list is city-wide and the banner below says exactly that.
    const nearby = here
      ? all.filter((event) => distanceM(here, event) <= NEARBY_RADIUS_M)
      : all;

    // Built here, prepended at the end. Pushing it now would make `list`
    // non-empty and quietly kill the empty state below — the banner is chrome
    // describing the scope, not a notice in its own right.
    const scopeBanner: Block = {
      kind: 'guide',
      id: 'scope',
      icon: here ? MapPin : Navigation,
      tone: here ? 'accent' : 'neutral',
      text: here
        ? `Showing problems and repairs within ${distanceLabel(NEARBY_RADIUS_M)} of you.`
        : 'Showing the whole city — turn on location to see only what is near you.',
    };

    // Repairs finishing are the good news, and the only thing on this screen
    // that a person is likely to actually want to be told.
    const fixed = nearby.filter(
      (event) =>
        event.status === 'REPAIR_COMPLETED' ||
        event.status === 'VERIFIED' ||
        event.status === 'RESOLVED',
    );
    const active = nearby.filter(
      (event) => event.status === 'AUTHORITY_NOTIFIED' || event.status === 'INSPECTION',
    );

    if (fixed.length) {
      list.push(
        { kind: 'label', id: 'fixed-label', text: 'Recently fixed near you' },
        {
          kind: 'cards',
          id: 'fixed',
          items: fixed.slice(0, 5).map((event) => ({
            id: event.event_id,
            title: `${classLabel(event.detection_class)} — ${(PUBLIC_STATUS_LABEL[event.status] ?? '').toLowerCase()}`,
            sub: event.road_segment_id ?? 'On a road near you',
            meta: timeAgo(event.last_seen),
            chips: [{ label: 'Repair', tone: 'good' }],
            details: [{ icon: Wrench, text: 'Confirmed by the city' }],
          })),
        },
      );
    }

    if (active.length) {
      list.push(
        { kind: 'label', id: 'active-label', text: 'Open problems near you' },
        {
          kind: 'cards',
          id: 'active',
          items: active.slice(0, 5).map((event) => ({
            id: event.event_id,
            title: classLabel(event.detection_class),
            sub: PUBLIC_STATUS_LABEL[event.status] ?? 'Being handled',
            meta: timeAgo(event.last_seen),
            chips: [{ label: 'Reported', tone: 'warn' }],
            details: [
              { icon: MapPin, text: event.road_segment_id ?? 'Nearby' },
            ],
            to: '/citizen/conditions',
          })),
        },
      );
    }

    if (list.length === 0) {
      return [
        {
          kind: 'empty',
          id: 'quiet',
          icon: Bell,
          title: here ? 'Nothing near you right now' : 'Nothing to tell you',
          sub: here
            ? `No confirmed problems or repairs within ${distanceLabel(NEARBY_RADIUS_M)}, and nothing new on your reports.`
            : 'Updates about your reports, and confirmed problems and repairs near you, appear here.',
          action: { label: 'See road conditions', to: '/citizen/conditions' },
        },
      ];
    }

    list.push({
      kind: 'note',
      id: 'provenance',
      icon: Bell,
      text: 'These notices are drawn from confirmed road conditions and from your own reports. Urban Twin does not send push notifications.',
    });

    return [scopeBanner, ...list];
  }, [events, reports, offline, here]);

  return <BlockRenderer blocks={blocks} />;
}
