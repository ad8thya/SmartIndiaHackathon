/**
 * The shape every map screen shares: a full-bleed map, a floating recentre
 * button in thumb reach, and a bottom sheet for whatever the user tapped.
 *
 * Each role's map screen supplies the markers, the lines and what a tap should
 * show. None of them re-implements the map, the geolocation states, or the
 * sheet — those are the parts that are fiddly to get right on a phone and
 * pointless to get right four times.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, Loader2, MapPinOff } from 'lucide-react';
import { LazyMap } from './LazyMap';
import type { MapLine, MapMarker } from './UTMap';
import { BottomSheet } from '../BottomSheet';
import { useGeolocation } from '../../lib/useGeolocation';
import { haptic } from '../../lib/haptics';

export function MapScreen({
  markers,
  lines = [],
  renderDetail,
  overlay,
  emptyHint,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  /** What the sheet shows for a tapped marker. Return null to not open one. */
  renderDetail?: (id: string) => ReactNode;
  /** Anything pinned over the map — a legend, a filter row, a privacy note. */
  overlay?: ReactNode;
  /** Shown as a small card when there is nothing to draw. */
  emptyHint?: string;
}) {
  const { state, locate } = useGeolocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [recentreAt, setRecentreAt] = useState<{ lat: number; lon: number } | null>(null);

  const user = state.status === 'ok' ? { lat: state.lat, lon: state.lon } : null;

  const detail = useMemo(
    () => (selected && renderDetail ? renderDetail(selected) : null),
    [selected, renderDetail],
  );

  function recentre() {
    haptic('tap');
    if (state.status === 'ok') {
      // Already have a fix — move now, and refresh it in the background so a
      // second tap is current. Waiting for a new fix first makes the button
      // feel broken for the 3–8 seconds a GPS takes.
      setRecentreAt({ lat: state.lat, lon: state.lon });
    }
    locate();
  }

  // A new fix arriving after a tap should move the camera; one arriving on its
  // own should not yank the map out from under someone reading it.
  const pendingRecentre = state.status === 'ok' ? { lat: state.lat, lon: state.lon } : null;
  const center = recentreAt ?? (state.status === 'ok' ? pendingRecentre : null);

  return (
    <div className="relative h-full w-full">
      <LazyMap
        markers={markers}
        lines={lines}
        user={user}
        center={center}
        onSelectMarker={(id) => {
          haptic('tap');
          setSelected(id);
        }}
      />

      {overlay ? <div className="pointer-events-none absolute inset-x-0 top-0 p-3">{overlay}</div> : null}

      {markers.length === 0 && emptyHint ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute inset-x-3 bottom-20 rounded-[12px] border border-line bg-card/95 px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur"
        >
          {emptyHint}
        </motion.div>
      ) : null}

      {/* Bottom-right and above the tab bar: the corner a right thumb reaches
          without shifting grip. */}
      <button
        onClick={recentre}
        aria-label="Recentre on my location"
        className="ut-touch absolute bottom-4 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card shadow-[0_2px_10px_rgba(0,0,0,0.12)]"
      >
        {state.status === 'locating' ? (
          <Loader2 size={18} className="animate-spin text-accent" />
        ) : state.status === 'denied' || state.status === 'unavailable' ? (
          <MapPinOff size={18} className="text-ink-faint" />
        ) : (
          <Crosshair size={18} className={state.status === 'ok' ? 'text-accent' : 'text-ink-soft'} />
        )}
      </button>

      {/* Location failures are ordinary, so they get a quiet line rather than
          an alert — but they are never silent. A map that just does not move
          when you press the button is worse than one that says why. */}
      {state.status === 'denied' || state.status === 'unavailable' ? (
        <div className="absolute bottom-4 left-3 right-16 rounded-[10px] border border-line bg-card/95 px-3 py-2 text-[11px] leading-snug text-ink-soft backdrop-blur">
          {state.status === 'denied'
            ? 'Location is blocked for this site. The map still works — you can pan to where you are.'
            : state.why}
        </div>
      ) : null}

      <BottomSheet open={detail !== null} onClose={() => setSelected(null)}>
        {detail}
      </BottomSheet>
    </div>
  );
}
