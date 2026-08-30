/** KPI strip + connection state. Owned by M6. */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertOctagon,
  Bus,
  Flame,
  Gauge,
  Layers,
  Radio,
  Route as RouteIcon,
  Smartphone,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { getScope } from '../lib/roleScope';
import { compact } from '../lib/format';

/** The role picker is the landing route of this same app now. */
const ALL_ROLES_URL = '/';

function Kpi({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'warn' | 'good';
}) {
  const toneClass =
    tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-300' : 'text-sky-300';
  return (
    <div className="flex items-center gap-2.5 border-r border-white/5 px-4 last:border-none">
      <span className={toneClass}>{icon}</span>
      <div className="leading-tight">
        <div className="font-mono text-sm font-semibold text-slate-100">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export function TopBar() {
  const summary = useStore((s) => s.summary);
  const connection = useStore((s) => s.connection);
  const buses = useStore((s) => s.busList());
  const showHeatmap = useStore((s) => s.showHeatmap);
  const showBuildings = useStore((s) => s.showBuildings);
  const showPhone = useStore((s) => s.showPhone);
  const showRiskLayer = useStore((s) => s.showRiskLayer);
  const toggleHeatmap = useStore((s) => s.toggleHeatmap);
  const toggleBuildings = useStore((s) => s.toggleBuildings);
  const togglePhone = useStore((s) => s.togglePhone);
  const toggleRiskLayer = useStore((s) => s.toggleRiskLayer);
  const refreshSummary = useStore((s) => s.refreshSummary);
  const refreshRoads = useStore((s) => s.refreshRoads);
  const refreshIntelligence = useStore((s) => s.refreshIntelligence);
  const role = useStore((s) => s.role);
  const scopeOverridden = useStore((s) => s.scopeOverridden);
  const overrideScope = useStore((s) => s.overrideScope);
  const scope = scopeOverridden ? null : getScope(role);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSummary();
      void refreshRoads();
      void refreshIntelligence();
    }, 8000);
    return () => clearInterval(timer);
  }, [refreshIntelligence, refreshRoads, refreshSummary]);

  const connectionTone =
    connection === 'open'
      ? 'bg-emerald-400'
      : connection === 'connecting'
        ? 'bg-amber-400'
        : 'bg-red-400';

  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/5 bg-ink-800/90 backdrop-blur">
      <div className="flex items-center gap-3 pl-4 pr-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500/15 text-sky-300">
          <RouteIcon size={17} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight text-slate-100">URBAN TWIN</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">
            Chennai · Command Centre
          </div>
        </div>
      </div>

      {/* the two role affordances, together: what you're scoped to (if
          anything) and the escape hatch back to picking a different one —
          this is what makes "picker → role → back → different role" a
          rehearsable demo beat instead of a browser-back gamble */}
      <div className="flex items-center gap-1.5 border-l border-white/5 pl-3">
        {scope && (
          <span className="flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] text-sky-200">
            Scoped to {scope.label}
            <button
              type="button"
              onClick={overrideScope}
              title="This is a demo view, not access control — clear it any time"
              className="text-sky-300 hover:text-sky-100"
            >
              <X size={10} />
            </button>
          </span>
        )}
        <a
          href={ALL_ROLES_URL}
          className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-300 hover:border-white/20 hover:text-white"
          title="Back to the role picker"
        >
          <Users size={11} /> All roles
        </a>
      </div>

      <div className="flex flex-1 items-center overflow-x-auto">
        <Kpi icon={<Bus size={16} />} label="Buses online" value={String(buses.length || summary?.buses_online || 0)} />
        <Kpi icon={<Activity size={16} />} label="km surveyed" value={compact(summary?.km_surveyed_today ?? 0)} />
        <Kpi
          icon={<Flame size={16} />}
          label="Open events"
          value={String(summary?.open_events ?? 0)}
          tone="warn"
        />
        <Kpi
          icon={<Timer size={16} />}
          label="Avg speed"
          value={`${summary?.avg_network_speed_kmph?.toFixed(1) ?? '—'} km/h`}
        />
        <Kpi
          icon={<AlertOctagon size={16} />}
          label="SLA breaches"
          value={String(summary?.sla_breaches ?? 0)}
          tone={summary?.sla_breaches ? 'warn' : 'good'}
        />
      </div>

      <div className="flex items-center gap-1.5 pr-3">
        <ToggleButton active={showBuildings} onClick={toggleBuildings} title="3D buildings">
          <Layers size={15} />
        </ToggleButton>
        <ToggleButton active={showHeatmap} onClick={toggleHeatmap} title="Congestion heatmap">
          <Flame size={15} />
        </ToggleButton>
        <ToggleButton active={showRiskLayer} onClick={toggleRiskLayer} title="Urban risk bands">
          <Gauge size={15} />
        </ToggleButton>
        <ToggleButton active={showPhone} onClick={togglePhone} title="Field app (phone)">
          <Smartphone size={15} />
        </ToggleButton>

        <div className="ml-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-700 px-2.5 py-1">
          <motion.span
            className={`h-1.5 w-1.5 rounded-full ${connectionTone}`}
            animate={connection === 'open' ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
            transition={{ repeat: Infinity, duration: 2.2 }}
          />
          <Radio size={12} className="text-slate-500" />
          <span className="text-[10px] uppercase tracking-wider text-slate-400">{connection}</span>
        </div>
      </div>
    </header>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md border px-2 py-1.5 transition-colors ${
        active
          ? 'border-sky-400/40 bg-sky-500/15 text-sky-300'
          : 'border-white/10 bg-ink-700 text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
