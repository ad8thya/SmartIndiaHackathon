import '@testing-library/jest-dom/vitest';

/**
 * jsdom has no ResizeObserver, and recharts' ResponsiveContainer requires one.
 * Without this stub every panel that draws a chart fails to mount in tests —
 * which would make the shared-props contract test useless exactly where it
 * matters most.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// deck.gl / maplibre touch these during import in some code paths
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof matchMedia;
