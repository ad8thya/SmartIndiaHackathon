import { describe, expect, it } from 'vitest';
import { FUSABLE_CLASSES, WORKFLOW_ORDER } from '../lib/types';
import { ROUTE_COUNT, SCHOOL_ZONES } from '../lib/cityRef';

/**
 * These assert the *generated* layer, not this app's own code.
 *
 * apps/web and apps/mobile are separate builds that share one contract. The
 * failure mode worth catching early is the one that already bit this project
 * once (BUILD.md §5): a hand-edit to one copy of the types that nothing
 * notices until two clients disagree about what a status means. If `make
 * types` stops running, or someone edits types.ts directly, these go red.
 */
describe('generated contracts', () => {
  it('carries the full workflow ladder in escalation order', () => {
    expect(WORKFLOW_ORDER[0]).toBe('DETECTED');
    expect(WORKFLOW_ORDER).toContain('AUTHORITY_NOTIFIED');
    expect(WORKFLOW_ORDER.at(-1)).toBe('REJECTED');
  });

  it('only fuses classes that become work items', () => {
    // Plain PEDESTRIAN sightings are analytics input, not a backlog row —
    // fusing them once handed crews 30-day SLAs for people walking.
    expect(FUSABLE_CLASSES).not.toContain('PEDESTRIAN');
    expect(FUSABLE_CLASSES).toContain('POTHOLE');
  });

  it('knows the seeded network without hardcoding its size', () => {
    expect(ROUTE_COUNT).toBeGreaterThan(0);
    expect(SCHOOL_ZONES.length).toBeGreaterThan(0);
    for (const zone of SCHOOL_ZONES) {
      // Chennai, not the null island — a swapped lat/lon lands in the sea off
      // Somalia and the map silently pans to nowhere.
      expect(zone.lat).toBeGreaterThan(12);
      expect(zone.lat).toBeLessThan(14);
      expect(zone.lon).toBeGreaterThan(79);
      expect(zone.lon).toBeLessThan(81);
    }
  });
});
