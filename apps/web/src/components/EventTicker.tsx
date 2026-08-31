/** Live feed of what the fleet just noticed. Owned by M6. */

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Radar } from 'lucide-react';
import { useStore } from '../store/useStore';
import { timeAgo } from '../lib/format';

const ICONS = {
  event: <Radar size={13} className="text-sky-400" />,
  incident: <AlertTriangle size={13} className="text-red-400" />,
  status: <ArrowRight size={13} className="text-amber-400" />,
};

export function EventTicker() {
  const ticker = useStore((s) => s.ticker);
  const selectEvent = useStore((s) => s.selectEvent);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="text-[10px] font-medium tracking-widest text-slate-500">
          Live feed
        </span>
        <span className="font-mono text-[10px] text-slate-600">{ticker.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ticker.length === 0 && (
          <p className="px-3 py-4 text-xs leading-relaxed text-slate-500">
            Waiting for the fleet. Start the simulator with{' '}
            <code className="rounded bg-ink-900 px-1 py-0.5 font-mono text-[10px]">make dev</code>{' '}
            and detections will appear here as buses drive past them.
          </p>
        )}

        <AnimatePresence initial={false}>
          {ticker.map((entry) => (
            <motion.button
              key={entry.id}
              type="button"
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => entry.eventId && selectEvent(entry.eventId)}
              className="flex w-full items-start gap-2 border-b border-white/5 px-3 py-2 text-left hover:bg-white/[0.03]"
            >
              <span className="mt-0.5">{ICONS[entry.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] leading-snug text-slate-300">
                  {entry.text}
                </span>
                <span className="text-[10px] text-slate-600">{timeAgo(entry.at)}</span>
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
