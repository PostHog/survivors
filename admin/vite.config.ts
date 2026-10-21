import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The built app lives under /_admin/ in the Worker's static assets; the Worker serves its index.html at /admin (after sign-in).
// In `npm run dev:admin` the API and sign-in go to a running `npm run dev` (wrangler on :8787); cookies are per host, not per port,
// so signing in on localhost:8787 (with DEV_LOGIN_EMAIL) also signs you in here.
export default defineConfig({
  base: '/_admin/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src'), '@worker': path.resolve(import.meta.dirname, '../src') },
  },
  build: { outDir: '../public/_admin', emptyOutDir: true, sourcemap: false },
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:8787', '/oauth': 'http://localhost:8787', '/g': 'http://localhost:8787' },
  },
});
