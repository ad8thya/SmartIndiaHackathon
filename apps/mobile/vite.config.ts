import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The basemap belongs to apps/web; this app borrows it.
 *
 * `public/map` is a symlink to `apps/web/public/map`, so in dev Vite serves
 * the 30 MB extract straight through it — including HTTP Range, which pmtiles
 * requires and which a hand-rolled middleware would have to reimplement.
 *
 * At build time that symlink would be *followed* and the whole extract copied
 * into dist/, putting a second 30 MB of identical tiles in the image. It is
 * dropped instead: in production both apps are served from one origin, so
 * `/map/...` already resolves to apps/web's copy (see spa.py's mounts). One
 * extract in git, one on disk, one in the image.
 */
function borrowBasemap(): Plugin {
  return {
    name: 'urban-twin:borrow-basemap',
    apply: 'build',
    closeBundle() {
      const copied = path.resolve(__dirname, 'dist/map');
      if (fs.existsSync(copied)) {
        fs.rmSync(copied, { recursive: true, force: true });
        this.info?.('dropped dist/map — production serves apps/web\'s copy at /map');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), borrowBasemap()],
  /**
   * `/` in dev, `/m/` in the production image.
   *
   * apps/web owns `/` in the one-container deployment, so this app is mounted
   * beside it rather than replacing it. Everything that needs to know reads
   * `import.meta.env.BASE_URL` — the router's basename, the service worker
   * scope, the manifest — so there is exactly one place the prefix is set and
   * no screen has to hardcode it.
   */
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // 5176, not 5173 — apps/web owns that one and both run side by side under
    // `make dev`. host: true so a real phone on the same wifi can load it,
    // which is the entire point of this app.
    port: 5176,
    host: true,
    fs: {
      // public/map is a symlink into apps/web/public/map (one copy of the 30 MB
      // basemap, not two). Vite refuses to serve a symlink that escapes the
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
