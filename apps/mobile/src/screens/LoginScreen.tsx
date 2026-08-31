/**
 * Sign-in. A login screen, not a role picker — you type who you are, then
 * pick which of the four field roles you are here as.
 *
 * ⚠️  No authentication happens on this screen. Any identifier and any
 * password are accepted, nothing is sent anywhere, and no token is issued.
 * See store/session.ts for the full note. Nothing rendered below claims
 * otherwise: the disclosure card at the bottom says it in the UI, in plain
 * words, because a fake login that looks real is a lie told to a demo
 * audience.
 */

import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Eye, EyeOff, Info, Monitor } from 'lucide-react';
import {
  DESKTOP_ROLE_LABELS,
  MOBILE_ROLE_LIST,
  type MobileRoleId,
} from '../roles/catalog';
import { useSession } from '../store/session';

export function LoginScreen() {
  const session = useSession((s) => s.session);
  const signIn = useSession((s) => s.signIn);
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<MobileRoleId>('citizen');
  const [touched, setTouched] = useState(false);

  // Already signed in and someone typed /login: go where they were headed, or
  // to their role's home. Switching role signs out first, so this does not
  // fight the "Switch role" button.
  if (session) {
    const back = (location.state as { from?: string } | null)?.from;
    return <Navigate to={back ?? MOBILE_ROLE_LIST.find((r) => r.id === session.role)!.prefix} replace />;
  }

  const canSubmit = identifier.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    // The password is deliberately not read. It is on screen because a login
    // without one does not read as a login; it is never checked, stored or
    // sent. Deleting the field would be more honest but less representative
    // of the screen this replaces in a real deployment.
    signIn(identifier, role);
    navigate(MOBILE_ROLE_LIST.find((r) => r.id === role)!.prefix, { replace: true });
  }

  return (
    <div className="ut-canvas ut-safe-top ut-safe-bottom h-full overflow-y-auto px-5 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="ut-nosel flex items-center gap-2.5 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-[19px] font-medium text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)]">
            U
          </div>
          <div>
            <div className="text-[13px] font-medium tracking-[1.4px]">URBAN TWIN</div>
            <div className="text-[11px] font-medium text-accent">Chennai · field app</div>
          </div>
        </div>

        <h1 className="mt-7 text-[24px] font-medium leading-tight tracking-[-0.5px]">Sign in</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          Use your phone number or your staff username, then choose the role you are working as.
        </p>

        <form onSubmit={submit} className="mt-6">
          <label className="block text-[12px] font-medium text-ink-soft" htmlFor="identifier">
            Phone number or username
          </label>
          <input
            id="identifier"
            name="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="9840012345"
            className="ut-touch mt-1.5 w-full rounded-[12px] border border-line bg-card px-3.5 py-3 text-[15px] outline-none transition-colors focus:border-accent"
          />
          {touched && !canSubmit ? (
            <p className="mt-1.5 text-[12px] text-danger">Enter a phone number or a username.</p>
          ) : null}

          <label className="mt-4 block text-[12px] font-medium text-ink-soft" htmlFor="password">
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Any password works"
              className="ut-touch w-full rounded-[12px] border border-line bg-card py-3 pl-3.5 pr-12 text-[15px] outline-none transition-colors focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="ut-touch absolute right-0 top-0 flex h-full w-11 items-center justify-center text-ink-faint"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-[11px] font-medium uppercase tracking-[1.1px] text-ink-muted">
              Sign in as
            </span>
          </div>

          <div className="mt-2.5 flex flex-col gap-2.5">
            {MOBILE_ROLE_LIST.map((option) => {
              const selected = option.id === role;
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setRole(option.id)}
                  className={`ut-action-card ut-touch flex w-full items-center gap-3 border p-3.5 text-left transition-colors ${
                    selected ? 'border-accent bg-accent/[0.04]' : 'border-line'
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 flex-none items-center justify-center rounded-[12px] ${option.tint.bg} ${option.tint.fg}`}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium leading-tight">{option.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">
                      {option.tagline}
                    </span>
                  </span>
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 transition-colors ${
                      selected ? 'border-accent bg-accent' : 'border-line'
                    }`}
                  >
                    {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            className="ut-touch mt-6 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3.5 text-[16px] font-medium text-white shadow-[0_4px_14px_rgba(37,99,235,0.3)] disabled:opacity-40 disabled:shadow-none"
            disabled={!canSubmit}
          >
            Continue
            <ChevronRight size={18} />
          </button>
        </form>

        {/* The honesty register, on screen rather than in a README. */}
        <div className="mt-6 flex gap-2.5 rounded-[12px] border border-line bg-card px-3.5 py-3">
          <Info size={15} className="mt-0.5 flex-none text-ink-faint" />
          <p className="text-[12px] leading-relaxed text-ink-soft">
            This is a prototype. There is no account system behind this screen — any password is
            accepted, nothing is checked, and the role you pick is stored on this device only.
          </p>
        </div>

        <div className="mt-3 flex gap-2.5 rounded-[12px] border border-line bg-card px-3.5 py-3">
          <Monitor size={15} className="mt-0.5 flex-none text-ink-faint" />
          <p className="text-[12px] leading-relaxed text-ink-soft">
            {Object.values(DESKTOP_ROLE_LABELS).slice(0, -1).join(', ')} and{' '}
            {Object.values(DESKTOP_ROLE_LABELS).at(-1)} work at a desk — they sign in to the command
            console on a computer, not here.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
