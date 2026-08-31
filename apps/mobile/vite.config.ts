import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The basemap belongs to no app; this one borrows it.
 *
 * `public/map` is a symlink to the repo-level `assets/map`, so in dev Vite
 * serves the 17 MB extract straight through it — including HTTP Range, which
 * pmtiles requires and which a hand-rolled middleware would have to
 * reimplement.
 *
 * At build time that symlink would be *followed* and the whole extract copied
 * into dist/, putting a second 17 MB of identical tiles in the image. It is
 * dropped instead: the API serves `/map` from MAP_DIR unconditionally (see
 * spa.py::mount_map), so the built app finds it at the same path it uses in
 * dev. One extract in git, one on disk, one in the image.
 */
function borrowBasemap(): Plugin {
  return {
    name: 'urban-twin:borrow-basemap',
    apply: 'build',
    closeBundle() {
      const copied = path.resolve(__dirname, 'dist/map');
      if (fs.existsSync(copied)) {
        fs.rmSync(copied, { recursive: true, force: true });
        this.info?.('dropped dist/map — the API serves /map from MAP_DIR');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), borrowBasemap()],
  /**
   * `/` in dev, `/m/` in the production image.
   *
   * `/` is left free in the one-container deployment for a console build
   * (WEB_DIST), so this app is mounted beside it rather than at the root. Everything that needs to know reads
   * `import.meta.env.BASE_URL` — the router's basename, the service worker
   * scope, the manifest — so there is exactly one place the prefix is set and
   * no screen has to hardcode it.
   */
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // 5176, not 5173 — the console repo's dev server uses that one, and the
    // two run side by side. host: true so a real phone on the wifi can load it,
    // which is the entire point of this app.
    port: 5176,
    host: true,
    fs: {
      // public/map is a symlink to ../../../assets/map (one copy of the 17 MB
      // basemap, shared). Vite refuses to serve a symlink that escapes the
      // project root unless the target is explicitly allowed.
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
