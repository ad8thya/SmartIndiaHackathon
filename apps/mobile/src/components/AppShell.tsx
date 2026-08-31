/**
 * The frame every signed-in screen mounts inside: a fixed top bar, one
 * independently scrolling canvas, and the role's tab bar pinned to the bottom.
 *
 * The shape is the design's. What matters about it on a real phone is that
 * only the middle scrolls — if the whole document scrolled, the top bar would
 * slide under the notch and the tab bar would drift off the bottom, which is
 * the single clearest tell that a "mobile app" is a shrunk web page.
 *
 * The screen title comes from the route, not from each screen, so a screen is
 * a body and nothing else.
 */

import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, LogOut, RefreshCcw, Wifi } from 'lucide-react';
import { MOBILE_ROLES } from '../roles/catalog';
import { useSession } from '../store/session';
import { BottomSheet } from './BottomSheet';
import { haptic } from '../lib/haptics';

const EASE = [0.16, 1, 0.3, 1] as const;

export function AppShell() {
  const session = useSession((s) => s.session)!;
  const signOut = useSession((s) => s.signOut);
  const role = MOBILE_ROLES[session.role];
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Longest matching tab wins, so /citizen/report does not resolve to the
  // /citizen home tab just because the prefix matches.
  const activeTab = [...role.tabs]
    .sort((a, b) => b.to.length - a.to.length)
    .find((tab) => location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`));

  function switchRole() {
    haptic('tap');
    setSheetOpen(false);
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <header className="ut-safe-top ut-nosel z-20 flex-none border-b border-line bg-canvas/85 px-3 pb-2.5 backdrop-blur-[16px]">
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[1px] text-accent">
                {role.label}
              </span>
              <span className="h-[3px] w-[3px] rounded-full bg-ink-faint" />
              <span className="truncate text-[10px] text-ink-soft">{session.displayName}</span>
            </div>
            <div className="truncate text-[16px] font-medium leading-tight">
              {activeTab?.label ?? 'Urban Twin'}
            </div>
          </div>

          {role.id === 'citizen' ? (
            <NavLink
              to="/citizen/alerts"
              aria-label="Alerts"
              className="ut-touch flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-line bg-card"
            >
              <Bell size={17} className="text-ink-soft" />
            </NavLink>
          ) : null}

          {/* The role chip. Initials on a tinted square, straight from the
              design — and the only way into the account sheet. */}
          <button
            onClick={() => {
              haptic('tap');
              setSheetOpen(true);
            }}
            aria-label={`Signed in as ${role.label}. Open account options`}
            className={`ut-touch flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-line text-[11px] font-medium shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${role.tint.bg} ${role.tint.fg}`}
          >
            {role.initials}
          </button>
        </div>
      </header>

      {/* One scroll container for the whole app. Keyed on the path so each
          screen enters rather than swapping in place. */}
      <main className="ut-canvas relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="min-h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="ut-safe-bottom ut-nosel z-20 flex flex-none items-stretch justify-around border-t border-line bg-canvas/90 px-2 pt-1.5 backdrop-blur-[16px]">
        {role.tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab === activeTab;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === role.prefix}
              onClick={() => haptic('tap')}
              className={`ut-touch flex flex-1 flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-1 transition-colors ${
                active ? 'text-accent' : 'text-ink-faint'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span className="whitespace-nowrap text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Your session">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-12 w-12 flex-none items-center justify-center rounded-[14px] text-[15px] font-medium ${role.tint.bg} ${role.tint.fg}`}
            >
              {role.initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[16px] font-medium">{session.displayName}</div>
              <div className="text-[12px] text-ink-soft">{role.label}</div>
            </div>
          </div>

          <div className="ut-card mt-4 flex items-start gap-2.5 p-3.5">
            <Wifi size={15} className="mt-0.5 flex-none text-ink-faint" />
            <p className="text-[12px] leading-relaxed text-ink-soft">
              Signed in on this device only. This prototype has no account system — the role above
              is a local setting, not a verified identity.
            </p>
          </div>

          <button
            onClick={switchRole}
            className="ut-touch mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3.5 text-[15px] font-medium text-white"
          >
            <RefreshCcw size={16} />
            Switch role
          </button>

          <button
            onClick={switchRole}
            className="ut-touch mt-2.5 flex w-full items-center justify-center gap-2 rounded-[14px] border border-line px-4 py-3.5 text-[14px] font-medium text-ink-soft"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
