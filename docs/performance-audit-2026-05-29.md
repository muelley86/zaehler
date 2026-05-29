# Performance-Audit — 2026-05-29

Drei parallele Explore-Lauefe (Backend / Frontend-Bundle / Mobile-PWA)
zusammengefasst. Fokus laut User-Briefing: mobile Erfassung am
Zaehlerschrank, oft schwaches LTE im Keller.

## Zusammenfassung

**Frontend-Bundle (sauber)**: React.lazy auf 16 Routen, manuelle Vite-
Chunks fuer recharts/leaflet/react-vendor, `html5-qrcode` dynamisch
geladen, Tailwind-Purge greift, kein Auto-Polling. Keine Aenderung
noetig.

**Backend (mittel)**: ein echtes 1+N im MP-Listing (`current_assignment`
pro Row), ein fehlender Index auf `audit_log.created_at`, kein
`mmap_size`-PRAGMA. Wird mit Datenmenge relevant; in diesem PR gefixt.

**Mobile/PWA (zwei harte Treffer)**:
1. **Foto-Upload ohne Kompression** — iPhone-Original 4–6 MB ging raw
   raus. Im Keller mit schwachem LTE Upload-Killer. **In diesem PR
   gefixt** (Canvas-Reskalierung auf 1600 px / 0.8 JPEG-Quality).
2. **Keine Offline-Queue** — POST/PUT scheitern hart, wenn das Netz
   weg ist. CLAUDE.md sagt „PWA-faehig fuer Erfassung", aber Reading-
   Queueing/Background-Sync ist nicht implementiert. **In diesem PR
   bewusst nicht gefixt** (eigener Folge-PR, weil IndexedDB + Conflict-
   Handling eigene Test-Strategie braucht).

## Fixes in diesem PR

### Backend

- **N+1 im MP-Listing**: `services/owner_assignment.py` bekommt
  `current_assignments_bulk(db, mp_ids)`. `api/v1/measuring_points.py`
  ruft den Bulk-Loader einmal pro Request auf und uebergibt das
  Assignment per Keyword an `_to_read`. Regressionstest in
  `tests/integration/test_owner_assignments.py` prueft per
  `before_cursor_execute`-Listener, dass max. eine
  `owner_assignment`-Query gestellt wird.
- **Index `ix_audit_log_created_at`**: Alembic-Migration
  `20260529_0600_audit_log_created_at_index.py`. Audit-Liste sortiert
  `ORDER BY created_at DESC LIMIT 200` — Volltabellenscan wird mit
  jedem Eintrag teurer.
- **PRAGMA `mmap_size=67108864`** in `db/__init__.py` — 64 MB Memory-
  Mapped I/O fuer SQLite-Reads. Spart syscalls auf Hot-Read-Paths
  (Dashboard, Listings). Bei < 64 MB DB-Groesse wirkt es wie ein
  zweiter Cache mit Direkt-Zugriff.

### Frontend / Mobile

- **`lib/imageCompression.ts`**: Canvas/OffscreenCanvas-basierte
  Bildverkleinerung auf 1600 px Langseite / 0.8 JPEG-Quality.
  Skippt: kleine Dateien (< 512 KB), Decode-Fehler (HEIC ohne
  Browser-Support — Pillow-Reencode auf dem Server uebernimmt
  weiterhin), Faelle wo der Reencode nicht kleiner waere als
  das Original. Vor dem `FormData.append('photo', …)` in
  `RecordReadingPage.tsx` aufgerufen — einmal pro Submit, nicht pro
  Reading-ID.
- **Tests**: `lib/imageCompression.test.ts` deckt Skip-, Fallback-
  und Reskalierungs-Pfade ab.

## Bewusst zurueckgestellt

1. **Offline-Queue fuer Readings** (Mobile, GROSS) — IndexedDB +
   Background-Sync, eigener PR. Erfordert: Queue-UI, Konflikt-Handling
   bei verspaetetem Sync, MSW-Tests.
2. **Pagination fuer `list_users` / `list_owners` / `list_locations`**
   — KLEIN, admin-only, irrelevant bis vierstellige Datenmengen.
3. **Constant-Time-HMAC-Compare** (aus Security-Audit) — KLEIN,
   praktisch mitigiert.

## Re-Audit-Trigger

Naechstes Performance-Audit spaetestens:
- bei Major-Dep-Bump (FastAPI 1.x, SQLAlchemy 3.x, React 19, Vite 7),
- nach Einfuehrung der Offline-Queue,
- oder einmal pro Jahr (naechstes Datum: 2027-05).
