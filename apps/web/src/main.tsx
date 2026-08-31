/**
 * ONE app, ONE port. Owned by M6.
 *
 *   /                      role picker (landing)
 *   /app/:role             role home — command console for the 6 operator
 *                          roles, phone-shaped shell for citizen/bus-driver
 *   /app/:role/:screen     a specific panel (command) or tab (roles shell)
 *   /field                 the mobile field app — PhoneFrame iframes this
 *                          same-origin URL, and it opens on a real phone
 *
 * A missing or unrecognised :role falls through to the full unrestricted
 * command console — never a blank screen.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';

import CommandApp from './CommandApp';
import FieldApp from './field/App';
import RolesApp from './roles/App';
import { RolePicker } from './roles/screens/RolePicker';
import { PHONE_ROLES } from './roles/roles/config';
import './styles/index.css';

function RoleRoute() {
  const { role, screen } = useParams();
  // citizen + bus-driver get their purpose-built phone-shaped shell; every
  // other value — the 6 operator roles, or garbage — goes to the command
  // console, which treats an unknown role as "show everything".
  if (role && (PHONE_ROLES as readonly string[]).includes(role)) {
    return <RolesApp role={role} screen={screen} />;
  }
  return <CommandApp role={role ?? null} screen={screen ?? null} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="theme-light h-full"><RolePicker /></div>} />
        <Route path="/field" element={<div className="theme-dark h-full"><FieldApp /></div>} />
        <Route path="/app/:role" element={<RoleRoute />} />
        <Route path="/app/:role/:screen" element={<RoleRoute />} />
        <Route path="/app" element={<CommandApp role={null} screen={null} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
