import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const BACKEND = process.env.VITE_DEV_API ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [
    {
      name: 'inject-font-preload',
      // Nach build: in der erzeugten index.html die emittierten WOFF2-Hashes
      // für inter-tight 400 + 600 als <link rel="preload"> in den <head>
      // einsetzen. So bleibt der Hash auch nach Re-Builds korrekt.
      transformIndexHtml: {
        order: 'post' as const,
        handler(html, ctx) {
          if (!ctx.bundle) return html; // dev: kein Hash, skip
          // Nur .woff2 — der Filter im Patch matchte ueber includes() auch
          // die .woff-Fallbacks und liess den Browser sie mit dem falschen
          // type="font/woff2"-Hint laden (doppelte Bytes Above-the-Fold).
          const fonts = Object.keys(ctx.bundle).filter(
            (f) =>
              f.endsWith('.woff2') &&
              (f.includes('inter-tight-latin-400-normal') ||
                f.includes('inter-tight-latin-600-normal')),
          );
          const tags = fonts
            .map(
              (f) =>
                `    <link rel="preload" as="font" type="font/woff2" crossorigin href="/${f}" />`,
            )
            .join('\n');
          return html.replace('</head>', `${tags}\n  </head>`);
        },
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Manifest liegt schon unter public/ — wir lassen ihn da und
      // referenzieren ihn nur, statt ihn doppelt zu generieren.
      manifest: false,
      // Workbox-Caching: assets per Precache, OSM/Esri-Tiles + API-GETs
      // mit Runtime-Cache. Schreib-Endpoints werden NICHT gecached
      // (siehe `dontCacheBustURLsMatching` und `urlPattern`-Filter).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      // Tests / Storybook brauchen den SW nicht — und `npm run dev` lädt
      // ihn nur, wenn `devOptions.enabled=true`. Wir lassen ihn aus,
      // damit dev und Tests deterministisch sind.
      devOptions: { enabled: false },
    }),
  ],
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
    rollupOptions: {
      output: {
        // Vendor-Chunks separieren, damit App-Updates nicht den Browser-Cache
        // der schweren Libraries (recharts, leaflet) invalidieren. Die hier
        // gelisteten Pakete bekommen jeweils einen eigenen, langlebigen Chunk.
        manualChunks: {
          recharts: ['recharts'],
          leaflet: ['leaflet', 'react-leaflet'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
  },
});
