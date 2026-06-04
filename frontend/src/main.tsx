import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Self-hosted Fonts via @fontsource — kein externer CDN-Aufruf zu Google.
// `latin-`-Subset spart gegenüber dem Default-Import (alle Subsets) etwa
// 80 % CSS- und Font-Bytes — wir brauchen für die deutsche Oberfläche
// keine kyrillischen oder vietnamesischen Zeichen.
//
// WICHTIG: die @fontsource-CSS-Bundles importieren wir NICHT mehr — die
// definieren ihre @font-face-Regeln mit font-display:swap und ueberlappen
// dann mit unseren optional-Regeln, was Browser inkonsistent matchen.
// fonts.css ist autark: ein @font-face pro (family, weight) mit
// font-display:optional, src zeigt direkt auf @fontsource/.../files/*.woff2,
// die Vite zur Hash-URL aufloest.
import './styles/fonts.css';

// Leaflet-Stylesheet für die Standort-Karte (LocationMap).
import 'leaflet/dist/leaflet.css';

import { App } from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import { FilterPrefsProvider } from './features/prefs/FilterPrefsProvider';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FilterPrefsProvider>
          <App />
        </FilterPrefsProvider>
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
