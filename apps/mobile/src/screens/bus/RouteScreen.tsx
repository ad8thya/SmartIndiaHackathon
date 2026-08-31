/**
 * Today's route on the map, with the stops and what this bus contributed.
 *
 * The route polyline comes from the API's own route model, so the line on
 * screen is the line the simulator drives and the fusion engine snaps to —
 * not a redrawn approximation that would slowly diverge from it.
 */

import { useMemo, useState } from 'react';
import { Bus, Check, ChevronRight, Circle, MapPin } from 'lucide-react';
import { MapScreen } from '../../components/map/MapScreen';
import { BottomSheet } from '../../components/BottomSheet';
import type { MapLine, MapMarker } from '../../components/map/UTMap';
import { useMyBus } from '../../lib/useFleet';
import { useEvents } from '../../lib/useEvents';
import { classLabel, timeAgo } from '../../lib/display';

export function RouteScreen() {
  const { bus, route } = useMyBus();
  const { events } = useEvents();
  const [stopsOpen, setStopsOpen] = useState(false);

  /**
   * Which stops are behind and which are ahead.
   *
   * Derived from `progress` (0–1) across the stop list, which is an
   * approximation and is labelled as one in the sheet: the API gives an
   * ordered list of stop *names* and a fraction of the route completed, not
   * per-stop coordinates or arrival times. Rounding a fraction into a stop
   * index is the honest limit of what that data supports — and `next_stop`
   * from the telemetry is shown alongside it, because that one is real.
   */
  const passedCount = useMemo(
    () => (route && bus ? Math.floor(bus.progress * route.stops.length) : 0),
    [route, bus],
  );

  const lines: MapLine[] = useMemo(
    () =>
      route
        ? [
            {
              id: route.route_id,
              coordinates: route.polyline as [number, number][],
              color: route.color,
              width: 5,
            },
          ]
        : [],
    [route],
  );

  /**
   * What this bus found today, as a marker per defect on its own route.
   *
   * Attribution is by route rather than by bus id: an Event is fused from
   * several buses' observations and does not carry "which bus saw it first",
   * so claiming a specific bus found a specific defect would be inventing a
   * fact the data does not hold. "On your route today" is true.
   */
  const contributed = useMemo(
    () =>
      (events ?? []).filter(
        (event) => route !== null && event.road_segment_id?.includes(route.route_id),
      ),
    [events, route],
  );

  const markers: MapMarker[] = useMemo(() => {
    const pins: MapMarker[] = contributed.map((event) => ({
      id: event.event_id,
      lat: event.lat,
      lon: event.lon,
      color: '#D97706',
    }));
    if (bus) {
      pins.push({
        id: `bus-${bus.bus_id}`,
        lat: bus.lat,
        lon: bus.lon,
        color: '#2563EB',
        emphasis: true,
      });
    }
    return pins;
  }, [contributed, bus]);

  return (
    <div className="relative h-full">
      <MapScreen
      markers={markers}
      lines={lines}
      emptyHint="No route assigned to your bus right now."
      overlay={
        route ? (
          <div className="pointer-events-auto rounded-[12px] border border-line bg-card/95 px-3 py-2 shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur">
            <div className="text-[13px] font-medium leading-tight">{route.name}</div>
            <div className="mt-0.5 text-[11px] text-ink-soft">
              Route {route.route_id} · {route.stops.length} stops · {route.length_km.toFixed(1)} km
            </div>
            {bus ? (
              <>
                <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5 text-[11px] text-ink-soft">
                  <Bus size={12} className="text-accent" />
                  {Math.round(bus.progress * 100)}% complete
                  <span className="text-ink-faint">·</span>
                  {contributed.length} defect{contributed.length === 1 ? '' : 's'} found today
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500 ease-ut"
                    style={{ width: `${Math.round(bus.progress * 100)}%` }}
                  />
                </div>
                <button
                  onClick={() => setStopsOpen(true)}
                  className="ut-touch mt-1 flex w-full items-center justify-between text-[12px] font-medium text-accent"
                >
                  {route.stops.length} stops
                  <ChevronRight size={14} />
                </button>
              </>
            ) : null}
          </div>
        ) : null
      }
      renderDetail={(id) => {
        if (id.startsWith('bus-') && bus) {
          return (
            <div className="px-4 pb-5 pt-4">
              <h2 className="text-[18px] font-medium leading-tight">{bus.bus_id}</h2>
              <p className="mt-1 text-[13px] text-ink-soft">
                {Math.round(bus.speed_kmph)} km/h · {Math.round(bus.progress * 100)}% of the route ·
                reported {timeAgo(bus.ts)}
              </p>
            </div>
          );
        }
        const event = contributed.find((candidate) => candidate.event_id === id);
        if (!event) return null;
        return (
          <div className="px-4 pb-5 pt-4">
            <h2 className="text-[18px] font-medium leading-tight">
              {classLabel(event.detection_class)}
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <MapPin size={14} className="flex-none text-ink-faint" />
              <span className="text-[12px] text-ink-soft">
                {event.road_segment_id ?? 'On your route'} · {timeAgo(event.last_seen)}
              </span>
            </div>
            <p className="mt-3 rounded-[10px] bg-ink/[0.04] px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
              Found on your route by the fleet cameras. Nothing for you to do — it is already with
              the city.
            </p>
          </div>
        );
      }}
      />

      <BottomSheet open={stopsOpen} onClose={() => setStopsOpen(false)} title="Stops on this route">
        <div className="px-4 pb-6 pt-3">
          {route?.stops.map((stop, index) => {
            const passed = index < passedCount;
            const next = index === passedCount;
            return (
              <div key={`${stop}-${index}`} className="flex gap-3">
                <div className="flex flex-none flex-col items-center">
                  {passed ? (
                    <Check size={12} className="mt-1 text-emerald" />
                  ) : (
                    <Circle
                      size={10}
                      className={`mt-1.5 ${next ? 'fill-accent text-accent' : 'fill-line text-line'}`}
                    />
                  )}
                  {index < (route?.stops.length ?? 0) - 1 ? (
                    <span className={`w-px flex-1 ${passed ? 'bg-emerald/40' : 'bg-line'}`} />
                  ) : null}
                </div>
                <div className={index < (route?.stops.length ?? 0) - 1 ? 'pb-3.5' : ''}>
                  <div
                    className={`text-[14px] leading-tight ${
                      passed ? 'text-ink-faint' : next ? 'font-medium text-accent' : ''
                    }`}
                  >
                    {stop}
                  </div>
                  {next ? (
                    <div className="mt-0.5 text-[11px] text-ink-soft">
                      {bus?.next_stop ? `Telemetry says next stop is ${bus.next_stop}` : 'Coming up'}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
            Which stops are behind you is worked out from how far along the route you are, not from
            per-stop arrivals — the fleet feed does not carry those. “Next stop” above comes from
            your bus and is exact.
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}
