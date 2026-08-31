/**
 * Pull down at the top of a list to reload.
 *
 * Implemented on touch events rather than a library because the interaction is
 * small and the constraint is specific: it must only engage when the scroll
 * container is already at the very top, or it fights the scroll. `scrollTop
 * <= 0` is checked on touchstart AND re-checked on the first move — a flick
 * that starts mid-list and reaches the top mid-gesture must not turn into a
 * refresh under the user's finger.
 *
 * Resistance is deliberate. The indicator moves at 45% of the finger, so the
 * gesture feels like it is pulling against something and the user gets a clear
 * sense of how far is far enough. A 1:1 follow reads as the page having come
 * loose.
 */

import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCcw } from 'lucide-react';
import { haptic } from '../lib/haptics';

/** How far the finger must travel before releasing triggers a refresh. */
const THRESHOLD_PX = 72;
const RESISTANCE = 0.45;
const MAX_PULL = 110;

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const ready = pull >= THRESHOLD_PX;

  function onTouchStart(event: React.TouchEvent) {
    if (refreshing) return;

    // Never inside the map. A map screen fills the canvas and does not scroll,
    // so `scrollTop` is 0 and every downward drag would look like a pull —
    // panning south would refresh the app instead of moving the map.
    if ((event.target as Element | null)?.closest?.('.maplibregl-map')) {
      armed.current = false;
      return;
    }

    // Only arm at the very top. Anywhere else this is an ordinary scroll.
    armed.current = (scroller.current?.scrollTop ?? 0) <= 0;
    startY.current = event.touches[0].clientY;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (!armed.current || startY.current === null || refreshing) return;

    const delta = event.touches[0].clientY - startY.current;
    if (delta <= 0) {
      // Scrolling up again — hand the gesture back rather than holding it.
      setPull(0);
      armed.current = false;
      return;
    }
    // Re-check: the container may have scrolled since touchstart.
    if ((scroller.current?.scrollTop ?? 0) > 0) {
      setPull(0);
      armed.current = false;
      return;
    }

    const next = Math.min(delta * RESISTANCE, MAX_PULL);
    if (next >= THRESHOLD_PX && pull < THRESHOLD_PX) haptic('tap');
    setPull(next);
  }

  async function onTouchEnd() {
    startY.current = null;
    if (!armed.current) return;
    armed.current = false;

    if (pull < THRESHOLD_PX) {
      setPull(0);
      return;
    }

    setRefreshing(true);
    setPull(THRESHOLD_PX);
    haptic('confirm');
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }

  return (
    <div
      ref={scroller}
      className="ut-canvas relative h-full overflow-y-auto overflow-x-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* The indicator sits in the gap the content is pushed down into, so
          nothing is ever covered by it. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
        style={{ height: pull }}
      >
        {pull > 8 ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card shadow-[0_1px_6px_rgba(0,0,0,0.12)]">
            {refreshing ? (
              <Loader2 size={15} className="animate-spin text-accent" />
            ) : (
              <RefreshCcw
                size={15}
                className={ready ? 'text-accent' : 'text-ink-faint'}
                style={{ transform: `rotate(${pull * 3}deg)` }}
              />
            )}
          </span>
        ) : null}
      </div>

      {/* h-full so a full-bleed child (any map screen) still has a definite
          height to resolve its own 100% against. Taller content overflows this
          box and the scroller above accounts for it, exactly as before. */}
      <motion.div
        className="h-full"
        animate={{ y: pull }}
        transition={
          // Follow the finger exactly while dragging; ease only on release.
          pull === 0 || refreshing
            ? { duration: 0.32, ease: [0.16, 1, 0.3, 1] }
            : { duration: 0 }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}
