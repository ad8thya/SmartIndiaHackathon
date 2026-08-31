/**
 * Tabbed panel host. Owned by M6.
 *
 * The contract with the five panel owners, in one place:
 *   · every panel receives exactly `PanelProps` — { events, roads, selected, onSelect }
 *   · every panel is wrapped in an ErrorBoundary, so a crash is contained
 *   · M6 owns this file and the tab list; M1–M4 own their panel files and
 *     nothing else in this directory
 */

import { AlertTriangle, Activity, GitBranch, Inbox, Sparkles, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ErrorBoundary } from './ErrorBoundary';
import { getScope } from '../lib/roleScope';
import type { PanelProps } from '../lib/types';

import { DefectsPanel } from '../panels/DefectsPanel';
import { TrafficPanel } from '../panels/TrafficPanel';
import { WhatIfPanel } from '../panels/WhatIfPanel';
import { RiskPanel } from '../panels/RiskPanel';
import { IncidentsPanel } from '../panels/IncidentsPanel';
import { IntelligencePanel } from '../panels/IntelligencePanel';
import { ReportsPanel } from '../panels/ReportsPanel';

interface Tab {
  id: string;
  label: string;
  owner: string;
  icon: React.ReactNode;
  Component: (props: PanelProps) => JSX.Element;
  /** road-centric panels select roads; the rest select events */
  selects: 'event' | 'road';
}

const TABS: Tab[] = [
  { id: 'defects', label: 'Defects', owner: 'M1', icon: <TriangleAlert size={14} />, Component: DefectsPanel, selects: 'event' },
  { id: 'traffic', label: 'Traffic', owner: 'M2', icon: <Activity size={14} />, Component: TrafficPanel, selects: 'road' },
  { id: 'whatif', label: 'What-if', owner: 'M2', icon: <GitBranch size={14} />, Component: WhatIfPanel, selects: 'road' },
  { id: 'risk', label: 'Risk', owner: 'M3', icon: <AlertTriangle size={14} />, Component: RiskPanel, selects: 'event' },
  { id: 'incidents', label: 'Incidents', owner: 'M4', icon: <ShieldAlert size={14} />, Component: IncidentsPanel, selects: 'event' },
  // Citizen reports read their own slice of the store rather than PanelProps —
  // a report is not an event, so `events` has nothing to give it. It still
  // takes the props: the tab contract is one shape for every panel, and a
  // panel that quietly needed a different one would be the start of six.
  { id: 'reports', label: 'Reports', owner: 'M5', icon: <Inbox size={14} />, Component: ReportsPanel, selects: 'event' },
  { id: 'intelligence', label: 'Intelligence', owner: 'M3', icon: <Sparkles size={14} />, Component: IntelligencePanel, selects: 'road' },
];

export function Sidebar() {
  const activePanel = useStore((s) => s.activePanel);
  const setPanel = useStore((s) => s.setPanel);
  const events = useStore((s) => s.visibleEvents());
  const roads = useStore((s) => s.roads);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const selectedRoadId = useStore((s) => s.selectedRoadId);
  const selectEvent = useStore((s) => s.selectEvent);
  const selectRoad = useStore((s) => s.selectRoad);
  const role = useStore((s) => s.role);
  const scopeOverridden = useStore((s) => s.scopeOverridden);

  // null scope (no role, unrecognised role, or a role apps/roles keeps for
  // itself) or an explicit override both mean "show every panel" — the same
  // safe-default path, not two. The scope indicator + "Show everything" /
  // "All roles" controls live in TopBar, next to each other — this just
  // reads the same state to decide which panels are in the tab list.
  const scope = scopeOverridden ? null : getScope(role);
  const tabs = scope ? TABS.filter((candidate) => scope.panels.includes(candidate.id)) : TABS;

  const tab = tabs.find((candidate) => candidate.id === activePanel) ?? tabs[0] ?? TABS[0];
  const { Component } = tab;

  const props: PanelProps = {
    events,
    roads,
    selected: tab.selects === 'road' ? selectedRoadId : selectedEventId,
    onSelect: tab.selects === 'road' ? selectRoad : selectEvent,
  };

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-white/5 bg-ink-800">
      <nav className="flex shrink-0 border-b border-white/5" role="tablist">
        {tabs.map((candidate) => {
          const active = candidate.id === tab.id;
          return (
            <button
              key={candidate.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setPanel(candidate.id)}
              title={`${candidate.label} — owned by ${candidate.owner}`}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                active ? 'text-sky-300' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {candidate.icon}
              <span className="tracking-wider">{candidate.label}</span>
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sky-400" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1">
        {/* the boundary label names the owner, so a crash routes itself */}
        <ErrorBoundary key={tab.id} label={`${tab.label}Panel (${tab.owner})`}>
          <Component {...props} />
        </ErrorBoundary>
      </div>
    </aside>
  );
}
