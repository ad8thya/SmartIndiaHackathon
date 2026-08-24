# Role Portals (RBAC)

Placeholder tree — **no app code here yet**. Each subfolder reserves the
place for a role-scoped frontend; today `apps/command` and `apps/field`
remain the two working apps. This is where a future per-role portal (or a
role-scoped view inside command/field) lands once built.

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
