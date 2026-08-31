/**
 * The mobile app, shown as a phone. Owned by M6.
 *
 * A fixed 390×844 iPhone-shaped frame containing an iframe pointed at the
 * *actual* mobile app. Not a screenshot and not a re-implementation: the same
 * URL opens on a real phone, and both stay in sync because there is one app.
 *
 * It points at apps/mobile now, not this app's old `/field` route. That route
 * still exists and still works — it is a phone-shaped view of the console for
 * anyone who wants it — but the thing a demo should show beside the console is
 * the app a citizen or a crew actually installs.
 */

import { ExternalLink, RotateCw, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';

/**
 * Where apps/mobile lives, from this page's point of view.
 *
 *   · dev — a separate vite server on :5176. `hostname`, not `localhost`, so
 *     the "open on a real phone" link works when the console is being viewed
 *     from another machine on the LAN.
 *   · demo / production — one origin, one port; FastAPI serves the mobile
 *     build at /m (see services/cloud/api/spa.py's mount_mobile).
 *
 * Getting this wrong is silent: the iframe renders a blank white rectangle and
 * nothing in the console says why.
 */
export const MOBILE_APP_URL: string =
  (import.meta.env.VITE_MOBILE_APP_URL as string | undefined) ??
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:5176`
    : `${window.location.origin}/m`);

export function PhoneFrame() {
  const showPhone = useStore((s) => s.showPhone);
  const togglePhone = useStore((s) => s.togglePhone);
  const [reloadKey, setReloadKey] = useState(0);

  if (!showPhone) return null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="absolute bottom-6 right-6 z-40 flex flex-col items-center"
    >
      <div className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-800/95 px-2.5 py-1.5 backdrop-blur">
        <span className="flex items-center gap-1.5 text-[10px] tracking-wider text-slate-400">
          <Smartphone size={12} /> Mobile app
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            title="Reload"
            onClick={() => setReloadKey((n) => n + 1)}
            className="rounded p-1 text-slate-500 hover:text-slate-200"
          >
            <RotateCw size={13} />
          </button>
          <a
            href={MOBILE_APP_URL}
            target="_blank"
            rel="noreferrer"
            title="Open on a real phone — same URL"
            className="rounded p-1 text-slate-500 hover:text-slate-200"
          >
            <ExternalLink size={13} />
          </a>
          <button
            type="button"
            title="Close"
            onClick={togglePhone}
            className="rounded p-1 text-slate-500 hover:text-slate-200"
          >
            <X size={13} />
          </button>
        </span>
      </div>

      {/* 390×844 — iPhone 14 logical resolution, scaled to fit a laptop */}
      <div
        className="relative rounded-[44px] border-[10px] border-ink-600 bg-black shadow-2xl shadow-black/60"
        style={{ width: 390 * 0.78 + 20, height: 844 * 0.78 + 20 }}
      >
        {/* the notch */}
        <div className="absolute left-1/2 top-[10px] z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-black" />
        <div
          className="overflow-hidden rounded-[34px]"
          style={{ width: 390 * 0.78, height: 844 * 0.78 }}
        >
          <iframe
            key={reloadKey}
            title="URBAN TWIN mobile app"
            src={MOBILE_APP_URL}
            className="origin-top-left border-0"
            style={{ width: 390, height: 844, transform: 'scale(0.78)' }}
          />
        </div>
      </div>

      <p className="mt-2 max-w-[320px] text-center text-[10px] leading-relaxed text-slate-500">
        Live iframe of the real mobile app at{' '}
        <span className="font-mono text-slate-400">{MOBILE_APP_URL}</span> — open that URL on a
        phone and you get the same thing, installable.
      </p>
    </motion.aside>
  );
}
