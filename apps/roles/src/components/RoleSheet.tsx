/**
 * "Switch role" — a bottom sheet on phone width, a centred dialog on desktop.
 * Same component, same data, the breakpoint only changes how it docks.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, X } from 'lucide-react';
import { useRoles } from '../store';
import { ROLE_ORDER, ROLES } from '../roles/config';

export function RoleSheet() {
  const open = useRoles((s) => s.roleSheetOpen);
  const role = useRoles((s) => s.role);
  const chooseRole = useRoles((s) => s.chooseRole);
  const closeRoleSheet = useRoles((s) => s.closeRoleSheet);
  const signOut = useRoles((s) => s.signOut);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeRoleSheet}
            className="fixed inset-0 z-40 bg-black/30"
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[420px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Switch role</h2>
              <button
                type="button"
                onClick={closeRoleSheet}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface2"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1.5">
              {ROLE_ORDER.map((id) => {
                const config = ROLES[id];
                const Icon = config.icon;
                const active = id === role;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => chooseRole(id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      active ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface hover:bg-surface2'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        active ? 'bg-accent text-white' : 'bg-surface2 text-ink'
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {config.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{config.tagline}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={signOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-[12px] font-medium text-muted hover:bg-surface2"
            >
              <LogOut size={14} /> Back to role picker
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
