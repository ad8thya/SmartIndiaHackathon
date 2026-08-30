/** First screen: "Choose a role to enter." No login yet in Urban Twin — this
 * IS the auth for the demo, same idea as the field app's hardcoded MY_TEAM. */

import { useRoles } from '../store';
import { ROLE_ORDER, ROLES } from '../roles/config';

export function RolePicker() {
  const chooseRole = useRoles((s) => s.chooseRole);

  return (
    <div className="flex min-h-full flex-col bg-surface px-5 py-10 lg:items-center lg:justify-center">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
            U
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">URBAN TWIN</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-ink">Choose a role to enter</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Chennai City Command — pick the seat you're sitting in today.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {ROLE_ORDER.map((id) => {
            const config = ROLES[id];
            const Icon = config.icon;
            return (
              <button
                key={id}
                type="button"
                onClick={() => chooseRole(id)}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface2 px-4 py-3.5 text-left transition-colors hover:border-accent/30 hover:bg-accent/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-accent shadow-sm">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {config.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{config.tagline}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
