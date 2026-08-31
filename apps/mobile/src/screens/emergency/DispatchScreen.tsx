/**
 * The scene you are going to, on the map, with an ETA.
 *
 * The ETA is a straight-line estimate at an assumed average speed, and it says
 * so on screen. There is no routing engine on the phone — the one in this
 * project (`services/cloud/intelligence/whatif`) is off by default and is not
 * exposed as a point-to-point router — so the choice is an honest crude number
 * or a fabricated precise one. Anyone reading "8 min" believes it; anyone
 * reading "about 8 min, straight line" knows what they have.
 */

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Ambulance, Clock, CloudOff, Loader2, MapPin, Navigation, Ruler } from 'lucide-react';
import { MapScreen } from '../../components/map/MapScreen';
import type { MapLine, MapMarker } from '../../components/map/UTMap';
import { useLive } from '../../store/live';
import { useGeolocation } from '../../lib/useGeolocation';
import { distanceLabel, distanceM, timeAgo } from '../../lib/display';

/** Chennai city traffic, blue-light. Deliberately conservative. */
const ASSUMED_KMPH = 28;

export function DispatchScreen() {
  const incidents = useLive((s) => s.incidents);
  const responses = useLive((s) => s.responses);
  const hydrated = useLive((s) => s.hydrated);
  const loadError = useLive((s) => s.loadError);
  const { state: geo, locate } = useGeolocation();

  useEffect(() => {
    locate();
  }, [locate]);

  const from = geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : null;

  /** The incident this crew is currently driving to: the one they most
   *  recently acted on that is not closed. */
  const target = useMemo(() => {
    const open = Object.values(responses)
      .filter((response) => response.state !== 'CLOSED')
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
    if (!open) return null;
    return incidents.find((incident) => incident.incident_id === open.incident_id) ?? null;
  }, [responses, incidents]);

  const metres = target && from ? distanceM(from, target) : null;
  const etaMin = metres === null ? null : Math.max(1, Math.round(metres / 1000 / ASSUMED_KMPH * 60));

  const markers: MapMarker[] = useMemo(
    () =>
      target
        ? [{ id: target.incident_id, lat: target.lat, lon: target.lon, color: '#DC2626', emphasis: true }]
        : [],
    [target],
  );

  const lines: MapLine[] = useMemo(
    () =>
      target && from
        ? [
            {
              id: 'to-scene',
              // A straight line, drawn dashed, because that is what it is.
              coordinates: [
                [from.lon, from.lat],
                [target.lon, target.lat],
              ],
              color: '#DC2626',
              width: 3,
              dashed: true,
            },
          ]
        : [],
    [target, from],
  );

  if (!hydrated) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <Loader2 size={26} className="animate-spin text-ink-faint" />
        <p className="mt-3 text-[14px] text-ink-soft">Loading your active incident…</p>
      </div>
    );
  }

  if (loadError && !target) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-amber/15 text-amber">
          <CloudOff size={28} />
        </span>
        <h1 className="mt-4 text-[18px] font-medium">Cannot reach the control room</h1>
        <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-soft">
          Anything you accepted was sent. This screen fills in as soon as you have signal — use
          your radio in the meantime.
        </p>
      </div>
    );
  }

  if (!target) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-ink/[0.05] text-ink-muted">
          <Ambulance size={28} />
        </span>
        <h1 className="mt-4 text-[18px] font-medium">Nothing to respond to</h1>
        <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-soft">
          Accept an incident from Alerts and the route to the scene appears here.
        </p>
        <Link
          to="/emergency"
          className="ut-touch mt-5 flex items-center gap-1.5 rounded-[12px] bg-accent px-5 py-3 text-[15px] font-medium text-white"
        >
          Go to alerts
        </Link>
      </div>
    );
  }

  return (
    <MapScreen
      markers={markers}
      lines={lines}
      overlay={
        <div className="pointer-events-auto rounded-[12px] border border-line bg-card/95 px-3.5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.1)] backdrop-blur">
          <div className="text-[15px] font-medium leading-snug">{target.narrative}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-ink-faint" />
              {etaMin === null ? 'ETA needs your location' : `about ${etaMin} min`}
            </span>
            {metres !== null ? (
              <span className="flex items-center gap-1.5">
                <Ruler size={13} className="text-ink-faint" />
                {distanceLabel(metres)}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <MapPin size={13} className="text-ink-faint" />
              {target.road_segment_id ?? 'Scene'}
            </span>
          </div>
          <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-ink-faint">
            Straight-line distance at {ASSUMED_KMPH} km/h. Not a driving route — use the Navigate
            button for turn-by-turn.
          </p>
          <a
            href={`geo:${target.lat},${target.lon}?q=${target.lat},${target.lon}`}
            className="ut-touch mt-2.5 flex items-center justify-center gap-2 rounded-[10px] bg-danger px-4 py-2.5 text-[14px] font-medium text-white"
          >
            <Navigation size={15} /> Navigate to the scene
          </a>
        </div>
      }
      renderDetail={(id) => {
        if (id !== target.incident_id) return null;
        return (
          <div className="px-4 pb-5 pt-4">
            <h2 className="text-[18px] font-medium leading-snug">{target.narrative}</h2>
            <p className="mt-2 text-[13px] text-ink-soft">
              Reported {timeAgo(target.ts)} by {target.reported_by_bus}
            </p>
          </div>
        );
      }}
    />
  );
}
