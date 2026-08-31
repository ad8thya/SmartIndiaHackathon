/**
 * The app's one overlay primitive. There are no modals in this app — a
 * centred dialog with a close button in its corner is a desktop shape, and on
 * a phone the corner is the hardest place on the screen to reach. A sheet
 * rises from the bottom, where the thumb already is, and closes by dragging
 * down, which needs no target at all.
 *
 * Drag-to-dismiss is real drag, not a tap on a handle: `dragElastic` lets it
 * rubber-band at the top so a pull that will not dismiss still feels
 * connected, and the dismiss test uses velocity as well as distance so a
 * quick flick closes it without travelling the full height.
 */

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  // The canvas behind must not scroll while a sheet is up, or dragging the
  // sheet drags the page and both move.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape is for the desktop demo frame, where there is a keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-ink/50 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="ut-safe-bottom absolute inset-x-0 bottom-0 z-40 flex max-h-[86%] flex-col rounded-t-[20px] bg-card shadow-[0_-6px_30px_rgba(0,0,0,0.22)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: EASE }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.02, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 620) onClose();
            }}
          >
            {/* The grab handle is the affordance, not the control — the whole
                sheet drags, so this only has to say that it can. */}
            <div className="ut-nosel flex flex-none justify-center pb-1 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-line" />
            </div>

            {title ? (
              <div className="flex-none border-b border-line px-4 pb-3 pt-1 text-[16px] font-medium">
                {title}
              </div>
            ) : null}

            <div className="ut-canvas min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
