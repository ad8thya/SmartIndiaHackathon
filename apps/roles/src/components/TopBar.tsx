/** Shared header: wordmark, current role, and the "switch role" trigger. */

import { ChevronDown } from 'lucide-react';
import { useRoles } from '../store';
import { ROLES } from '../roles/config';

export function TopBar() {
  const role = useRoles((s) => s.role);
  const openRoleSheet = useRoles((s) => s.openRoleSheet);
  if (!role) return null;
  const config = ROLES[role];
  const Icon = config.icon;

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-3 lg:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
          U
        </span>
        <span className="text-[13px] font-semibold tracking-tight text-ink">URBAN TWIN</span>
      </div>

      <button
        type="button"
        onClick={openRoleSheet}
        className="flex items-center gap-2 rounded-full border border-line bg-surface2 py-1.5 pl-2 pr-3 text-left"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon size={13} />
        </span>
        <span className="text-[12px] font-medium text-ink">{config.label}</span>
        <ChevronDown size={13} className="text-muted" />
      </button>
    </header>
  );
}
