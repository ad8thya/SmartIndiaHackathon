/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE INTEGRATION PAGE. Owned by M6.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Everything six people build meets here:
 *
 *   TopBar        KPI strip (M5's /api/analytics/summary)
 *   MapCanvas     the twin — buildings, routes, buses, events (M6)
 *   EventTicker   live feed off the websocket (M5 → M6)
 *   Sidebar       five panels, one per owner (M1–M4), each in an ErrorBoundary
 *   PhoneFrame    the field app, in a phone (M6)
 *
 * No panel fetches. No panel imports another panel. That is the whole design.
 */

import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { WifiOff, X } from 'lucide-react';

import { TopBar } from './components/TopBar';
import { MapCanvas } from './components/MapCanvas';
import { EventTicker } from './components/EventTicker';
import { Sidebar } from './components/Sidebar';
import { PhoneFrame } from './components/PhoneFrame';
import { EventDetail } from './components/EventDetail';
import { useStore } from './store/useStore';

export default function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const connect = useStore((s) => s.connect);
  const disconnect = useStore((s) => s.disconnect);
  const initRole = useStore((s) => s.initRole);
  const loading = useStore((s) => s.loading);
  const lastError = useStore((s) => s.lastError);

  useEffect(() => {
    // read once on mount, not a live route — switching roles is a full
    // reload by design (see BUILD.md), so this never needs to re-run
    initRole(new URLSearchParams(window.location.search).get('role'));
    void bootstrap();
    connect();
    return () => disconnect();
  }, [bootstrap, connect, disconnect, initRole]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ink-900 text-slate-200">
      <TopBar />

      <main className="flex min-h-0 flex-1">
        {/* live feed rail */}
        <div className="hidden w-56 shrink-0 border-r border-white/5 bg-ink-800 lg:block">
          <EventTicker />
        </div>

        {/* the twin */}
        <section className="relative min-w-0 flex-1">
          <MapCanvas />
          <EventDetail />
          <PhoneFrame />

          {loading && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-ink-900/70 backdrop-blur-sm">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400" />
                <p className="mt-3 text-xs text-slate-400">Loading the twin…</p>
              </div>
            </div>
          )}

          <AnimatePresence>{lastError && <ApiBanner message={lastError} />}</AnimatePresence>
        </section>

        <Sidebar />
      </main>
    </div>
  );
}

function ApiBanner({ message }: { message: string }) {
  return (
    <div className="absolute inset-x-0 top-3 z-30 mx-auto flex w-fit items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-950/80 px-3 py-2 text-xs text-amber-200 backdrop-blur">
      <WifiOff size={14} />
      <span>
        API unreachable — <span className="font-mono text-[11px] opacity-80">{message}</span>
      </span>
      <span className="text-[10px] opacity-70">is the api running? try `make dev`</span>
      <button
        type="button"
        onClick={() => useStore.setState({ lastError: null })}
        className="text-amber-400 hover:text-amber-200"
      >
        <X size={13} />
      </button>
    </div>
  );
}
