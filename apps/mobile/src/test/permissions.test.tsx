/**
 * The permission boundary, as a test rather than a claim.
 *
 * T2's requirement is that the boundary be *demonstrable*: opening a route
 * your role does not own has to produce a screen that names the role and says
 * what it can do — not a redirect, not a blank. Redirect-instead-of-render is
 * the easy regression to introduce later (it is one line, and it "works"), so
 * these assert the URL is still the one that was asked for.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../App';
import { isMobileRoleId, MOBILE_ROLES, roleOwningPath } from '../roles/catalog';
import { useSession } from '../store/session';

function ShowPath() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <ShowPath />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSession.setState({ session: null });
});

describe('route ownership', () => {
  it('maps every role tab to the role that owns it', () => {
    for (const role of Object.values(MOBILE_ROLES)) {
      for (const tab of role.tabs) {
        expect(roleOwningPath(tab.to)?.id).toBe(role.id);
      }
    }
  });

  it('claims no path outside a role prefix', () => {
    expect(roleOwningPath('/login')).toBeNull();
    expect(roleOwningPath('/')).toBeNull();
    // A prefix match must be a *segment* match: /citizenry is not /citizen.
    expect(roleOwningPath('/citizenry')).toBeNull();
  });
});

describe('signed out', () => {
  it('sends a guarded route to the login screen', async () => {
    renderAt('/crew');
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });
});

describe('the permission boundary', () => {
  beforeEach(() => {
    useSession.getState().signIn('9840012345', 'citizen');
  });

  it('renders in place, at the URL that was asked for', async () => {
    renderAt('/crew');
    expect(await screen.findByText(/not available for your role/i)).toBeInTheDocument();
    // The load-bearing assertion: not a redirect.
    expect(screen.getByTestId('path')).toHaveTextContent('/crew');
  });

  it('names the role you are signed in as, and what it can do', async () => {
    renderAt('/emergency/dispatch');
    expect(await screen.findByText(/not available for your role/i)).toBeInTheDocument();
    // Names both sides: who you are, and whose page this is.
    expect(screen.getByText('Citizen')).toBeInTheDocument();
    expect(screen.getAllByText('Emergency Team').length).toBeGreaterThan(0);
    for (const line of MOBILE_ROLES.citizen.can) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
  });

  it('shows the same screen for an unowned path, not a blank one', async () => {
    renderAt('/nonsense');
    expect(await screen.findByText(/not available for your role/i)).toBeInTheDocument();
    expect(screen.getByText(/no page at this address/i)).toBeInTheDocument();
  });

  it('lets the role into its own routes', async () => {
    renderAt('/citizen/report');
    expect(await screen.findByRole('heading', { name: /report an issue/i })).toBeInTheDocument();
    expect(screen.queryByText(/not available for your role/i)).not.toBeInTheDocument();
  });
});

describe('sign in', () => {
  it('accepts any password and lands on the chosen role’s home', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    await user.type(screen.getByLabelText(/phone number or username/i), 'priya.n');
    await user.type(screen.getByLabelText(/^password$/i), 'literally anything');
    await user.click(screen.getByRole('button', { name: /road maintenance/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // The heading, not the tab label — both say 'My queue'.
    expect(await screen.findByRole('heading', { name: 'My queue' })).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/crew');
    expect(useSession.getState().session?.role).toBe('road-maintenance');
  });

  it('persists the session so a reload keeps you signed in', () => {
    useSession.getState().signIn('9840012345', 'bus-driver');
    const raw = localStorage.getItem('urban-twin.mobile.session');
    expect(raw).toContain('bus-driver');
    expect(raw).toContain('9840012345');
  });

  it('rejects a stored role that no longer exists', () => {
    // The failure this guards against: a role is renamed or removed, and a
    // phone that still has the old id in localStorage boots into a role
    // object that is `undefined`, taking every screen down with it. The
    // recoverable outcome is landing back on the login screen.
    expect(isMobileRoleId('bus-driver')).toBe(true);
    expect(isMobileRoleId('wharf-inspector')).toBe(false);
    expect(isMobileRoleId('municipal-authority')).toBe(false);
    expect(isMobileRoleId(undefined)).toBe(false);
  });
});
