/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Wird zur Build-Zeit von vite.config.ts via ``define`` injiziert.
// Quelle: ``.release-please-manifest.json`` im Repo-Root.
declare const __APP_VERSION__: string;
