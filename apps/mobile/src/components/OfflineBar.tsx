/**
 * "You are not seeing live data."
 *
 * A phone loses signal in a lift, a basement, a depot yard. Continuing to show
 * the last known queue as though it were current is the failure this bar
 * exists to prevent: a crew that acts on a stale list is worse off than one
 * that knows to wait.
 *
 * It is a bar and not a toast because the condition persists — a toast that
 * dismisses itself would take the warning away while the problem is still
 * there. It sits under the top bar rather than over the content so nothing is
 * covered, and it animates its height so the layout settles rather than jumps.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, Loader2 } from 'lucide-react';
import { isOffline, useLive } from '../store/live';

export function OfflineBar() {
  const connection = useLive((s) => s.connection);
  const lastFrameAt = useLive((s) => s.lastFrameAt);
  const hydrated = useLive((s) => s.hydrated);

  const offline = isOffline({ connection, lastFrameAt, hydrated });
  // The first few hundred ms of every session are 'connecting'. Flashing a
  // warning during a normal startup teaches people to ignore it.
  const show = offline && hydrated;

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="z-20 flex-none overflow-hidden bg-amber/12"
          role="status"
        >
          <div className="flex items-center gap-2 px-4 py-2">
            {connection === 'connecting' ? (
              <Loader2 size={14} className="flex-none animate-spin text-amber" />
            ) : (
              <CloudOff size={14} className="flex-none text-amber" />
            )}
            <span className="text-[12px] font-medium leading-snug text-amber">
              {connection === 'connecting'
                ? 'Reconnecting — what you see may be out of date.'
                : 'Offline. Showing the last data this phone received.'}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
