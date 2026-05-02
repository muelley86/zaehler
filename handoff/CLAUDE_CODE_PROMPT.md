# Claude Code Prompt — Frontend Redesign

Kopiere genau diesen Block in Claude Code (im `zaehler/`-Repo-Root):

---

Lies zuerst `handoff/HANDOFF.md` und `handoff/DESIGN_TOKENS.md` vollständig
durch. In `handoff/mockup/` liegt das Original-Mockup als HTML mit allen
Screens als JSX-Komponenten — öffne `Zähler App.html` lokal im Browser,
das ist die pixel-genaue visuelle Referenz.

Migriere `frontend/src/` von der bestehenden iOS-/SwiftUI-Optik auf den
neuen „Liquid Glass"-Stil aus dem Mockup. Halte dich strikt an die
Reihenfolge in `HANDOFF.md` (Schritt 1-9), committe nach jedem Schritt
einzeln, und führe nach jedem Commit `pnpm lint && pnpm type-check &&
pnpm test --run` aus.

Wichtig:
- Routen in `App.tsx`, API-Layer (`src/lib/api.ts`), Types, AuthProvider
  und das Backend bleiben **unverändert**.
- Stack bleibt React 18 + Vite + TS + Tailwind, keine neuen Libs ohne
  Rückfrage.
- Alle Farben in OKLCH, alle Zahlen in JetBrains Mono mit
  `tabular-nums`.
- Light + Dark sind beide First-Class.
- Wenn ein bestehender Test über einen CSS-Klassen-Selector geht und
  durch das Redesign bricht, baue ihn auf `data-testid` um — Verhalten
  und Assertions bleiben gleich.

Wenn dir an einer Stelle Verhalten oder Layout unklar ist: **frag mich,
bevor du selber entscheidest**.

Starte mit Schritt 1 (Tokens & Tailwind-Config) und zeige mir den
fertigen Diff, bevor du Schritt 2 anfängst.
