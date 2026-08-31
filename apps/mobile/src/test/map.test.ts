/**
 * The basemap has to render with the network off. These assert the properties
 * that make that true, because the failure mode is invisible on a developer's
 * machine — a style that reaches for a CDN works perfectly until the venue
 * wifi dies, which is the one moment it matters.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMapStyle, INITIAL_VIEW } from '../lib/mapStyle';
import { isPublic, PUBLIC_STATUSES, STATUS_HEX } from '../lib/display';
import { toPublicEvent } from '../lib/useEvents';
import { WORKFLOW_ORDER } from '../lib/types';

const ROOT = resolve(__dirname, '../..');

describe('the basemap is local', () => {
  it('is a symlink to apps/web, not a second copy of the extract', () => {
    const link = resolve(ROOT, 'public/map');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    // Resolving it must land inside apps/web — one extract on disk, not two.
    expect(realpathSync(link)).toContain('apps/web/public/map');
  });

  it('ships the tiles, the glyphs and the sprites', () => {
    const tiles = resolve(ROOT, 'public/map/chennai.pmtiles');
    expect(existsSync(tiles)).toBe(true);
    // A git-lfs pointer or a truncated clone is a few hundred bytes and fails
    // in a way that looks like a rendering bug rather than a missing file.
    expect(statSync(tiles).size).toBeGreaterThan(1_000_000);
    expect(existsSync(resolve(ROOT, 'public/map/fonts'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'public/map/sprites'))).toBe(true);
  });

  it('builds a style that reaches for nothing off this origin', () => {
    const style = buildMapStyle();
    const urls = JSON.stringify(style).match(/https?:\/\/[^"']+/g) ?? [];
    for (const url of urls) {
      // jsdom's origin. The point is that every URL is same-origin — no CDN,
      // no tile server, no api key.
      expect(url.startsWith(window.location.origin)).toBe(true);
    }
    expect(JSON.stringify(style)).toContain('pmtiles://');
    expect(style.layers.length).toBeGreaterThan(20);
  });

  it('paints its layers — a themed style with empty paint still "loads"', () => {
    // Passing a theme *name* to the named `layers()` export instead of the
    // default export returns ~56 layers with no paint: an invisible map that
    // reports as fine. Assert at least one layer has real paint.
    const painted = buildMapStyle().layers.filter(
      (layer) => 'paint' in layer && Object.keys(layer.paint ?? {}).length > 0,
    );
    expect(painted.length).toBeGreaterThan(10);
  });

  it('starts over Chennai, not the null island', () => {
    expect(INITIAL_VIEW.lat).toBeGreaterThan(12);
    expect(INITIAL_VIEW.lat).toBeLessThan(14);
    expect(INITIAL_VIEW.lon).toBeGreaterThan(79);
    expect(INITIAL_VIEW.lon).toBeLessThan(81);
  });
});

describe('the citizen privacy filter', () => {
  it('publishes no rung below AUTHORITY_NOTIFIED, and never REJECTED', () => {
    expect(PUBLIC_STATUSES).not.toContain('DETECTED');
    expect(PUBLIC_STATUSES).not.toContain('AI_VERIFIED');
    expect(PUBLIC_STATUSES).not.toContain('REJECTED');
    expect(isPublic('AUTHORITY_NOTIFIED')).toBe(true);
    expect(isPublic('RESOLVED')).toBe(true);
  });

  it('strips operator internals rather than hiding them', () => {
    const stripped = toPublicEvent({
      event_id: 'e1',
      lat: 13.0,
      lon: 80.2,
      road_segment_id: 'SEG-27B-000',
      detection_class: 'POTHOLE',
      severity: 'LARGE',
      fused_confidence: 0.91,
      observation_count: 7,
      distinct_bus_count: 3,
      first_seen: '2026-08-21T09:00:00Z',
      last_seen: '2026-08-21T09:30:00Z',
      status: 'MAINTENANCE_ASSIGNED',
      assigned_team: 'GCC-Zone-13-Adyar',
      sla_due: '2026-08-24T09:00:00Z',
      evidence_uris: ['s3://urban-twin/evidence/e1.jpg'],
    });

    // Not "undefined" — absent. A key that is merely blank is one refactor
    // away from being filled in again.
    for (const secret of [
      'fused_confidence',
      'observation_count',
      'distinct_bus_count',
      'assigned_team',
      'sla_due',
      'evidence_uris',
    ]) {
      expect(secret in stripped).toBe(false);
    }
    expect(JSON.stringify(stripped)).not.toContain('GCC-Zone-13-Adyar');
    expect(JSON.stringify(stripped)).not.toContain('0.91');
  });

  it('has a marker colour for every rung on the ladder', () => {
    // A missing entry renders `undefined` as the fill, which maplibre draws as
    // black — indistinguishable from a deliberate colour.
    for (const status of WORKFLOW_ORDER) {
      expect(STATUS_HEX[status]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
