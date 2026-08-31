/**
 * Active incidents. Bigger and sparser than anything else in the app.
 *
 * The type scale here is deliberately one step up and the density one step
 * down from the other roles. This screen is read at speed, standing up,
 * possibly in a moving vehicle, by someone who has about two seconds to decide
 * whether an item is theirs. Fitting more on it would make it worse.
 *
 * Not built with the block renderer: the cards on this screen are a different
 * shape from every other card in the app on purpose, and forcing them through
 * the shared `InfoCard` would either constrain them or bloat it.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Ambulance, Check, Clock, MapPin, Navigation, ShieldAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { classLabel, timeAgo } from '../../lib/display';
import { useDispatch } from '../../store/dispatch';
import { haptic } from '../../lib/haptics';
import type { IncidentReport } from '../../lib/types';

/** Collisions outrank everything; a near miss outranks nothing. */
function severityOf(incident: IncidentReport): { tone: string; label: string; rank: number } {
  if (incident.incident_class === 'COLLISION')
    return { tone: 'bg-danger', label: 'Collision', rank: 0 };
  if (incident.incident_class === 'RASH_DRIVING')
    return { tone: 'bg-amber', label: 'Rash driving', rank: 1 };
  if (incident.incident_class === 'NEAR_MISS')
    return { tone: 'bg-amber', label: 'Near miss', rank: 2 };
  return { tone: 'bg-accent', label: classLabel(incident.incident_class), rank: 3 };
}

export function EmergencyAlertsScreen() {
  const [incidents, setIncidents] = useState<IncidentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const responses = useDispatch((s) => s.responses);
  const setResponse = useDispatch((s) => s.set);

  useEffect(() => {
    void api
      .incidents({ limit: 50 })
      .then(setIncidents)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'could not load incidents'),
      );
  }, []);

  const active = useMemo(
    () =>
      (incidents ?? [])
        .filter((incident) => responses[incident.incident_id]?.state !== 'closed')
        .sort((a, b) => {
          const bySeverity = severityOf(a).rank - severityOf(b).rank;
          return bySeverity !== 0
            ? bySeverity
            : new Date(b.ts).getTime() - new Date(a.ts).getTime();
        }),
    [incidents, responses],
  );

  if (error) {
    return (
      <Centered icon={AlertCircle} title="Cannot reach the control room">
        Incidents could not be loaded. This screen fills in as soon as you have signal.
      </Centered>
    );
  }

  if (incidents === null) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-4">
        {[0, 1].map((index) => (
          <div key={index} className="ut-card animate-pulse p-5">
            <div className="h-4 w-1/3 rounded bg-ink/[0.07]" />
            <div className="mt-3 h-6 w-3/4 rounded bg-ink/[0.07]" />
          </div>
        ))}
      </div>
    );
  }

  if (active.length === 0) {
    return (
      <Centered icon={ShieldAlert} title="No active incidents">
        Collisions and near misses reported by the fleet appear here the moment they are detected.
      </Centered>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-10 pt-3">
      {active.map((incident, index) => {
        const severity = severityOf(incident);
        const response = responses[incident.incident_id]?.state;
        return (
          <motion.article
            key={incident.incident_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 4) * 0.05 }}
            className="ut-card relative overflow-hidden"
          >
            {/* The severity strip. On this screen it is the first thing read
                and it is the full height of the card for that reason. */}
            <span className={`absolute inset-y-0 left-0 w-1.5 ${severity.tone}`} />

            <div className="py-5 pl-6 pr-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[1.2px] text-ink-muted">
                  {severity.label}
                </span>
                <span className="flex items-center gap-1 text-[12px] font-medium text-ink-soft">
                  <Clock size={13} />
                  {timeAgo(incident.ts)}
                </span>
              </div>

              <h2 className="mt-2 text-[20px] font-medium leading-snug tracking-[-0.3px]">
                {incident.narrative}
              </h2>

              <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
                <MapPin size={15} className="flex-none text-ink-faint" />
                {incident.road_segment_id ??
                  `${incident.lat.toFixed(4)}, ${incident.lon.toFixed(4)}`}
              </div>

              {response ? (
                <div className="mt-4 flex items-center gap-2 rounded-[12px] bg-emerald/10 px-4 py-3 text-[14px] font-medium text-emerald">
                  <Check size={17} />
                  {response === 'accepted' ? 'Accepted by you' : 'Unit dispatched'}
                </div>
              ) : null}

              <div className="mt-4 flex gap-2.5">
                {!response ? (
                  <button
                    onClick={() => {
                      haptic('confirm');
                      setResponse(incident.incident_id, 'accepted');
                    }}
                    className="ut-touch flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-accent px-4 py-3.5 text-[16px] font-medium text-white"
                  >
                    <Check size={18} /> Accept
                  </button>
                ) : null}

                <button
                  onClick={() => {
                    haptic('confirm');
                    setResponse(incident.incident_id, 'dispatched');
                  }}
                  className={`ut-touch flex flex-1 items-center justify-center gap-2 rounded-[12px] px-4 py-3.5 text-[16px] font-medium ${
                    response === 'dispatched'
                      ? 'border border-line bg-card text-ink-soft'
                      : 'bg-danger text-white'
                  }`}
                >
                  <Ambulance size={18} />
                  {response === 'dispatched' ? 'Dispatched' : 'Dispatch'}
                </button>

                {response ? (
                  <a
                    href={`geo:${incident.lat},${incident.lon}?q=${incident.lat},${incident.lon}`}
                    aria-label="Navigate to the scene"
                    className="ut-touch flex flex-none items-center justify-center rounded-[12px] border border-line bg-card px-4"
                  >
                    <Navigation size={18} className="text-accent" />
                  </a>
                ) : null}
              </div>
            </div>
          </motion.article>
        );
      })}

      {/* The limitation, next to the buttons it applies to. Not in a README. */}
      <p className="px-1 pt-1 text-[12px] leading-relaxed text-ink-faint">
        Accept and Dispatch are recorded on this phone only — Urban Twin has no dispatch service
        yet, so the control room is not told. Use your radio as usual.
      </p>
    </div>
  );
}

function Centered({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldAlert;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-ink/[0.05] text-ink-muted">
        <Icon size={28} />
      </span>
      <h1 className="mt-4 text-[18px] font-medium">{title}</h1>
      <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}
