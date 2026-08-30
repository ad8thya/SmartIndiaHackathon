/**
 * Role scoping is a demo convenience, not access control — but the one thing
 * it must never do is show a blank or half-scoped screen. This file exists
 * because of a specific ask: "if ?role= is missing, malformed, or
 * unrecognised, command shows EVERYTHING... add a test for the missing-param
 * case specifically." Owned by M6.
 */

import { describe, expect, it } from 'vitest';
import { getScope, resolveRole, ROLE_SCOPES } from '../lib/roleScope';
import { useStore } from '../store/useStore';

describe('resolveRole — safe default on anything unrecognised', () => {
  it('missing param', () => {
    expect(resolveRole(null)).toBeNull();
  });

  it('empty string', () => {
    expect(resolveRole('')).toBeNull();
  });

  it('malformed / garbage value', () => {
    expect(resolveRole('not-a-real-role')).toBeNull();
    expect(resolveRole('municipal_authority')).toBeNull(); // underscore, not hyphen
    expect(resolveRole('MUNICIPAL-AUTHORITY')).toBeNull(); // case-sensitive on purpose
  });

  it('a real role that command does not scope (lives in apps/roles instead)', () => {
    // bus-driver and citizen are valid RoleIds — just not command-eligible.
    // resolveRole should still recognise them; getScope is what says "no".
    expect(resolveRole('bus-driver')).toBe('bus-driver');
    expect(getScope('bus-driver')).toBeNull();
    expect(resolveRole('citizen')).toBe('citizen');
    expect(getScope('citizen')).toBeNull();
  });

  it('a real, command-eligible role resolves and has a scope', () => {
    expect(resolveRole('traffic-police')).toBe('traffic-police');
    expect(getScope('traffic-police')).not.toBeNull();
  });
});

describe('getScope(null) and unscoped roles both mean "show everything"', () => {
  it('null role → null scope', () => {
    expect(getScope(null)).toBeNull();
  });

  it('every command-eligible scope has at least one panel and one KPI — never an empty restriction', () => {
    for (const [role, scope] of Object.entries(ROLE_SCOPES)) {
      expect(scope!.panels.length, `${role} has zero panels`).toBeGreaterThan(0);
      expect(scope!.kpis.length, `${role} has zero KPIs`).toBeGreaterThan(0);
    }
  });
});

describe('useStore.initRole — the actual wiring behind ?role=', () => {
  const DEFAULT_PANEL = 'defects';

  it('missing param: opening localhost:5173 directly leaves defaults untouched', () => {
    useStore.setState({ role: null, activePanel: DEFAULT_PANEL, filters: useStore.getState().filters });
    useStore.getState().initRole(null);
    const state = useStore.getState();
    expect(state.role).toBeNull();
    expect(state.activePanel).toBe(DEFAULT_PANEL);
    expect(state.filters.classes).toEqual([]);
  });

  it('malformed param behaves identically to no param', () => {
    useStore.getState().initRole('totally-invalid');
    const state = useStore.getState();
    expect(state.role).toBeNull();
    expect(state.activePanel).toBe(DEFAULT_PANEL);
    expect(state.filters.classes).toEqual([]);
  });

  it('a non-command role (bus-driver) resolves but applies no scope', () => {
    useStore.getState().initRole('bus-driver');
    const state = useStore.getState();
    expect(state.role).toBe('bus-driver');
    expect(state.activePanel).toBe(DEFAULT_PANEL); // unchanged — no scope to seed from
    expect(state.filters.classes).toEqual([]);
  });

  it('a command-eligible role narrows the panel and seeds class filters', () => {
    useStore.getState().initRole('road-maintenance');
    const state = useStore.getState();
    expect(state.role).toBe('road-maintenance');
    expect(state.activePanel).toBe('defects');
    expect(state.filters.classes.length).toBeGreaterThan(0);
  });

  it('overrideScope clears the restriction without touching which role is displayed', () => {
    useStore.getState().initRole('road-maintenance');
    useStore.getState().overrideScope();
    const state = useStore.getState();
    expect(state.scopeOverridden).toBe(true);
    expect(state.filters.classes).toEqual([]);
    expect(state.role).toBe('road-maintenance'); // still shown, just unrestricted
  });
});
