/**
 * URBAN TWIN role portal.
 *
 * One responsive shell for all eight roles in apps/roles/README.md's RBAC
 * matrix: a phone-width column with a bottom tab bar below the `lg`
 * breakpoint, a sidebar + wide content area above it. Same bundle, same URL,
 * no separate mobile/desktop build — same principle apps/field already
 * proved out for the field crew app.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRoles } from './store';
import { RolePicker } from './screens/RolePicker';
import { Feed } from './screens/Feed';
import { Incidents } from './screens/Incidents';
import { MapScreen } from './screens/MapScreen';
import { Analytics } from './screens/Analytics';
import { MyBus } from './screens/MyBus';
import { Report } from './screens/Report';
import { Admin } from './screens/Admin';
import { RoutePlanner } from './screens/RoutePlanner';
import { Detail } from './screens/Detail';
import { TopBar } from './components/TopBar';
import { TabBar } from './components/TabBar';
import { Sidebar } from './components/Sidebar';
import { RoleSheet } from './components/RoleSheet';
import { ROLES, type TabId } from './roles/config';

const TAB_SCREENS: Record<TabId, React.ComponentType> = {
  feed: Feed,
  map: MapScreen,
  incidents: Incidents,
  analytics: Analytics,
  bus: MyBus,
  report: Report,
  admin: Admin,
  route: RoutePlanner,
};

export default function App({
  role: routeRole,
  screen,
}: {
  role?: string;
  screen?: string | null;
}) {
  const role = useRoles((s) => s.role);
  const tab = useRoles((s) => s.tab);
  const detailId = useRoles((s) => s.detailId);
  const load = useRoles((s) => s.load);
  const setRoleFromRoute = useRoles((s) => s.setRoleFromRoute);
  const toast = useRoles((s) => s.toast);

  useEffect(() => {
    // the /app/:role route is the identity now, not localStorage
    if (routeRole && routeRole in ROLES) {
      setRoleFromRoute(routeRole as keyof typeof ROLES, screen);
    }
  }, [routeRole, screen, setRoleFromRoute]);

  useEffect(() => {
    if (!role) return;
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [role, load]);

  if (!role) return <RolePicker />;

  const Screen = TAB_SCREENS[tab];

  return (
    <div className="theme-light flex h-full flex-col bg-paper text-ink lg:flex-row">
      <Sidebar />

      <div className="flex min-h-0 flex-1 flex-col">
        <TopBar />

        <div className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={detailId ? `detail-${detailId}` : tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="absolute inset-0 flex flex-col bg-paper"
            >
              {detailId ? <Detail /> : <Screen />}
            </motion.div>
          </AnimatePresence>
        </div>

        <TabBar />
      </div>

      <RoleSheet />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs text-white shadow-xl lg:bottom-6"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
