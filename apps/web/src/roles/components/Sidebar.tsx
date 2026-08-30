/**
 * Desktop nav. Hidden below `lg` — the phone width gets the TabBar instead.
 * This is the piece that actually makes the app feel like "a laptop web app"
 * rather than a phone screen stretched into the middle of a monitor: real
 * estate goes to a persistent sidebar + a wide content column, not a
 * max-width phone column floating in empty space.
 */

import { TAB_ICON } from './TabBar';
import { useRoles } from '../store';
import { ROLES } from '../roles/config';

export function Sidebar() {
  const role = useRoles((s) => s.role);
  const tab = useRoles((s) => s.tab);
  const go = useRoles((s) => s.go);
  if (!role) return null;
  const config = ROLES[role];

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface p-3 lg:flex">
      <div className="mb-4 rounded-2xl bg-surface2 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wider text-muted">Signed in as</p>
        <p className="truncate text-[13px] font-semibold text-ink">{config.label}</p>
      </div>

      <nav className="flex flex-col gap-1">
        {config.tabs.map((t) => {
          const Icon = TAB_ICON[t.id];
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                active ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-surface2'
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
