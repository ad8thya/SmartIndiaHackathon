import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

/** '/' in dev, '/m' in the production image — see vite.config.ts's `base`. */
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={BASENAME}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

/**
 * The service worker is registered in production builds only.
 *
 * In dev it fights Vite: the SW caches a module graph that HMR is
 * simultaneously replacing, and you get a stale app that only a hard reload
 * fixes. `make dev` should never need a hard reload, so it does not get a
 * service worker — installability is a property of the built app.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    // Scope is the base, not '/': a worker registered at /m/ may only control
    // /m/, and asking for a wider scope than its own path is rejected.
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // A failed registration costs offline support, not the app. Nothing the
      // user can act on, so nothing is shown.
    });
  });
}
