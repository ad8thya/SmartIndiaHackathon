# Role Portal (RBAC)

`urban-twin-roles` — a single responsive web app (`npm run dev` on port
5175, same as `apps/command`/`apps/field`) that implements every row of the
RBAC matrix below as one data-driven shell rather than eight separate apps.

The subfolders (`bus-driver/`, `citizen/`, etc.) are docs only — one README
per role explaining its permissions. The actual behavior for all eight
lives in `src/roles/config.ts`: which tabs a role sees, which detection
classes its feed is scoped to, and whether it can approve/dispatch. Change
a role's permissions there, not by writing a new app.

Screens are shared across roles (`src/screens/Feed.tsx`, `MapScreen.tsx`,
`Detail.tsx`, `Analytics.tsx`, ...); `src/store.ts` gates what each screen
loads and which actions it exposes off `ROLES[role].permissions`.

Mobile vs. desktop is the same story as `apps/field`: one bundle, one URL,
a bottom tab bar under the `lg` breakpoint and a sidebar + wide content area
above it (see `src/components/{TabBar,Sidebar}.tsx`).

## RBAC matrix

| Role | View | Report | AI Analytics | Approve | Admin |
|---|---|---|---|---|---|
| Bus Driver | Own Bus, Camera Status | ❌ | ❌ | ❌ | ❌ |
| Municipal Authority | ✅ | ✅ | ✅ | ✅ | ❌ |
| Road Maintenance | Assigned Roads, Repair Status | Limited | — | ✅ | ❌ |
| Traffic Police | Traffic & Incidents | Incident Actions | Traffic Analytics | ❌ | ❌ |
| Emergency Team | Accident Alerts | Response Status | Limited | ❌ | ❌ |
| Citizen | Public Map | Feedback | Limited | ❌ | ❌ |
| Urban Planner | Analytics | Export | Full Analytics | ❌ | ❌ |
| Smart City Admin | Everything | Everything | Everything | Everything | ✅ |

(`Edge AI Device` — camera feed / events / local inference — is not a human
role; it lives in `services/edge`, not here.)

## Folders

| folder | role |
|---|---|
| `bus-driver/` | Bus Driver |
| `municipal-authority/` | Municipal Authority |
| `road-maintenance/` | Road Maintenance |
| `traffic-police/` | Traffic Police |
| `emergency-team/` | Emergency Team |
| `citizen/` | Citizen |
| `urban-planner/` | Urban Planner |
| `smart-city-admin/` | Smart City Admin |
