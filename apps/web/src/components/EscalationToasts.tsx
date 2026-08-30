/**
 * The consensus escalation announcement. Owned by M6.
 *
 * This is the project's central claim made visible: one bus seeing a pothole
 * is a guess, three buses seeing it is evidence. When an event climbs the
 * fusion ladder the pin pulses on the map (see MapCanvas) and this says out
 * loud what just happened and why.
 *
 * It names the **corroboration count**, not a bus id. `Event` carries
 * `distinct_bus_count` and nothing else about provenance — the WebSocket
 * payload is a plain `Event` — so a specific registration number here would
 * be invented. The count is the number that matters anyway: it is the one
 * the escalation threshold is defined on.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';

import { useStore } from '../store/useStore';
import { CLASS_LABEL } from '../lib/colors';
import { EASE, MOTION, STATUS_HEX, STATUS_LABEL } from '../lib/tokens';

/** how long a toast stays before it retires itself */
const DWELL_MS = 7000;

export function EscalationToasts() {
  const escalations = useStore((s) => s.escalations);
  const dismiss = useStore((s) => s.dismissEscalation);
  const selectEvent = useStore((s) => s.selectEvent);

  // newest three; more than that and they stack over the map
  const shown = escalations.slice(0, 3);

  useEffect(() => {
    if (shown.length === 0) return;
    const timers = shown.map((item) =>
      setTimeout(() => dismiss(item.eventId), Math.max(0, item.at + DWELL_MS - Date.now())),
    );
    return () => timers.forEach(clearTimeout);
  }, [shown, dismiss]);

  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-40 flex w-[320px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {shown.map((item) => {
          const toColor = STATUS_HEX[item.to];
          const fromColor = STATUS_HEX[item.from];
          const confirmed = item.to === 'AUTHORITY_NOTIFIED';
          return (
            <motion.div
              key={`${item.eventId}-${item.to}`}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: MOTION.base, ease: EASE }}
              className="pointer-events-auto overflow-hidden rounded-lg border bg-ink-800/95 shadow-xl shadow-black/40 backdrop-blur"
              style={{ borderColor: `${toColor}55` }}
            >
              <button
                type="button"
                onClick={() => selectEvent(item.eventId)}
                className="w-full px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  {/* the ladder climb, literally: old colour → new colour */}
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: fromColor }}
                  />
                  <ArrowRight size={11} className="shrink-0 text-slate-600" />
                  <motion.span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: toColor }}
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: MOTION.escalate, repeat: 2, ease: EASE }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-100">
                    {CLASS_LABEL[item.detectionClass]} {confirmed ? 'confirmed' : 'corroborated'}
                  </span>
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      dismiss(item.eventId);
                    }}
                    className="shrink-0 rounded p-0.5 text-slate-600 hover:text-slate-300"
                  >
                    <X size={12} />
                  </span>
                </div>

                <p className="mt-1 pl-[26px] text-[11px] leading-relaxed text-slate-400">
                  Seen by{' '}
                  <span className="text-slate-200">
                    {item.busCount} separate bus{item.busCount === 1 ? '' : 'es'}
                  </span>
                  {item.roadSegmentId && (
                    <>
                      {' '}
                      on <span className="font-mono text-[10px]">{item.roadSegmentId}</span>
                    </>
                  )}
                  {' · '}
                  {STATUS_LABEL[item.from].toLowerCase()} → {STATUS_LABEL[item.to].toLowerCase()}
                </p>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
