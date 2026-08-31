/**
 * The public map. This is the privacy story, and it has to be visibly true.
 *
 * Three things are enforced rather than asserted:
 *
 *   1. **Only public statuses.** The request asks for AUTHORITY_NOTIFIED
 *      through RESOLVED and nothing else, so DETECTED and AI_VERIFIED — one
 *      camera's unreviewed guess — are never on this screen. Neither is
 *      REJECTED: publishing the ones the city looked at and disagreed with
 *      would be worse than not publishing at all.
 *   2. **No operator internals.** Events are mapped through `toPublicEvent`
 *      before they reach any component here, which *removes* confidence,
 *      observation and bus counts, assigned team, SLA and evidence URIs
 *      rather than hiding them. There is no prop to turn back on.
 *   3. **Plain language.** "MAINTENANCE_ASSIGNED" is an operator's word.
 *      A citizen reads "repair scheduled".
 *
 * The note at the bottom of the sheet says all of this to the user, because a
 * privacy property nobody can see is indistinguishable from one that is not
 * there.
 */

import { useMemo } from 'react';
import { Info, MapPin } from 'lucide-react';
import { MapScreen } from '../../components/map/MapScreen';
import type { MapMarker } from '../../components/map/UTMap';
import { toPublicEvent, useEvents } from '../../lib/useEvents';
import {
  classLabel,
  isPublic,
  PUBLIC_STATUS_LABEL,
  statusChipClass,
  STATUS_HEX,
  timeAgo,
} from '../../lib/display';

export function RoadConditionsScreen() {
  const { events } = useEvents({ publicOnly: true });

  const publicEvents = useMemo(
    () =>
      (events ?? [])
        // Belt and braces: the request already filtered, but a server that
        // starts returning more must not quietly widen what a citizen sees.
        .filter((event) => isPublic(event.status))
        .map(toPublicEvent),
    [events],
  );

  const markers: MapMarker[] = useMemo(
    () =>
      publicEvents.map((event) => ({
        id: event.event_id,
        lat: event.lat,
        lon: event.lon,
        color: STATUS_HEX[event.status],
        emphasis: event.severity === 'LARGE',
      })),
    [publicEvents],
  );

  return (
    <div className="h-full">
      <MapScreen
        markers={markers}
        emptyHint="Nothing confirmed near here yet. Only problems the city has been told about appear on this map."
        overlay={
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-line bg-card/95 px-3 py-1.5 text-[11px] font-medium shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
            {publicEvents.length} confirmed nearby
          </div>
        }
        renderDetail={(id) => {
          const event = publicEvents.find((candidate) => candidate.event_id === id);
          if (!event) return null;
          return (
            <div className="px-4 pb-5 pt-4">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-3 w-3 flex-none rounded-full"
                  style={{ backgroundColor: STATUS_HEX[event.status] }}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] font-medium leading-tight">
                    {classLabel(event.detection_class)}
                  </h2>
                  <span
                    className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${statusChipClass(event.status)}`}
                  >
                    {PUBLIC_STATUS_LABEL[event.status] ?? 'Being handled'}
                  </span>
                </div>
              </div>

              <div className="ut-card mt-4 flex items-start gap-2.5 p-3.5">
                <MapPin size={15} className="mt-0.5 flex-none text-ink-faint" />
                <div className="text-[12px] leading-relaxed text-ink-soft">
                  {event.road_segment_id ? <div>{event.road_segment_id}</div> : null}
                  <div className="font-mono text-[11px] text-ink-faint">
                    {event.lat.toFixed(5)}, {event.lon.toFixed(5)}
                  </div>
                  <div className="mt-1">Last seen {timeAgo(event.last_seen)}</div>
                </div>
              </div>

              {/* The privacy promise, said out loud. */}
              <div className="mt-3 flex items-start gap-2.5 rounded-[12px] border border-line bg-card px-3.5 py-3">
                <Info size={15} className="mt-0.5 flex-none text-ink-faint" />
                <p className="text-[12px] leading-relaxed text-ink-soft">
                  This map shows only problems the city has been told about. Detection confidence,
                  which bus reported it and the internal case status are not shown here.
                </p>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
