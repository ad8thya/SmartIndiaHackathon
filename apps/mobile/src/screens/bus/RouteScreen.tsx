/**
 * Today's route on the map, with the stops and what this bus contributed.
 *
 * The route polyline comes from the API's own route model, so the line on
 * screen is the line the simulator drives and the fusion engine snaps to —
 * not a redrawn approximation that would slowly diverge from it.
 */

import { useMemo } from 'react';
import { Bus, MapPin } from 'lucide-react';
import { MapScreen } from '../../components/map/MapScreen';
import type { MapLine, MapMarker } from '../../components/map/UTMap';
import { useMyBus } from '../../lib/useFleet';
import { useEvents } from '../../lib/useEvents';
import { classLabel, timeAgo } from '../../lib/display';

export function RouteScreen() {
  const { bus, route } = useMyBus();
  const { events } = useEvents();

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
              <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5 text-[11px] text-ink-soft">
                <Bus size={12} className="text-accent" />
                {Math.round(bus.progress * 100)}% complete
                <span className="text-ink-faint">·</span>
                {contributed.length} defect{contributed.length === 1 ? '' : 's'} on this route
              </div>
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
  );
}
