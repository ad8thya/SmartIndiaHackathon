/**
 * URBAN TWIN field app. Owned by M6.
 *
 * Mobile-first and genuinely responsive: it fills a real phone screen, and it
 * also renders inside the command centre's 390×844 PhoneFrame iframe. Same
 * code, same URL, no mobile/desktop fork — which is the only way it stays
 * working for seven days.
 *
 * On a wide screen it centres itself in a phone-width column rather than
 * stretching, because a 2000px-wide list of defects is nobody's field tool.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Feed } from './screens/Feed';
import { Detail } from './screens/Detail';
import { MapScreen } from './screens/MapScreen';
import { MyTasks } from './screens/MyTasks';
import { TabBar } from './components/TabBar';
import { useField } from './store';

const SCREENS = {
  feed: Feed,
  detail: Detail,
  map: MapScreen,
  tasks: MyTasks,
};

export default function App() {
  const screen = useField((s) => s.screen);
  const load = useField((s) => s.load);
  const toast = useField((s) => s.toast);

  useEffect(() => {
    void load();
    // a crew leaves the phone in a pocket; refresh rather than go stale
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const Screen = SCREENS[screen];

  return (
    <div className="flex h-full justify-center bg-ink-900">
      {/* max-w-md keeps it phone-shaped on a laptop without a separate layout */}
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden border-white/5 sm:border-x">
        <div className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, x: screen === 'detail' ? 24 : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: screen === 'detail' ? 24 : 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0"
            >
              <Screen />
            </motion.div>
          </AnimatePresence>
        </div>

        <TabBar />

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-ink-600 px-4 py-2 text-xs text-slate-200 shadow-xl"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
