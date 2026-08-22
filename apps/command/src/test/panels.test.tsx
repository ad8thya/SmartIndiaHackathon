/**
 * Panel contract tests. Owned by M6.
 *
 * These do NOT test what any panel renders — that is each owner's business.
 * They test the *contract between* the shell and the panels, which is the thing
 * that breaks when six people work in parallel:
 *
 *   · every panel accepts exactly PanelProps
 *   · every panel survives empty data (day 1, and any time the API is down)
 *   · a panel that throws is contained by its ErrorBoundary
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DefectsPanel } from '../panels/DefectsPanel';
import { TrafficPanel } from '../panels/TrafficPanel';
import { WhatIfPanel } from '../panels/WhatIfPanel';
import { RiskPanel } from '../panels/RiskPanel';
import { IncidentsPanel } from '../panels/IncidentsPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import type { PanelProps, RoadCondition, UTEvent } from '../lib/types';

const EMPTY: PanelProps = { events: [], roads: [], selected: null, onSelect: () => {} };

const EVENT: UTEvent = {
  event_id: 'e1',
  lat: 13.0067,
  lon: 80.257,
  road_segment_id: 'SEG-27B-000',
  detection_class: 'POTHOLE',
  severity: 'LARGE',
  fused_confidence: 0.97,
  observation_count: 11,
  distinct_bus_count: 3,
  first_seen: new Date(Date.now() - 86_400_000).toISOString(),
  last_seen: new Date().toISOString(),
  status: 'AUTHORITY_NOTIFIED',
  assigned_team: 'GCC-Zone-13-Adyar',
  sla_due: new Date(Date.now() + 86_400_000).toISOString(),
  evidence_uris: ['s3://a.jpg'],
};

const ROAD: RoadCondition = {
  road_id: 'SEG-27B-000',
  name: 'Sardar Patel Road',
  density: 78.4,
  avg_speed_kmph: 14.2,
  congestion_pct: 71,
  pci_score: 46.5,
  defect_counts: { POTHOLE: 6 },
  bus_delay_min: 9.5,
  risk_level: 'HIGH',
};

const POPULATED: PanelProps = {
  events: [EVENT],
  roads: [ROAD],
  selected: null,
  onSelect: () => {},
};

const PANELS = [
  ['DefectsPanel (M1)', DefectsPanel],
  ['TrafficPanel (M2)', TrafficPanel],
  ['WhatIfPanel (M2)', WhatIfPanel],
  ['RiskPanel (M3)', RiskPanel],
  ['IncidentsPanel (M4)', IncidentsPanel],
] as const;

describe('every panel honours the shared PanelProps contract', () => {
  it.each(PANELS)('%s renders with empty data', (_label, Panel) => {
    const { container } = render(<Panel {...EMPTY} />);
    expect(container.firstChild).toBeTruthy();
  });

  it.each(PANELS)('%s renders with populated data', (_label, Panel) => {
    const { container } = render(<Panel {...POPULATED} />);
    expect(container.firstChild).toBeTruthy();
  });

  it.each(PANELS)('%s renders when an event is selected', (_label, Panel) => {
    const { container } = render(<Panel {...POPULATED} selected={EVENT.event_id} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('panel isolation', () => {
  function Exploding(): JSX.Element {
    throw new Error('M1 shipped a bad render');
  }

  it('contains a crash and names the owner', () => {
    // React logs the boundary catch; silence it for this one assertion
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary label="DefectsPanel (M1)">
        <Exploding />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/DefectsPanel \(M1\) crashed/)).toBeInTheDocument();
    expect(screen.getByText(/M1 shipped a bad render/)).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('defects panel only shows infrastructure classes', () => {
  it('excludes pedestrian and incident classes', () => {
    render(
      <DefectsPanel
        {...POPULATED}
        events={[EVENT, { ...EVENT, event_id: 'e2', detection_class: 'PEDESTRIAN_RISK' }]}
      />,
    );
    // one defect row, and the footer count agrees
    expect(screen.getByText(/1 of 1 defects/)).toBeInTheDocument();
  });
});
