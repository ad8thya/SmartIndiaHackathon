import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5175,
    // host: true is what makes this reachable from a real phone on the same
    // wifi (same pattern as apps/field and apps/command) — the api's
    // CORS_ORIGIN_REGEX (services/cloud/api/config.py) is what then lets that
    // phone's fetch() calls through.
    host: true,
  },
});
