# apps/web — the ONE Urban Twin frontend

Vite + React 18 + TS + Tailwind + react-router-dom + zustand. Port **5173** only.

| route | what |
|---|---|
| `/` | role picker (landing) |
| `/app/:role` | role home — command console for the 6 operator roles, phone-shaped shell for `citizen` / `bus-driver` |
| `/app/:role/:screen` | a specific panel (command) or tab (roles shell) |
| `/field` | mobile view — PhoneFrame iframes it, same URL opens directly on a phone |

A missing or unrecognised `:role` falls through to the full unrestricted console — never blank.

`src/lib/types.ts` is **generated** from `packages/contracts` by
`scripts/gen_frontend_types.py` — do not edit it by hand. `src/lib/api.ts`,
`ws.ts` and the command store are the single API client / WebSocket for the
whole app; `src/field/lib` and `src/roles/lib` are thin presentation facades
over them (no mirrored contract types).

This app absorbed `apps/command`, `apps/field` and `apps/roles` (all deleted).
