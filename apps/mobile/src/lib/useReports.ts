/**
 * The reports this person filed, from the one live cache.
 *
 * "Mine" is `reporter_name` equal to the signed-in display name, which is
 * exactly as weak as it sounds — there is no auth on this prototype, so there
 * is no identity to scope by (see store/session.ts). It is honest about being
 * a filter rather than a permission.
 *
 * Because it reads the live store, a report submitted on this phone appears in
 * the list the moment the server broadcasts REPORT_NEW — the same frame the
 * municipal console gets. There is no refresh and no optimistic local copy to
 * reconcile.
 */

import { useMemo } from 'react';
import { useLive } from '../store/live';
import { useSession } from '../store/session';

export function useMyReports() {
  const session = useSession((s) => s.session);
  const reports = useLive((s) => s.reports);
  const hydrated = useLive((s) => s.hydrated);
  const loadError = useLive((s) => s.loadError);

  const mine = useMemo(
    () =>
      session
        ? reports
            .filter((report) => report.reporter_name === session.displayName)
            .sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )
        : [],
    [reports, session],
  );

  return { reports: hydrated ? mine : null, error: loadError, reload: () => undefined };
}
