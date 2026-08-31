/**
 * The route table — and, because of how the guard works, the permission
 * matrix too.
 *
 * Every signed-in route sits under `RequireRole`, and the role a route belongs
 * to is the one whose path prefix it starts with (roles/catalog.ts). Opening
 * another role's URL renders the permission screen at that URL rather than
 * redirecting, so the boundary is something you can point at during a demo:
 * sign in as Citizen, type /crew, and the app tells you what it is and what
 * you can do instead.
 *
 * `*` inside a role's own subtree matters as much as the cross-role case — a
 * typo'd path under /citizen must not fall through to the global catch-all and
 * lose the tab bar.
 *
 * Every route below is a real screen. There are no placeholders left — the
 * stand-in component T2 used was deleted when the last one was replaced, which
 * is what its own docstring said to do.
 */

import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireRole } from './components/RequireRole';
import { LoginScreen } from './screens/LoginScreen';
import { NotAvailableScreen } from './screens/NotAvailableScreen';
import { AlertsScreen } from './screens/citizen/AlertsScreen';
import { CitizenHomeScreen } from './screens/citizen/HomeScreen';
import { MyReportsScreen } from './screens/citizen/MyReportsScreen';
import { ReportScreen } from './screens/citizen/ReportScreen';
import { ReportSentScreen } from './screens/citizen/ReportSentScreen';
import { RoadConditionsScreen } from './screens/citizen/RoadConditionsScreen';
import { CrewMapScreen } from './screens/crew/CrewMapScreen';
import { OrderScreen } from './screens/crew/OrderScreen';
import { QueueScreen } from './screens/crew/QueueScreen';
import { VerificationScreen } from './screens/crew/VerificationScreen';
import { CamerasScreen } from './screens/bus/CamerasScreen';
import { MyBusScreen } from './screens/bus/MyBusScreen';
import { RouteScreen } from './screens/bus/RouteScreen';
import { EmergencyAlertsScreen } from './screens/emergency/AlertsScreen';
import { DispatchScreen } from './screens/emergency/DispatchScreen';
import { LogScreen } from './screens/emergency/LogScreen';
import { MOBILE_ROLES } from './roles/catalog';
import { useSession } from './store/session';

/**
 * Anything with no owner at all — a stale bookmark, a typo, a link from the
 * console. Signed out it is the login screen; signed in it is the permission
 * screen, which already handles "there is no page here for you".
 */
function CatchAll() {
  const session = useSession((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return <NotAvailableScreen role={MOBILE_ROLES[session.role]} />;
}

/** Signed in → your role's home. Signed out → login. */
function Root() {
  const session = useSession((s) => s.session);
  return <Navigate to={session ? MOBILE_ROLES[session.role].prefix : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<LoginScreen />} />

      {/* ── Citizen ─────────────────────────────────────────────────────── */}
      <Route
        path="/citizen"
        element={
          <RequireRole role="citizen">
            <AppShell />
          </RequireRole>
        }
      >
        <Route index element={<CitizenHomeScreen />} />
        <Route path="report" element={<ReportScreen />} />
        {/* The success screen is a route, not a flag on the form: it has its
            own URL so "Report another" is a navigation rather than a reset,
            and swipe-back from it lands on the home screen instead of a
            half-filled form the citizen already submitted. */}
        <Route path="report/sent/:reportId" element={<ReportSentScreen />} />
        <Route path="reports" element={<MyReportsScreen />} />
        {/* Full-bleed: the map owns the canvas, so no padding wrapper. */}
        <Route path="conditions" element={<RoadConditionsScreen />} />
        <Route path="alerts" element={<AlertsScreen />} />
        <Route path="*" element={<CatchAll />} />
      </Route>

      {/* ── Road Maintenance ────────────────────────────────────────────── */}
      <Route
        path="/crew"
        element={
          <RequireRole role="road-maintenance">
            <AppShell />
          </RequireRole>
        }
      >
        <Route index element={<QueueScreen />} />
        {/* Detail is its own route rather than a sheet: a crew opens one order
            and works from it, so it needs a URL, a back button and somewhere
            to come back to after Navigate hands off to Maps. */}
        <Route path="order/:eventId" element={<OrderScreen />} />
        <Route path="map" element={<CrewMapScreen />} />
        <Route path="verification" element={<VerificationScreen />} />
        <Route path="*" element={<CatchAll />} />
      </Route>

      {/* ── Bus Driver ──────────────────────────────────────────────────── */}
      <Route
        path="/bus"
        element={
          <RequireRole role="bus-driver">
            <AppShell />
          </RequireRole>
        }
      >
        <Route index element={<MyBusScreen />} />
        <Route path="cameras" element={<CamerasScreen />} />
        <Route path="route" element={<RouteScreen />} />
        <Route path="*" element={<CatchAll />} />
      </Route>

      {/* ── Emergency Team ──────────────────────────────────────────────── */}
      <Route
        path="/emergency"
        element={
          <RequireRole role="emergency-team">
            <AppShell />
          </RequireRole>
        }
      >
        <Route index element={<EmergencyAlertsScreen />} />
        <Route path="dispatch" element={<DispatchScreen />} />
        <Route path="log" element={<LogScreen />} />
        <Route path="*" element={<CatchAll />} />
      </Route>

      <Route path="*" element={<CatchAll />} />
    </Routes>
  );
}
