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
 * T4 replaces the `Placeholder` bodies with the real screens. The routes, the
 * shell and the guard do not change when it does.
 */

import { Navigate, Route, Routes } from 'react-router-dom';
import {
  Ambulance,
  Bell,
  Camera,
  ClipboardList,
  FileText,
  Map as MapIcon,
  Navigation,
  Route as RouteIcon,
  ScanLine,
  SquarePen,
} from 'lucide-react';
import { AppShell } from './components/AppShell';
import { RequireRole } from './components/RequireRole';
import { LoginScreen } from './screens/LoginScreen';
import { NotAvailableScreen } from './screens/NotAvailableScreen';
import { Placeholder } from './screens/Placeholder';
import { RoadConditionsScreen } from './screens/citizen/RoadConditionsScreen';
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
        <Route
          index
          element={
            <Placeholder
              title="Citizen home"
              body="The hero banner and the four big action cards land here in T4."
              bullets={[
                'Report an issue — camera, GPS and a category picker',
                'Road conditions — confirmed hazards near you',
                'My reports — what happened to what you sent',
                'Alerts — notices for your ward',
              ]}
              action={{ to: '/citizen/report', label: 'Report an issue' }}
            />
          }
        />
        <Route
          path="report"
          element={
            <Placeholder
              icon={SquarePen}
              title="Report an issue"
              body="Photo capture, auto-filled location and a category picker. Built in T4 on the API added in T5."
              bullets={[
                'Take a photo with the phone camera',
                'Location filled in from GPS, with an editable address',
                'A description, then submit — and a report ID back',
              ]}
            />
          }
        />
        <Route
          path="reports"
          element={
            <Placeholder
              icon={FileText}
              title="My reports"
              body="Everything you have sent, with its current status and a timeline."
              action={{ to: '/citizen/report', label: 'Report an issue' }}
            />
          }
        />
        {/* Full-bleed: the map owns the canvas, so no padding wrapper. */}
        <Route path="conditions" element={<RoadConditionsScreen />} />
        <Route
          path="alerts"
          element={
            <Placeholder icon={Bell} title="Alerts" body="Notices for your ward will appear here." />
          }
        />
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
        <Route
          index
          element={
            <Placeholder
              icon={ClipboardList}
              title="My queue"
              body="Work orders assigned to your crew, each with its SLA countdown, distance and severity."
              bullets={[
                'Tap an order for evidence, IRC:82 severity and the recommended treatment',
                'Start inspection → mark repaired, live on the console',
              ]}
            />
          }
        />
        <Route
          path="map"
          element={
            <Placeholder
              icon={MapIcon}
              title="Work order map"
              body="Your assigned orders as pins on the offline basemap. Built in T3."
            />
          }
        />
        <Route
          path="verification"
          element={
            <Placeholder
              icon={ScanLine}
              title="Awaiting verification"
              body="Repairs you have closed that are waiting for a bus to re-scan the road and confirm them."
            />
          }
        />
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
        <Route
          index
          element={
            <Placeholder
              icon={RouteIcon}
              title="My bus"
              body="One card: bus id, route, shift and status. This role stays small on purpose."
            />
          }
        />
        <Route
          path="cameras"
          element={
            <Placeholder
              icon={Camera}
              title="Cameras"
              body="Front, rear, left and right — online state and the time of the last frame."
            />
          }
        />
        <Route
          path="route"
          element={
            <Placeholder
              icon={MapIcon}
              title="Today’s route"
              body="Your route on the map, the stops ahead, and what your cameras contributed today."
            />
          }
        />
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
        <Route
          index
          element={
            <Placeholder
              icon={Ambulance}
              title="Active alerts"
              body="Large, sparse incident cards with a severity strip and time elapsed. Read under pressure, so bigger than anything else in the app."
              bullets={['Accept an incident', 'Dispatch a unit and follow the route']}
            />
          }
        />
        <Route
          path="dispatch"
          element={
            <Placeholder
              icon={Navigation}
              title="Dispatch"
              body="Route to the scene and an ETA, once an incident is accepted."
            />
          }
        />
        <Route
          path="log"
          element={
            <Placeholder icon={FileText} title="Log" body="Incidents you have already closed." />
          }
        />
        <Route path="*" element={<CatchAll />} />
      </Route>

      <Route path="*" element={<CatchAll />} />
    </Routes>
  );
}
