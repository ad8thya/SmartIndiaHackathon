/** Field app state. Owned by M6. */

import { create } from 'zustand';
import { api, type FieldEvent, type WorkflowStatus } from './lib/api';

export type Screen = 'feed' | 'detail' | 'map' | 'tasks';

/** Whose phone this is. In a real deployment this comes from the login. */
export const MY_TEAM = 'GCC-Zone-13-Adyar';

interface State {
  screen: Screen;
  events: FieldEvent[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  toast: string | null;

  go: (screen: Screen, id?: string) => void;
  load: () => Promise<void>;
  advance: (id: string, status: WorkflowStatus, notes?: string) => Promise<void>;
  clearToast: () => void;

  active: () => FieldEvent | null;
  myTasks: () => FieldEvent[];
}

export const useField = create<State>((set, get) => ({
  screen: 'feed',
  events: [],
  activeId: null,
  loading: true,
  error: null,
  toast: null,

  go: (screen, id) => set({ screen, activeId: id ?? get().activeId }),

  async load() {
    set({ loading: true, error: null });
    try {
      set({ events: await api.events(), loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async advance(id, status, notes) {
    const previous = get().events;
    // optimistic — a crew member on a roadside should not wait for a round trip
    set({
      events: previous.map((event) => (event.event_id === id ? { ...event, status } : event)),
      toast: 'Saving…',
    });
    try {
      const updated = await api.setStatus(id, status, notes, MY_TEAM);
      set({
        events: get().events.map((event) => (event.event_id === id ? updated : event)),
        toast: 'Saved',
      });
    } catch (error) {
      set({ events: previous, toast: `Failed — ${(error as Error).message}` });
    }
    setTimeout(() => set({ toast: null }), 2200);
  },

  clearToast: () => set({ toast: null }),

  active: () => get().events.find((event) => event.event_id === get().activeId) ?? null,

  myTasks: () =>
    get()
      .events.filter(
        (event) =>
          event.assigned_team === MY_TEAM ||
          event.status === 'MAINTENANCE_ASSIGNED' ||
          event.status === 'INSPECTION',
      )
      .sort((a, b) => {
        const rank = { LARGE: 0, MEDIUM: 1, SMALL: 2 } as const;
        return rank[a.severity] - rank[b.severity];
      }),
}));
