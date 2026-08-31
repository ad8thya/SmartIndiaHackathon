/**
 * Which incidents this crew has accepted, and which they have closed.
 *
 * ⚠️  This is LOCAL TO THIS PHONE. There is no dispatch endpoint — the API
 * serves incident dossiers read-only (`GET /api/incidents`), and T5's backend
 * work was scoped to citizen reports. Accepting an incident here does not tell
 * the control room anything.
 *
 * That is a real limitation, not a hidden one: the Emergency screens say so on
 * screen, next to the buttons. The alternative — a button that looks like it
 * dispatched a unit and did not — is the exact failure mode the citizen report
 * had before T5, and it is worse here, because the thing it would be lying
 * about is an ambulance.
 *
 * Making this real is one endpoint (`PATCH /api/incidents/{id}/response`) plus
 * a broadcast, and it belongs with M4/M5 rather than in the phone.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ResponseState = 'accepted' | 'dispatched' | 'closed';

interface DispatchState {
  /** incident_id → where this crew has got to with it. */
  responses: Record<string, { state: ResponseState; at: number }>;
  set: (incidentId: string, state: ResponseState) => void;
  clear: (incidentId: string) => void;
}

export const useDispatch = create<DispatchState>()(
  persist(
    (set) => ({
      responses: {},
      set: (incidentId, state) =>
        set((current) => ({
          responses: { ...current.responses, [incidentId]: { state, at: Date.now() } },
        })),
      clear: (incidentId) =>
        set((current) => {
          const next = { ...current.responses };
          delete next[incidentId];
          return { responses: next };
        }),
    }),
    { name: 'urban-twin.mobile.dispatch', version: 1 },
  ),
);
