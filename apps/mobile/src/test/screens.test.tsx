/**
 * Every route, for every role, renders something.
 *
 * The rule this enforces is "no route is ever blank": a tab that renders empty
 * is indistinguishable from a crash, and in a demo it will be read as one.
 * These render each screen with the API unreachable — which is the hostile
 * case, and the one a venue with bad wifi will actually produce — and assert
 * the screen still says something rather than showing a bare shell.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { MOBILE_ROLES, type MobileRoleId } from '../roles/catalog';
import { useSession } from '../store/session';

beforeEach(() => {
  localStorage.clear();
  useSession.setState({ session: null });
  // Every screen must survive the API being gone. `useEvents` and friends all
  // catch, and the screens all have an error or empty state — this is what
  // proves it rather than assuming it.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAs(role: MobileRoleId, path: string) {
  useSession.getState().signIn('9840012345', role);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Every tab of every role, plus the routes that are not tabs. */
const EXTRA_ROUTES: Record<MobileRoleId, string[]> = {
  citizen: ['/citizen/report/sent/3f1a0c22-6d4e-4a71-9f0b-2c4e6a8b1d33'],
  'road-maintenance': ['/crew/order/9c5b94b1-35ad-49bb-b118-8e8fc24abf80'],
  'bus-driver': [],
  'emergency-team': [],
};

describe('every screen renders with the API unreachable', () => {
  for (const role of Object.values(MOBILE_ROLES)) {
    const paths = [...role.tabs.map((tab) => tab.to), ...EXTRA_ROUTES[role.id]];

    for (const path of paths) {
      it(`${role.label} · ${path}`, async () => {
        const { container } = renderAs(role.id, path);

        // The shell is up: the role's own tab bar is present, so this is the
        // role's app rather than the permission screen or a redirect.
        await waitFor(() =>
          expect(screen.getByRole('navigation')).toBeInTheDocument(),
        );
        expect(screen.queryByText(/not available for your role/i)).not.toBeInTheDocument();

        // And the canvas has content, not just chrome. Measured as text
        // outside the header and tab bar, so a screen that renders nothing
        // but its own frame fails here.
        const main = container.querySelector('main');
        expect(main).not.toBeNull();
        await waitFor(() =>
          expect((main?.textContent ?? '').trim().length).toBeGreaterThan(20),
        );
      });
    }
  }
});

describe('the tab bar', () => {
  it('gives every role a home at its own prefix', () => {
    for (const role of Object.values(MOBILE_ROLES)) {
      expect(role.tabs[0].to).toBe(role.prefix);
    }
  });

  it('never offers a role a tab another role owns', () => {
    for (const role of Object.values(MOBILE_ROLES)) {
      for (const tab of role.tabs) {
        expect(tab.to.startsWith(role.prefix)).toBe(true);
      }
    }
  });
});
