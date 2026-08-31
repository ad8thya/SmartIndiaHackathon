/**
 * The permission boundary, made visible.
 *
 * When a role opens a route another role owns, this renders — in place, at
 * that URL. Deliberately **not** a redirect and **not** a blank screen:
 *
 *   · a redirect hides the boundary. The user lands on their home page and
 *     concludes the link was broken, which teaches them nothing and makes the
 *     rule impossible to demonstrate.
 *   · a blank screen or a bare 403 reads as a bug.
 *
 * So it names the role you are signed in as, says which role the page belongs
 * to, and lists what your role can actually do — every item a live link, so
 * the screen is a way forward rather than a wall.
 *
 * Enforcement note: this is a *UI* boundary on a prototype with no auth (see
 * store/session.ts). It shapes what the app offers, and it is honest about
 * that — it never says "access denied" or "unauthorised", because nothing was
 * authorised in the first place.
 */

import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Lock, RefreshCcw } from 'lucide-react';
import { MOBILE_ROLES, roleOwningPath, type MobileRole } from '../roles/catalog';

export function NotAvailableScreen({ role }: { role: MobileRole }) {
  const { pathname } = useLocation();
  const owner = roleOwningPath(pathname);

  return (
    <div className="ut-canvas h-full overflow-y-auto px-5 pb-8 pt-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-ink/[0.05] text-ink-muted">
          <Lock size={24} />
        </div>

        <h1 className="mt-4 text-[22px] font-medium leading-tight tracking-[-0.4px]">
          Not available for your role
        </h1>

        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          You are signed in as <span className="font-medium text-ink">{role.label}</span>.{' '}
          {owner ? (
            <>
              This page belongs to <span className="font-medium text-ink">{owner.label}</span>, so it
              is not part of your app.
            </>
          ) : (
            <>There is no page at this address in your app.</>
          )}
        </p>

        <p className="mt-2 font-mono text-[11px] text-ink-faint">{pathname}</p>

        <div className="mt-6 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-[11px] font-medium uppercase tracking-[1.1px] text-ink-muted">
            What you can do
          </span>
        </div>

        <ul className="mt-2.5 flex flex-col gap-2">
          {role.can.map((line, index) => (
            <li key={line} className="ut-card flex items-start gap-3 p-3.5">
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-medium ${role.tint.bg} ${role.tint.fg}`}
              >
                {index + 1}
              </span>
              <span className="text-[13px] leading-relaxed text-ink-soft">{line}</span>
            </li>
          ))}
        </ul>

        <Link
          to={role.prefix}
          className="ut-touch mt-6 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3.5 text-[15px] font-medium text-white shadow-[0_4px_14px_rgba(37,99,235,0.3)]"
        >
          Go to {role.label} home
          <ChevronRight size={17} />
        </Link>

        {/* The escape hatch. Without it this screen *is* a wall for anyone who
            signed in as the wrong role — which, in a demo, is everyone once. */}
        <Link
          to="/login"
          className="ut-touch mt-2.5 flex w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-card px-4 py-3.5 text-[14px] font-medium"
        >
          <RefreshCcw size={15} className="text-ink-muted" />
          Switch role
        </Link>

        {owner ? (
          <p className="mt-4 px-1 text-[12px] leading-relaxed text-ink-faint">
            {owner.label} is one of the four field roles in this app. Sign in as{' '}
            {MOBILE_ROLES[owner.id].label} to open it.
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
