/**
 * Swipe from the left edge to go back.
 *
 * Wraps a pushed screen — a work order, a sent report — not a tab. Tabs are
 * peers: swiping "back" from one to another has no meaning, and offering the
 * gesture there would make it unpredictable, which is worse than not having it.
 *
 * Edge-only, by design. A swipe that can start anywhere on screen collides
 * with horizontal scrollers (the evidence strip, the filter row) and with the
 * map's own pan. 24px matches the platform gesture zone closely enough that
 * muscle memory works.
 *
 * On iOS Safari the browser's own back-swipe already occupies that edge. This
 * does not fight it: whichever fires, the result is the same navigation, and
 * a user who triggers both gets one `navigate(-1)` because the second gesture
 * has nothing left to grab.
 */

import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { haptic } from '../lib/haptics';

const EDGE_PX = 24;
const COMMIT_PX = 90;
const RESISTANCE = 0.85;

export function SwipeBack({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  const armed = useRef(false);
  const [offset, setOffset] = useState(0);

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    armed.current = touch.clientX <= EDGE_PX;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (!armed.current || startX.current === null) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = Math.abs(touch.clientY - startY.current);

    // A mostly-vertical drag that happened to start at the edge is a scroll.
    // Deciding this once, early, stops the screen twitching sideways while
    // someone reads down a list.
    if (dy > Math.abs(dx) && dy > 12) {
      armed.current = false;
      setOffset(0);
      return;
    }
    if (dx < 0) return;
    setOffset(dx * RESISTANCE);
  }

  function onTouchEnd() {
    if (!armed.current) return;
    armed.current = false;
    startX.current = null;

    if (offset >= COMMIT_PX) {
      haptic('tap');
      navigate(-1);
      return;
    }
    setOffset(0);
  }

  return (
    <motion.div
      className="relative h-full"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      animate={{ x: offset }}
      transition={offset === 0 ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
    >
      {/* A hint that appears only once the gesture is under way — a permanent
          affordance on the edge of every screen would be visual noise. */}
      {offset > 6 ? (
        <span
          className="pointer-events-none absolute left-1 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card shadow-[0_1px_6px_rgba(0,0,0,0.15)]"
          style={{ opacity: Math.min(1, offset / COMMIT_PX) }}
        >
          <ChevronLeft size={18} className={offset >= COMMIT_PX ? 'text-accent' : 'text-ink-faint'} />
        </span>
      ) : null}
      {children}
    </motion.div>
  );
}
