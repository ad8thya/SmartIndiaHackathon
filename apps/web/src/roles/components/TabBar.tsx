/**
 * Bottom navigation for phone widths. Same tab set as the desktop Sidebar —
 * only the chrome differs — because a role's permissions shouldn't change
 * depending on how wide the screen is.
 */

import {
  BarChart3,
  Bus,
  LayoutGrid,
  Map as MapIcon,
  MessageSquarePlus,
  Radio,
  Route as RouteIcon,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRoles } from '../store';
import { ROLES, type TabId } from '../roles/config';

const TAB_ICON: Record<TabId, LucideIcon> = {
  feed: Radio,
  map: MapIcon,
  incidents: Shield,
  analytics: BarChart3,
  bus: Bus,
  report: MessageSquarePlus,
  admin: LayoutGrid,
  route: RouteIcon,
};

export function TabBar() {
  const role = useRoles((s) => s.role);
  const tab = useRoles((s) => s.tab);
  const go = useRoles((s) => s.go);
  if (!role) return null;
  const tabs = ROLES[role].tabs;

  return (
    <nav className="flex shrink-0 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
      {tabs.map((t) => {
        const Icon = TAB_ICON[t.id];
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 ${
              active ? 'text-accent' : 'text-muted'
            }`}
          >
            <Icon size={19} />
            <span className="text-[10px] font-medium">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export { TAB_ICON };
