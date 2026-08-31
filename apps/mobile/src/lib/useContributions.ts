/**
 * What THIS bus has detected since midnight.
 *
 * The route screen used to count every event whose `road_segment_id`
 * contained the route id and label the result "found today". That was wrong
 * twice over: no date filter at all, and route-wide attribution — it counted
 * defects found by other buses on other days and told this driver they were
 * theirs. On a seeded network it read "51 defects found today" when 15 had
 * been seen that day.
 *
 * An `Event` cannot answer this. It is a fusion of several buses' sightings
 * and carries `distinct_bus_count` — a number, not a list — so there is no
 * way to ask it which bus contributed. `Observation` names a bus, so the
 * count comes from `/api/observations?bus_id=…&since=…`.
 *
 * `truncated` is honest about the server's ring buffer: it holds the last
 * 5000 detections and is empty on a fresh process, so a full buffer means
 * "at least this many", not "this many".
 *
 * One caveat under `make dev`: the replay simulator stamps observations with
 * a SIMULATED clock that runs ahead of wall time — minutes at first, days
 * after a long loop. "Since midnight" is midnight by the wall clock, so a
 * long-running replay makes every buffered detection look like it happened
 * today. Correct in production, generous in a demo; the alternative is
 * deriving "today" from the newest observation, which would be wrong the
 * moment the fleet goes quiet. Same trade-off routers/events.py already
 * documents for `last_seen`.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Observation } from './types';

/** Local midnight, as an ISO string the API can filter on. */
function startOfToday(): string {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight.toISOString();
}

/** The cap the server applies. A full page means the count is a floor. */
const PAGE = 500;

export interface Contributions {
  observations: Observation[];
  /** Detections this bus reported since midnight. */
  count: number;
  /** True when the page filled — the real number is at least `count`. */
  truncated: boolean;
  loaded: boolean;
  error: string | null;
  reload: () => void;
}

export function useContributions(busId: string | null): Contributions {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!busId) {
      setLoaded(true);
      return;
    }
    try {
      setObservations(
        await api.observations({ bus_id: busId, since: startOfToday(), limit: PAGE }),
      );
      setError(null);
    } catch (cause) {
      setObservations([]);
      setError(cause instanceof Error ? cause.message : 'could not load your detections');
    } finally {
      setLoaded(true);
    }
  }, [busId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    observations,
    count: observations.length,
    truncated: observations.length >= PAGE,
    loaded,
    error,
    reload: () => void load(),
  };
}
