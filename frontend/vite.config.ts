import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const BACKEND = process.env.VITE_DEV_API ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: '../backend/src/meters/static',
    emptyOutDir: true,
    // Source-Maps in Produktion AUS — exposiert sonst die unminifizierte
    // Komponentenstruktur im public Repo. Für Dev (`pnpm dev`) erzeugt Vite
    // ohnehin transparente Maps zur Laufzeit.
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
  },
});
