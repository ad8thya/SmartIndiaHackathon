/**
 * The queue as pins. Same orders as the list screen, sorted spatially instead
 * of by SLA — this is the "what is near me on the way home" view, and the list
 * is the "what breaches first" view. Both read the same filter, so they can
 * never show different work.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clock, MapPin } from 'lucide-react';
import { MapScreen } from '../../components/map/MapScreen';
import type { MapMarker } from '../../components/map/UTMap';
import { useEvents } from '../../lib/useEvents';
import { isQueued, MY_TEAM, slaFor } from '../../lib/crew';
import { classLabel, SEVERITY_HEX, severityChipClass, timeAgo } from '../../lib/display';

export function CrewMapScreen() {
  const { events } = useEvents();

  const queue = useMemo(
    () =>
      (events ?? [])
        .filter(isQueued)
        .filter((event) => event.assigned_team === null || event.assigned_team === MY_TEAM),
    [events],
  );

  // Coloured by severity, not by workflow status: on this screen a crew is
  // deciding what to drive to, and "how bad is it" is the question. The list
  // screen carries the status.
  const markers: MapMarker[] = useMemo(
    () =>
      queue.map((event) => ({
        id: event.event_id,
        lat: event.lat,
        lon: event.lon,
        color: SEVERITY_HEX[event.severity],
        emphasis: slaFor(event).overdue,
      })),
    [queue],
  );

  return (
    <MapScreen
      markers={markers}
      emptyHint={`Nothing assigned to ${MY_TEAM} right now. Orders appear here as the console assigns them.`}
      overlay={
        <div className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full border border-line bg-card/95 px-3 py-1.5 text-[11px] font-medium shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_HEX.LARGE }} />
            large
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_HEX.MEDIUM }} />
            medium
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_HEX.SMALL }} />
            small
          </span>
        </div>
      }
      renderDetail={(id) => {
        const event = queue.find((candidate) => candidate.event_id === id);
        if (!event) return null;
        const sla = slaFor(event);
        return (
          <div className="px-4 pb-5 pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${severityChipClass(event.severity)}`}>
                {event.severity.toLowerCase()}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  sla.overdue ? 'bg-danger/10 text-danger' : 'bg-ink/[0.06] text-ink-muted'
                }`}
              >
                {sla.label}
              </span>
            </div>

            <h2 className="mt-2 text-[18px] font-medium leading-tight">
              {classLabel(event.detection_class)}
            </h2>

            <div className="mt-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="flex-none text-ink-faint" />
                <span className="text-[12px] text-ink-soft">
                  {event.road_segment_id ?? `${event.lat.toFixed(5)}, ${event.lon.toFixed(5)}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="flex-none text-ink-faint" />
                <span className="text-[12px] text-ink-soft">Last seen {timeAgo(event.last_seen)}</span>
              </div>
            </div>

            <Link
              to={`/crew/order/${event.event_id}`}
              className="ut-touch mt-4 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-accent px-4 py-3.5 text-[15px] font-medium text-white"
            >
              Open work order
              <ChevronRight size={16} />
            </Link>
          </div>
        );
      }}
    />
  );
}
