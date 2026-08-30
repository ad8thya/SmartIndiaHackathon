/**
 * The side drawer. Owned by M6.
 *
 * Slides in from the right on desktop, up from the bottom on a phone — same
 * component, the breakpoint only changes how it docks. Escape closes it, and
 * the scrim is clickable, because a drawer you cannot dismiss is a trap during
 * a demo.
 */

import { type ReactNode, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { EASE, MOTION } from '../../lib/tokens';

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.fast, ease: EASE }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/40"
          />
          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: MOTION.slow, ease: EASE }}
            className="absolute bottom-0 right-0 top-0 z-50 flex w-full max-w-[420px] flex-col border-l border-white/10 bg-ink-800 shadow-2xl shadow-black/50"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm text-slate-100">{title}</h2>
                {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200"
              >
                <X size={15} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

            {footer && <div className="shrink-0 border-t border-white/5 p-3">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
