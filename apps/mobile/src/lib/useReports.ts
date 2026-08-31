/**
 * The reports this person filed.
 *
 * "Mine" is `reporter_name` equal to the signed-in display name, which is
 * exactly as weak as it sounds — there is no auth on this prototype, so there
 * is no identity to scope by (see store/session.ts). It is honest about being
 * a filter rather than a permission: the endpoint is not pretending to
 * authorise anything, and this is not pretending it did.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from '../store/session';
import type { CitizenReport } from './types';

export function useMyReports() {
  const session = useSession((s) => s.session);
  const [reports, setReports] = useState<CitizenReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setReports(await api.reports({ reporter_name: session.displayName, limit: 100 }));
      setError(null);
    } catch (cause) {
      // See useEvents: [] rather than null, so a failure ends the loading
      // state instead of leaving a skeleton up forever.
      setReports([]);
      setError(cause instanceof Error ? cause.message : 'could not load your reports');
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return { reports, error, reload: load };
}
