/**
 * This driver's bus.
 *
 * Which bus is "mine" is picked as the first bus the API reports, and that is
 * a stand-in, not a lookup: there is no auth, so there is no driver record to
 * join against (see store/session.ts). It is written down here rather than
 * assumed in a screen, so the day a real roster exists there is one function
 * to change.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { BusPosition, UTRoute } from './types';

export function useMyBus() {
  const [bus, setBus] = useState<BusPosition | null>(null);
  const [route, setRoute] = useState<UTRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fleet, routes] = await Promise.all([api.fleet(), api.routes()]);
      // Stable across refreshes: sorting means the demo shows the same bus
      // every time rather than whichever one the replay happened to move last.
      const mine = [...fleet].sort((a, b) => a.bus_id.localeCompare(b.bus_id))[0] ?? null;
      setBus(mine);
      setRoute(routes.find((candidate) => candidate.route_id === mine?.route_id) ?? null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not reach the fleet service');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { bus, route, error, loaded, reload: load };
}
