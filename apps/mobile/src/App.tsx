/**
 * T1 scaffold. This screen exists to prove the wiring — build, tokens, safe
 * areas, generated contract types, and a live call to the real API — and is
 * replaced by the login screen in T2 and the role shells in T4.
 *
 * The chrome shape it sits in (fixed top bar + independently scrolling canvas)
 * is the design's, and does survive: every screen in T4 mounts inside it.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { api, API_BASE } from './lib/api';
import { ROUTE_COUNT, SCHOOL_ZONE_COUNT } from './lib/cityRef';
import type { HealthStatus } from './lib/types';

type Probe = { state: 'loading' } | { state: 'ok'; health: HealthStatus } | { state: 'fail'; why: string };

function useApiProbe(): Probe {
  const [probe, setProbe] = useState<Probe>({ state: 'loading' });

  useEffect(() => {
    let live = true;
    api
      .health()
      .then((health) => live && setProbe({ state: 'ok', health }))
      .catch((error: unknown) =>
        live ? setProbe({ state: 'fail', why: error instanceof Error ? error.message : 'unreachable' }) : undefined,
      );
    return () => {
      live = false;
    };
  }, []);

  return probe;
}

function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span
        className={
          ok === null
            ? 'text-ink-faint'
            : ok
              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-emerald/10 text-emerald'
              : 'flex h-6 w-6 items-center justify-center rounded-full bg-danger/10 text-danger'
        }
      >
        {ok === null ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} /> : <X size={14} />}
      </span>
      <span className="flex-1 text-[14px] font-medium">{label}</span>
      <span className="text-right font-mono text-[11px] text-ink-muted">{detail}</span>
    </div>
  );
}

export function App() {
  const probe = useApiProbe();

  return (
    <div className="flex h-full flex-col">
      {/* fixed top bar — the design's frosted header */}
      <header className="ut-safe-top ut-nosel sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 pb-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-accent text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)]">
            U
          </div>
          <div>
            <div className="text-[13px] font-bold tracking-[1.4px]">URBAN TWIN</div>
            <div className="text-[11px] font-semibold text-accent">Mobile · scaffold</div>
          </div>
        </div>
      </header>

      {/* scroll canvas */}
      <main className="ut-canvas ut-safe-bottom flex-1 overflow-y-auto px-4 pt-4">
        <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.4px]">T1 · scaffold</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Nothing here is the product. This screen checks that the build, the design tokens, the
          generated contract types and the API connection are all real before T2 starts.
        </p>

        <section className="ut-card mt-4 animate-utrise overflow-hidden">
          <Row
            ok={probe.state === 'loading' ? null : probe.state === 'ok'}
            label="API reachable"
            detail={
              probe.state === 'loading'
                ? 'checking…'
                : probe.state === 'ok'
                  ? `v${probe.health.version} · db ${probe.health.database ? 'up' : 'down'}`
                  : probe.why.slice(0, 28)
            }
          />
          <Row ok label="Contract types generated" detail={`${ROUTE_COUNT} routes`} />
          <Row ok label="City reference generated" detail={`${SCHOOL_ZONE_COUNT} school zones`} />
        </section>

        <p className="mt-3 px-1 font-mono text-[11px] leading-relaxed text-ink-faint">
          API_BASE {API_BASE}
        </p>

        <div className="ut-action-card mt-4 p-4">
          <div className="text-[13px] font-semibold">Safe areas</div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            The bar above clears the notch and this canvas clears the home indicator. On a desktop
            browser both insets are 0 and the layout is unchanged — open it on a phone to see them
            do anything.
          </p>
        </div>

        <div className="h-6" />
      </main>
    </div>
  );
}
