/** Helper tests — the maths the panels depend on. Owned by M6. */

import { describe, expect, it } from 'vitest';
import { congestionColor, hexToRgba, statusColor } from '../lib/colors';
import { signedMinutes, slaLabel, timeAgo } from '../lib/format';

describe('colours', () => {
  it('parses hex', () => {
    expect(hexToRgba('#38bdf8')).toEqual([56, 189, 248, 255]);
    expect(hexToRgba('#fff', 128)).toEqual([255, 255, 255, 128]);
  });

  it('maps the workflow to grey → amber → green', () => {
    const [dr] = statusColor('DETECTED');
    const [, , wb] = statusColor('AUTHORITY_NOTIFIED');
    const [, rg] = statusColor('RESOLVED');
    expect(dr).toBeLessThan(200); // grey
    expect(wb).toBeLessThan(100); // amber has little blue
    expect(rg).toBeGreaterThan(120); // green
  });

  it('escalates congestion colour with congestion', () => {
    const [lowR] = congestionColor(10);
    const [highR] = congestionColor(95);
    expect(highR).toBeGreaterThan(lowR);
  });
});

describe('formatting', () => {
  it('formats relative time', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(timeAgo('2026-08-21T11:59:30Z', now)).toBe('30s ago');
    expect(timeAgo('2026-08-21T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-08-20T12:00:00Z', now)).toBe('1d ago');
  });

  it('always shows the sign on a delta', () => {
    expect(signedMinutes(6)).toBe('+6.0 min');
    expect(signedMinutes(-2.5)).toBe('−2.5 min');
    expect(signedMinutes(0)).toBe('0.0 min');
  });

  it('flags an overdue SLA', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    expect(slaLabel('2026-08-22T12:00:00Z', now)).toEqual({ text: '1d left', breached: false });
    expect(slaLabel('2026-08-20T12:00:00Z', now).breached).toBe(true);
    expect(slaLabel(null, now)).toEqual({ text: 'no SLA', breached: false });
  });
});
