# Frontend Redesign — Handoff für Claude Code

> Quelle dieser Spezifikation: HTML-Mockup-Projekt „Zählerapp" mit allen
> Screens als React-Komponenten. ZIP des Mockups liegt diesem Paket bei.
> **Pixel-genaue Referenz:** `Zähler App.html` im ZIP öffnen — alle Screens
> in Light + Dark sind dort als Design Canvas zu sehen.

## Auftrag

Migriere das Frontend unter `frontend/src/` von der aktuellen iOS-/SwiftUI-
Optik auf den neuen **„Liquid Glass"-Stil** (warmes Orange, gefrostete
Glasflächen, große Tabular-Numeric-Zahlen). Bestehende Routen, API-Calls,
React-Query-Hooks, Auth-Provider, Validierung und Tests bleiben **vollständig
erhalten** — du tauschst ausschließlich Visual Layer + Layout-Struktur.

Funktional ändert sich nichts. Wenn du an Verhalten / Flows etwas ändern
willst, weil's der neue Stil nahelegt, frag vorher.

## Geltende Regeln

- **Tailwind bleibt.** Stack ist React 18 + Vite + TS + Tailwind, keine
  Library-Wechsel.
- **OKLCH ist Pflicht** für alle Farben — der gesamte Token-Satz nutzt
  `oklch()`. Kein HSL/HEX in neuen Stilen außer für reine Schatten-RGBA.
- **Schriften:** Inter Tight (UI), JetBrains Mono (alle Zahlen, OBIS-Codes,
  Seriennummern, Zeitstempel, IPs). Beide via Google Fonts in `index.html`.
- **Zahlen sind das Hero-Element.** Tabular-Numeric (`font-variant-numeric:
  tabular-nums`), groß, Mono-Schrift, Nachkommastellen optisch leicht
  gedimmt (separater Span mit niedrigerer Opacity).
- **Glasflächen** (`backdrop-filter: blur(40px) saturate(180%)`) für alle
  Karten/Sheets/Sidebars; auf einem warmen Pastell-Hintergrund mit
  Radial-Glows (Orange + Gelb-Orange).
- **Pro Zählertyp eigene Hue** (Strom warm-gelb, Gas tief-orange, Wasser
  Blau, Öl Braun) — alle in derselben Chroma+Lightness, deshalb
  harmonisch.
- **Light + Dark** sind beide First-Class. Folge Token-Tabelle 1:1.
- **Mobile zuerst, Desktop ergänzend.** Mobile = Bottom-Tab-Bar bleibt.
  Desktop = Sidebar (240 px) bleibt. Breakpoint wie bisher.
- **Reanimate keine bestehenden Routes** — nur Komponenten-Bodies und
  Tailwind-Klassen tauschen, Pfade in `App.tsx` bleiben gleich.

## Reihenfolge

Arbeite in dieser Reihenfolge, und committe **pro Schritt einzeln**, damit
ich Rollbacks granular machen kann:

1. **Tokens & Tailwind-Config** — `DESIGN_TOKENS.md` (im ZIP) in
   `tailwind.config.js` als Custom-Properties + Theme-Extend einbauen,
   plus `src/styles/index.css` für CSS-Variablen pro `:root` + `.dark`.
2. **UI-Primitive umbauen** — `src/components/ui/*`: `Card`, `Button`,
   `Pill`, `Sheet`, `TextField`, `Select`, `Switch`, `Section`, `Row`,
   `LargeTitle`, `EmptyState`. Glas-Optik, neue Radien, neue Schatten.
   Verhalten und Props bleiben.
3. **AppShell** — neue Sidebar (Desktop) + neue Bottom-Tab-Bar (Mobile),
   Logo-Lockup links oben.
4. **Auth-Screens** — `LoginPage`, `ChangePasswordPage`. Hero-Logo +
   Glas-Card, warme Radial-Glows im Hintergrund.
5. **Dashboard** — Cards-Variante mit großer Header-Number pro
   Messstelle, Tank-Ring für Heizöl, 12-Monats-AreaChart unten.
   `useChartTheme.ts` an neue Tokens anpassen.
6. **Erfassen** — Modal-Sheet mit großer Live-Number und Plausibilitäts-
   check (Delta zur letzten Erfassung in grün/rot).
7. **Erfassungen-Liste** — gruppiert nach Tag (Heute/Gestern/Datum), pro
   Eintrag Typ-Badge + Mono-Wert + Δ zum Vorwert.
8. **Admin-Screens** — Messstellen-Liste, Messstelle-Detail (mit
   Verbrauchskurve + Register-Tabelle), Standorte (Card-Grid), Benutzer
   (Tabelle), Audit Log (gruppiert nach Tag, Action-Badges).
9. **Mehr / Settings** — Profil-Card oben, dann Sektionen (App, Daten,
   Konto), unten Logout.

Nach jedem Schritt: `pnpm lint && pnpm type-check && pnpm test --run`.
Tests dürfen nicht roten werden; Selektoren in Tests notfalls auf
`data-testid` umstellen.

## Was NICHT ändern

- **Routen** in `App.tsx`
- **API-Layer** `src/lib/api.ts`
- **Types** `src/lib/types.ts`
- **AuthProvider** und sessionbasierte Logik
- **Vite-Proxy** und `/api/*`-Pfade
- **Backend** (gar nicht)
- **Tests** — wenn ein Test bricht, weil ein Selector über CSS-Klasse
  ging, baue auf `data-testid` um, nicht den Test ändern.

## Mockup-Komponenten als Referenz

Im ZIP findest du im Root die JSX-Dateien des Mockups. Die sind **nicht
copy-paste-fähig** (laufen über Babel-Standalone, nicht über Vite/TS),
aber die Strukturen, Klassennamen, Farbwerte und Layouts darfst du 1:1
übernehmen.

| Mockup-Komponente            | Ziel-Datei in `frontend/src/`                              |
|------------------------------|------------------------------------------------------------|
| `GlassCard`                  | `components/ui/Card.tsx` (umbauen)                         |
| `Pill`, `TypeBadge`          | `components/ui/Pill.tsx`, neu `TypeBadge.tsx`              |
| `AreaChart`, `MultiAreaChart`| Recharts-Konfig in `useChartTheme.ts` anpassen             |
| `LoginA`                     | `features/auth/LoginPage.tsx`                              |
| `DashboardA`                 | `features/dashboard/DashboardPage.tsx`                     |
| `ErfassenA`                  | `features/readings/RecordReadingPage.tsx`                  |
| `ListeA`                     | `features/readings/ReadingsListPage.tsx`                   |
| `MehrA`                      | `features/more/MorePage.tsx`                               |
| `Sidebar`                    | `components/AppShell.tsx`                                  |
| `DashboardDesktopA`          | `features/dashboard/DashboardPage.tsx` (Desktop-Branch)    |
| `AdminMeasuringPoints`       | `features/measuring-points/MeasuringPointsAdminPage.tsx`   |
| `AdminMeasuringPointDetail`  | neu — `MeasuringPointDetailPage.tsx` ergänzt Detail-Route  |
| `AdminLocations`             | `features/admin/LocationsAdminPage.tsx`                    |
| `AdminUsers`                 | `features/admin/UsersAdminPage.tsx`                        |
| `AdminAudit`                 | `features/admin/AuditLogPage.tsx`                          |

## Acceptance

- [ ] Alle bestehenden Routes laden ohne Console-Errors
- [ ] Light + Dark Mode visuell identisch zum Mockup (ZIP öffnen, Sektion
      für Sektion vergleichen)
- [ ] `pnpm lint`, `pnpm type-check`, `pnpm test --run`, `pnpm build`
      laufen grün
- [ ] Kein Tailwind-Default-Blau, kein iOS-System-Blau mehr im Codebase
      (`grep -r "blue-" src/` sollte nur noch absichtliche Uses finden)
- [ ] Alle Numbers (Werte, OBIS-Codes, IPs, Timestamps) in JetBrains Mono
- [ ] Keyboard-Nav + Focus-Rings funktionieren überall (Glasflächen
      brauchen bewusst sichtbare Outlines)
- [ ] PR-Beschreibung enthält Screenshots aus Light + Dark für jeden
      Hauptscreen

Wenn Unklarheiten auftauchen — **frag vorher**, bevor du eigene Design-
Entscheidungen triffst.
