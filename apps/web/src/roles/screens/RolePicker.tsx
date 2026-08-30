/**
 * The landing screen: "who are you sitting as today?"
 *
 * There is no login anywhere in Urban Twin yet — this IS the auth for the
 * demo, the same honest shortcut as the field app's hardcoded MY_TEAM. Picking
 * a role navigates to `/app/<role>`, and the router decides from there whether
 * that role gets the desktop console or a phone-shaped screen.
 *
 * Grouped rather than listed flat, because the eight roles are not eight
 * equivalent choices: three of them run the city, two enforce and respond, and
 * two are members of the public who should never see an operator console.
 */

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { useRoles } from '../store';
import { ROLES, type RoleId } from '../roles/config';
import { EASE, MOTION } from '../../lib/tokens';

interface Group {
  key: string;
  title: string;
  blurb: string;
  roles: RoleId[];
}

const GROUPS: Group[] = [
  {
    key: 'municipal',
    title: 'Municipal',
    blurb: 'Runs the city: sees the whole survey, owns the repair budget.',
    roles: ['municipal-authority', 'road-maintenance', 'urban-planner', 'smart-city-admin'],
  },
  {
    key: 'police',
    title: 'Police & emergency',
    blurb: 'Responds to what the fleet sees — incidents, conflicts, congestion.',
    roles: ['traffic-police', 'emergency-team'],
  },
  {
    key: 'public',
    title: 'Public',
    blurb: 'Phone-shaped, single purpose. Sees only what the city has confirmed.',
    roles: ['citizen', 'bus-driver'],
  },
];

export function RolePicker() {
  const chooseRole = useRoles((s) => s.chooseRole);

  return (
    <div className="min-h-full overflow-y-auto bg-paper px-5 py-10 lg:px-8 lg:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION.base, ease: EASE }}
        >
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm text-white">
              U
            </span>
            <div className="leading-tight">
              <div className="text-sm tracking-tight text-ink">URBAN TWIN</div>
              <div className="text-[11px] text-muted">Chennai · Smart India Hackathon 2026</div>
            </div>
          </div>

          <h1 className="text-2xl tracking-tight text-ink">Choose a role to enter</h1>
          <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-muted">
            Every role is a view onto the same live data. There is no sign-in yet — picking one
            here is how the demo says who you are, and you can switch at any time.
          </p>
        </motion.div>

        <div className="mt-9 space-y-8">
          {GROUPS.map((group, groupIndex) => (
            <motion.section
              key={group.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: MOTION.base, ease: EASE, delay: 0.05 + groupIndex * 0.06 }}
            >
              <div className="mb-3">
                <h2 className="text-[13px] text-ink">{group.title}</h2>
                <p className="text-[11px] text-muted">{group.blurb}</p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {group.roles.map((id, index) => {
                  const config = ROLES[id];
                  const Icon = config.icon;
                  return (
                    <motion.button
                      key={id}
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: MOTION.base,
                        ease: EASE,
                        delay: 0.08 + groupIndex * 0.06 + index * 0.03,
                      }}
                      onClick={() => chooseRole(id)}
                      className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2 text-accent">
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{config.label}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {config.tagline}
                        </span>
                      </span>
                      <ArrowRight
                        size={15}
                        className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </motion.button>
                  );
                })}
              </div>
            </motion.section>
          ))}
        </div>

        <p className="mt-10 max-w-[60ch] text-[11px] leading-relaxed text-muted">
          Role selection here is a demo convenience, not access control — there is no
          authentication in this build. The one place it changes the data rather than the
          layout is the Citizen view, which is served only confirmed, acted-on reports.
        </p>
      </div>
    </div>
  );
}
