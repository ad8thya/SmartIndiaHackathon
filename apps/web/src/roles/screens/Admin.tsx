/** Smart City Admin's overview of the RBAC matrix itself — there's no user
 * management API yet, so this is read-only, mirroring apps/roles/README.md. */

import { ROLE_ORDER, ROLES } from '../roles/config';

export function Admin() {
  return (
    <div className="mx-auto min-h-0 max-w-3xl flex-1 overflow-y-auto p-4 lg:p-6">
      <h1 className="text-base font-medium tracking-tight text-ink">Admin — RBAC matrix</h1>
      <p className="mt-1 text-[12px] text-muted">
        Every role's permissions, read-only here. There's no user-management endpoint yet, so
        editing this matrix means editing <code className="font-mono">apps/roles/src/roles/config.ts</code>.
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-left text-[12px]">
          <thead className="bg-surface2 text-[10px] tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">View</th>
              <th className="px-3 py-2">Report</th>
              <th className="px-3 py-2">Analytics</th>
              <th className="px-3 py-2">Approve</th>
              <th className="px-3 py-2">Admin</th>
            </tr>
          </thead>
          <tbody>
            {ROLE_ORDER.map((id) => {
              const config = ROLES[id];
              return (
                <tr key={id} className="border-t border-line">
                  <td className="px-3 py-2 font-medium text-ink">{config.label}</td>
                  <td className="px-3 py-2 text-ink/80">{config.permissions.view}</td>
                  <td className="px-3 py-2 text-ink/80">{config.permissions.reportLabel}</td>
                  <td className="px-3 py-2 text-ink/80">{config.permissions.analyticsLabel}</td>
                  <td className="px-3 py-2">{config.permissions.approve ? '✅' : '❌'}</td>
                  <td className="px-3 py-2">{config.permissions.admin ? '✅' : '❌'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
