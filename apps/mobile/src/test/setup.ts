import '@testing-library/jest-dom/vitest';

/**
 * jsdom ships neither of these and maplibre-gl touches both during import.
 * Stubbing them here keeps a component test from having to care whether the
 * module it renders happens to pull in the map.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

/**
 * maplibre spins its worker up at *import* time — `setWorkerUrl(URL
 * .createObjectURL(new Blob([...])))` runs as a side effect of the module, not
 * when a map is constructed. jsdom implements neither method, so any test that
 * so much as imports a file that imports maplibre dies on the import with an
 * error that names neither the map nor the test. Stubbing both is what lets
 * the router tests render an App that has a map screen in its route table.
 */
globalThis.URL.createObjectURL ??= (() => 'blob:urban-twin/stub') as typeof URL.createObjectURL;
globalThis.URL.revokeObjectURL ??= (() => {}) as typeof URL.revokeObjectURL;

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
