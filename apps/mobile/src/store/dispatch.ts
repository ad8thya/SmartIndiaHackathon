/**
 * Which incidents this crew has accepted, dispatched to, or closed.
 *
 * This used to be `localStorage` and a note apologising for it. It is now the
 * real thing: every change PATCHes `/api/incidents/{id}/response`, the API
 * appends a row and broadcasts `INCIDENT_RESPONSE`, and the control room sees
 * it. A button that looks like it dispatched a unit and did not was the worst
 * remaining lie in this app, because the thing it was quiet about was an
 * ambulance.
 *
 * State lives in `store/live.ts` alongside everything else the socket feeds,
 * so a response another crew made shows up here without a refresh. This module
 * is only the write path and the in-flight/error bookkeeping around it.
 *
 * Optimism is deliberately absent. A tap paints "sending", not "dispatched" —
 * if the PATCH fails the crew must find out immediately, and an optimistic
 * flip that silently reverts is indistinguishable from the tap not landing.
 */

import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import { useLive } from './live';
import type { ResponseState } from '../lib/types';

/** The crew this phone belongs to. No auth exists to derive it — see crew.ts. */
export const MY_UNIT = 'GCC-Emergency-Adyar';

interface DispatchState {
  /** incident_id → true while its PATCH is in flight. */
  pending: Record<string, boolean>;
  /** incident_id → why the last attempt failed, cleared on the next try. */
  errors: Record<string, string>;
  advance: (incidentId: string, state: ResponseState, note?: string) => Promise<void>;
}

export const useDispatch = create<DispatchState>((set, get) => ({
  pending: {},
  errors: {},

  async advance(incidentId, state, note) {
    if (get().pending[incidentId]) return;
    set((current) => ({
      pending: { ...current.pending, [incidentId]: true },
      errors: { ...current.errors, [incidentId]: '' },
    }));

    try {
      const response = await api.setIncidentResponse(incidentId, {
        state,
        team: MY_UNIT,
        note,
      });
      // Write straight into the live cache too. The broadcast will arrive and
      // land on the same value, but waiting for the round trip would leave the
      // button looking unpressed for as long as the socket takes.
      useLive.getState().applyResponse(response);
    } catch (cause) {
      set((current) => ({
        errors: {
          ...current.errors,
          [incidentId]:
            cause instanceof ApiError && cause.status === 409
              ? 'Another unit got there first. Pull down to refresh.'
              : cause instanceof ApiError
                ? `The control room refused the update (${cause.status}).`
                : 'No signal — this was not sent. Use your radio and try again.',
        },
      }));
    } finally {
      set((current) => ({ pending: { ...current.pending, [incidentId]: false } }));
    }
  },
}));
