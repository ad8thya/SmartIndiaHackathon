import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // host: true is what makes this reachable from a real phone on the same
    // wifi — the command centre iframes the exact same URL
    host: true,
  },
});
