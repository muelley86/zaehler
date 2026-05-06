import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Self-hosted Fonts via @fontsource — kein externer CDN-Aufruf zu Google.
// `latin-`-Subset spart gegenüber dem Default-Import (alle Subsets) etwa
// 80 % CSS- und Font-Bytes — wir brauchen für die deutsche Oberfläche
// keine kyrillischen oder vietnamesischen Zeichen.
import '@fontsource/inter-tight/latin-400.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/inter-tight/latin-600.css';
import '@fontsource/inter-tight/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';

// Leaflet-Stylesheet für die Standort-Karte (LocationMap).
import 'leaflet/dist/leaflet.css';

import { App } from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Service Worker registrieren — Cache-First für Assets, Network-First mit
// Fallback für API-GETs, Tile-Caching für die Standort-Karte. So ist die App
// nach dem ersten Besuch installierbar und verträgt kurze Netz-Aussetzer.
// `vite-plugin-pwa` erzeugt das Modul `virtual:pwa-register`, das wir nur
// in der gebauten App importieren — im Test/SSR-Kontext gibt's das Modul
// nicht, daher dynamic import + try/catch.
if (import.meta.env.PROD) {
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* SW im aktuellen Kontext nicht verfügbar — kein Fehler */
    });
}
