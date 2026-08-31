/**
 * Route guard. Two rules, in this order:
 *
 *   1. no session  → the login screen, remembering where you were going so
 *      you land there after signing in rather than on a generic home page.
 *   2. wrong role  → the permission screen, rendered **in place**. The URL
 *      does not change. See screens/NotAvailableScreen.tsx for why that
 *      matters more than it looks like it should.
 *
 * The role→route mapping is a single path prefix per role, declared in
 * roles/catalog.ts. Adding a screen to a role is a route line and nothing
 * else; there is no second list of permitted paths to forget to update.
 */

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { MOBILE_ROLES, type MobileRoleId } from '../roles/catalog';
import { NotAvailableScreen } from '../screens/NotAvailableScreen';
import { useSession } from '../store/session';

export function RequireRole({ role, children }: { role: MobileRoleId; children: ReactNode }) {
  const session = useSession((s) => s.session);
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (session.role !== role) {
    return <NotAvailableScreen role={MOBILE_ROLES[session.role]} />;
  }

  return <>{children}</>;
}
