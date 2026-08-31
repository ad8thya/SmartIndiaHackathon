/**
 * Who is using the phone, and as what.
 *
 * ⚠️  THERE IS NO AUTHENTICATION HERE. NONE. This is a prototype sign-in:
 * the login screen accepts any identifier and any password, sends nothing to
 * a server, verifies nothing, and issues no token. The "session" is a role id
 * and a display name in localStorage, which the user could edit by hand in
 * about four seconds.
 *
 * It exists for two honest reasons:
 *   1. the demo needs to enter the app *as someone*, and a role dropdown does
 *      not communicate "this is a different person's app" the way a login does;
 *   2. the permission boundary (see components/RequireRole.tsx) needs a role to
 *      enforce against, and enforcing a real boundary against a fake identity
 *      is still a real demonstration of the boundary.
 *
 * What it must never become is a claim. No screen in this app says "secure",
 * "verified", "signed in securely", or shows a lock icon. If this project ever
 * grows real auth, it replaces this file wholesale — `restore()` becomes a
 * token exchange and every consumer keeps working, because nothing outside
 * this module reads localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isMobileRoleId, type MobileRoleId } from '../roles/catalog';

export interface Session {
  /** Phone number or username, exactly as typed. Not validated, not looked up. */
  identifier: string;
  /** What to call them on screen. Derived from `identifier` at login. */
  displayName: string;
  role: MobileRoleId;
  /** ms epoch — shown on the profile row so the fakeness stays visible. */
  signedInAt: number;
}

interface SessionState {
  session: Session | null;
  /** Accepts anything. See the file header for why that is not a bug. */
  signIn: (identifier: string, role: MobileRoleId) => void;
  signOut: () => void;
}

/**
 * "9840012345" → "9840 012345"; "priya.n" → "Priya N".
 * Cosmetic only — the raw identifier is what gets stored and sent.
 */
function toDisplayName(identifier: string): string {
  const trimmed = identifier.trim();
  if (/^[\d\s+-]{6,}$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    return digits.length === 10 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : trimmed;
  }
  return trimmed
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,

      signIn: (identifier, role) =>
        set({
          session: {
            identifier: identifier.trim(),
            displayName: toDisplayName(identifier),
            role,
            signedInAt: Date.now(),
          },
        }),

      signOut: () => set({ session: null }),
    }),
    {
      name: 'urban-twin.mobile.session',
      version: 1,
      /**
       * A hand-edited or stale localStorage entry must not boot the app into a
       * role that no longer exists — every screen would then render against
       * `undefined`. Anything that fails this check is dropped and the user
       * lands back on the login screen, which is the recoverable outcome.
       */
      merge: (persisted, current) => {
        const saved = (persisted as { session?: unknown } | undefined)?.session;
        const ok =
          saved !== null &&
          typeof saved === 'object' &&
          isMobileRoleId((saved as Session).role) &&
          typeof (saved as Session).identifier === 'string';
        return { ...current, session: ok ? (saved as Session) : null };
      },
    },
  ),
);

/** Non-reactive read, for code outside React (the WS client in T6 needs it). */
export const currentSession = (): Session | null => useSession.getState().session;
