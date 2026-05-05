# Code-Audit — Zählerstand-App

Stand: 2026-05-05, Branch `main`, Commit-HEAD aktuell.

Methodik: vier parallele Code-Walks (CLAUDE.md/Datenmodell, Sicherheit, Tests, Performance/Code-Qualität). Befunde sind anschließend einzeln im Quelltext nachverifiziert. Wo nicht eindeutig nachprüfbar, ist das mit „**Unsicher**" markiert.

Schweregrad-Skala: **kritisch** (Datenverlust, RCE, breite Privilege-Eskalation), **hoch** (klare Sicherheitslücke / Korrektheitsbug mit Auswirkung auf alle User), **mittel** (Korrektheits- oder Härtungsproblem, eingeschränkter Blast-Radius), **niedrig** (Hygiene, Doku, Stilfragen).

Keine Code-Änderungen sind in diesem Audit enthalten — Befunde sind reine Diagnose.

---

## 1. Abweichungen von CLAUDE.md

### 1.1 PWA: Service-Worker nicht implementiert
- **Schweregrad:** mittel
- **Datei:** `frontend/src/` (kein `service-worker.ts` / kein `*.sw.ts` vorhanden), `frontend/public/manifest.webmanifest:1` (Manifest existiert)
- **Befund:** CLAUDE.md Zeile 25 fordert „PWA-fähig (Manifest + Service Worker, offline-tauglich für Erfassung)". Manifest ist da, **kein Service Worker registriert**. Verifiziert per `ls frontend/src/*sw*` (keine Treffer) und Inspektion von `main.tsx` (kein `navigator.serviceWorker.register`).
- **Auswirkung:** Erfassung am Zählerschrank ohne LAN-Verbindung scheitert; App ist nicht offline-tauglich.
- **Behebung:** Vite-PWA-Plugin oder eigener `service-worker.ts`. Cache-First für `/assets/*`, Network-First mit Offline-Queue (IndexedDB) für `POST /readings`.

### 1.2 Photo-Upload nur teilweise implementiert
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/models/reading.py:38` (Feld `photo_path`)
- **Befund:** Modell hat `photo_path: Mapped[str | None]`, aber kein Upload-Endpoint im Backend (`grep -n "photo" backend/src/meters/api/` liefert nichts) und kein Schema-Feld in `ReadingCreate`. CLAUDE.md Zeile 172 nennt Foto-Upload als Anforderung; Zeile 113 verlangt sogar explizit „Foto-Uploads NICHT in der DB-Transaktion verarbeiten".
- **Behebung:** Entweder Endpoint `POST /api/v1/readings/{id}/photo` (multipart) + File-Storage außerhalb der Transaktion, oder das Feld bis zur Implementierung aus dem Modell entfernen, damit der Datentyp ehrlich ist.

### 1.3 Reading.created_by_user_id nullable trotz CLAUDE.md „IMMER gesetzt"
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/models/reading.py:39-40`
- **Befund:** CLAUDE.md Zeile 92: „Reading.created_by_user_id wird IMMER gesetzt." Modell erlaubt `nullable=True` (impliziert durch `int | None`) und `ondelete="SET NULL"`. Wenn ein User gelöscht wird, verlieren seine Readings die Zuordnung — die IMMER-Invariante ist verletzt.
- **Behebung:** Entweder `nullable=False` + `ondelete="RESTRICT"` (kein Lösch-Pfad ohne System-User) ODER User-Deaktivierung dokumentieren als Standard-Vorgehen statt Hard-Delete.

### 1.4 Audit-Coverage: PASSWORD_CHANGED-Aktion existiert nicht
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/models/_enums.py` (AuditAction-Enum)
- **Befund:** Enum kennt `PASSWORD_RESET` (Admin setzt zurück), aber keine Aktion für die Selbst-Änderung des Passworts via `POST /auth/change-password`. CLAUDE.md Zeile 100 fordert nicht explizit, dass Self-Service-Pw-Änderung geloggt wird, aber die Spec ist hier nicht eindeutig.
- **Unsicher:** kann interpretiert werden, dass Login-Audit reicht. Empfehlung: Audit-Eintrag (CHANGE/UPDATE auf USER) bei Self-Service-PW-Änderung ist konservativer.

### 1.5 Inkonsistente Markierung „inaktiv": Boolean-Flag vs. Timestamp
- **Schweregrad:** niedrig (Design-Entscheidung)
- **Dateien:** `backend/src/meters/models/register.py` (`is_active: bool`), `backend/src/meters/models/physical_meter.py` (`removed_at: date | None`)
- **Befund:** Register markiert Inaktivität per Bool, PhysicalMeter per Timestamp. Beides funktioniert, aber Cross-Queries sind error-prone (siehe `replace_meter` Z. 153–154, das beides zusammen pflegt). CLAUDE.md schreibt keine Konvention vor.
- **Behebung (optional):** Vereinheitlichen — entweder beide Boolean, oder beide Timestamp-basiert. Kein Bug, nur Konsistenz.

---

## 2. Bugs und logische Fehler

### 2.1 Race Condition in `replace_meter` (kein DB-seitiges Locking)
- **Schweregrad:** hoch
- **Datei:** `backend/src/meters/services/meter_replacement.py:102-113`
- **Befund:** `active_meter` wird ohne Locking gelesen; zwei parallele Admin-Requests könnten beide den gleichen Meter als „aktiv" sehen, beide deaktivieren ihn und legen jeweils einen Nachfolger an → die Messstelle hat zwei aktive Meter, was den Reading-/Tausch-Workflow inkonsistent macht.
- **Behebung:** Partial-Unique-Index in der DB, der pro `measuring_point_id` nur **eine** Zeile mit `removed_at IS NULL` zulässt. Damit ist die Konsistenz unabhängig vom App-Code garantiert.
- **Unsicher:** SQLite mit WAL hat eigenes Locking-Modell — `with_for_update` ist no-op. Ein partieller UNIQUE-Index ist die belastbarere Lösung.

### 2.2 `_coerce_decimal_map` schluckt Pydantic-Validation, wirft 500
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/services/meter_replacement.py:31-32`
- **Befund:** `Decimal(str(v))` wirft bei nicht-numerischem Input `decimal.InvalidOperation`, was als HTTP 500 endet (kein `ProblemError`). Pydantic schützt für die normalen Endpoints, aber wenn das Service intern direkt aus user-nahem Code aufgerufen wird, leakt der Fehler.
- **Behebung:** `try`/`except (InvalidOperation, ValueError)` und Re-Raise als `ProblemError(400, …)`.

### 2.3 Datums-Filter im Frontend per String-Vergleich
- **Schweregrad:** niedrig (funktioniert dank ISO-Format, aber spröde)
- **Datei:** `frontend/src/features/dashboard/DashboardPage.tsx:310-315`
- **Befund:** `r.reading_at.slice(0,10) < from` funktioniert nur, weil ISO-Format lexikalisch gleich datierungs-sortiert. Wenn das Format mal abweicht (z. B. lokalisiertes Datum), bricht der Filter still.
- **Behebung:** `new Date(...)` vergleichen, oder die Tatsache mit Kommentar dokumentieren.

### 2.4 Kein Maximum-Limit für `transformer_factor`
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/schemas/measuring_point.py:44`
- **Befund:** Schema validiert `gt=0`, aber kein Maximum. Theoretisch kann jemand `transformer_factor=10**9` setzen und Verbrauchsberechnungen explodieren lassen. Praktisch begrenzt durch UI-Eingabe.
- **Behebung:** `Field(default=None, gt=0, le=10000)` oder Plausibilitätsschwelle.

---

## 3. Sicherheitsprobleme

### 3.1 CSP enthält `script-src 'unsafe-inline'`
- **Schweregrad:** hoch
- **Datei:** `backend/src/meters/core/middleware.py:39`
- **Befund:** Die CSP erlaubt beliebige Inline-Skripte. Kommentar nennt „Theme-Bootstrap-Skript" als Grund. Damit ist der primäre Schutz gegen Reflected/Stored-XSS deaktiviert. Im React-SPA-Kontext ist das einer der wichtigsten Hardening-Hebel.
- **Behebung:** Inline-Bootstrap-Skript identifizieren, durch externes Asset oder nonce-basiertes `script-src 'self' 'nonce-…'` ersetzen, dann `unsafe-inline` entfernen.

### 3.2 TOTP-Pending-Challenge bindet User-Agent/IP nicht
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/services/totp.py:134-155` (Speicherung), `resolve_pending_challenge` in derselben Datei (kein UA-/IP-Check)
- **Befund:** Beim Erzeugen werden `user_agent` und `ip_address` mit der Challenge gespeichert (Z. 150–151). Bei `resolve_pending_challenge` werden sie **nicht verglichen** (per Code-Inspektion verifiziert). Wer den Challenge-Token + einen TOTP-Code abgreift, kann von beliebigem Client den 2FA-Schritt abschließen.
- **Behebung:** Im Resolve-Pfad UA/IP der aktuellen Request mit dem gespeicherten Wert vergleichen; bei Abweichung Challenge invalidieren oder kürzere TTL.
- **Unsicher:** Bei Netzwechseln (Mobilfunk → WLAN) könnte der Check zu falsch-positiven Sperren führen — Trade-off bewerten.

### 3.3 `verify_2fa` nutzt nur Username-Limiter, keinen IP-Limiter
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/api/v1/auth.py` (`verify_2fa`-Endpoint, ca. Z. 140 ff.)
- **Befund:** Verifiziert per `grep -A 30 verify_2fa | grep limit`: nur `username_limiter.record_failure(...)`, kein `login_limiter`. Ein Angreifer kann pro IP beliebig viele 6-stellige Codes raten, solange er den Username variiert (was er bei einer geleakten Challenge nicht muss).
- **Behebung:** `login_limiter.check(ip)` zusätzlich aufrufen und bei Fehlschlag `login_limiter.record_failure(ip)`. Konsistent mit dem `login`-Endpoint.

### 3.4 X-Forwarded-For wird ohne Format-Check übernommen
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/api/deps.py:75-80`
- **Befund:** `forwarded.split(",")[0].strip()` nimmt blind den ersten Wert. Bei Fehlkonfiguration des Reverse-Proxys (oder einem manipulierten Header) landet ein beliebiger String im Audit-Log und in den Rate-Limit-Buckets. Mit `METERS_TRUST_PROXY=True` ist das real erreichbar.
- **Behebung:** `ipaddress.ip_address(parsed)` zur Validierung; bei Fehlschlag Fallback auf `request.client.host`.

### 3.5 Backups bekommen keinen expliziten Permission-Bit
- **Schweregrad:** mittel
- **Datei:** `deploy/lxc/backup.sh` (kein `chmod 0600` nach `gzip`)
- **Befund:** Verzeichnis wird in `install.sh` mit `0700` angelegt, aber das täglich erzeugte `.db.gz` erbt nur die `umask` des Skripts (typischerweise `0022` → `0644`). Damit ist das Backup im LXC potentiell von anderen System-Usern lesbar — das Backup enthält Klartext-TOTP-Secrets und bcrypt-Hashes.
- **Behebung:** Im Backup-Skript `umask 0077` setzen oder explizit `chmod 0600 "${target}.gz"` nach dem `gzip`.
- **Unsicher:** Auf einem dedizierten LXC ohne weitere User ist das Risiko klein, aber Defense-in-Depth ist günstig zu haben.

### 3.6 LOGIN_FAILED-Audit speichert eingegebenen Username
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/api/v1/auth.py:93`
- **Befund:** Bei fehlgeschlagenem Login wird `diff={"username": payload.username}` ins Audit-Log geschrieben. Das ist nützlich für Brute-Force-Erkennung, aber wenn ein User sein Passwort ins Username-Feld tippt, landet es im Klartext im Audit-Log.
- **Behebung:** Nur `username` loggen, wenn er auch zu einem existierenden User gehört, oder nur eine Hash-Repräsentation/Zähler.

### 3.7 TOTP-Secret im Klartext in der DB
- **Schweregrad:** niedrig (dokumentiert)
- **Datei:** `backend/src/meters/models/user.py:40-46`
- **Befund:** Das Modell hat einen Code-Kommentar, der diese Entscheidung explizit begründet (DB nur lokal lesbar). Zusammen mit Befund 3.5 (Backup-Permissions) wird das aber relevanter — wer das Backup hat, hat alle TOTP-Secrets.
- **Behebung:** Optional Verschlüsselung at-rest mit Master-Key aus `METERS_SECRET_KEY` (AES-GCM), oder sqlcipher.

### 3.8 Cookie-Secure-Default `False`
- **Schweregrad:** mittel (Default-Konfiguration, gewollt für LAN, aber Falle)
- **Datei:** `backend/src/meters/core/config.py:41`
- **Befund:** `cookie_secure: bool = False`. Default ist gerechtfertigt durch LAN-only-Nutzung über HTTP. Aber: Wer den Container später hinter einen HTTPS-Reverse-Proxy stellt und dabei `METERS_COOKIE_SECURE=True` zu setzen vergisst, sendet das Session-Cookie auch über HTTP-Routen.
- **Behebung:** `configure-network` (existiert) setzt das automatisch; in der README noch klarer als Pflicht-Schritt markieren.

---

## 4. Datenmodell-Probleme

### 4.1 `Reading.created_by_user_id` und `Delivery.created_by_user_id` nullable trotz API-seitig immer gesetzt
- **Schweregrad:** mittel
- **Dateien:** `backend/src/meters/models/reading.py:39`, `backend/src/meters/models/delivery.py:37`
- **Befund:** Beide Felder sind nullable, FK mit `ondelete="SET NULL"`. Siehe 1.3 — gegen die CLAUDE.md-Invariante.
- **Behebung:** Siehe 1.3.

### 4.2 `Delivery` ohne UNIQUE-Constraint auf `(register_id, delivery_at)`
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/models/delivery.py` (kein `UniqueConstraint`)
- **Befund:** `Reading` hat `UniqueConstraint(register_id, reading_at)` zur Verhinderung von Doppelerfassung. Delivery hat das nicht, obwohl semantisch das gleiche Argument greift (eine physische Lieferung passiert zu genau einem Zeitpunkt). UI würde nicht zwei anlegen, aber die DB hält es nicht durch.
- **Behebung:** `UniqueConstraint("register_id", "delivery_at", name="uq_delivery_register_at")` ergänzen + Migration.

### 4.3 Audit-Log `diff` ohne Größenlimit
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/models/audit_log.py:35`
- **Befund:** `diff: dict[str, Any] | None` als JSON, keine Längenbegrenzung. Bei einer Heating-Messstelle mit vielen Custom-Registern oder einem Bulk-Import könnte ein einzelner Audit-Eintrag mehrere KB groß werden. Auf Dauer DB-Bloat.
- **Behebung:** Soft-Limit (z. B. 8 KB) auf API-Ebene; bei Überschreitung Diff abkürzen mit Hinweis.

### 4.4 Audit-Log ohne Index auf `(user_id, created_at)`
- **Schweregrad:** niedrig
- **Datei:** Migration `20260504_1500_audit_indexes_and_cleanup.py` legt nur `(action, created_at)` und `(entity_type, created_at)` an
- **Befund:** Audit-Log-Viewer-Filter „alle Aktionen eines Users seit T" hat keinen passenden Index, fallback ist Full-Table-Scan.
- **Behebung:** Composite-Index `(user_id, created_at)` ergänzen. Niedrige Priorität, weil das Audit-Log für einen Privathaushalt klein bleibt.

### 4.5 Locations.latitude/longitude als Float
- **Schweregrad:** niedrig (intentional)
- **Datei:** `backend/src/meters/models/location.py:24-25`
- **Befund:** Float statt Decimal. Code-Kommentar begründet das mit GPS-Genauigkeit (~10 cm bei 6 Nachkommastellen, von Float-32 abgedeckt). Konform zur CLAUDE.md-Regel „Decimal NIEMALS Float für Zählerstände" — das gilt für Mengen, nicht für Koordinaten.
- **Bewertung:** OK, hier nur erwähnt damit der Audit nicht auf einem Lese-Skim hängenbleibt.

---

## 5. Fehlende oder schwache Tests

### 5.1 Keine Concurrency-/Race-Condition-Tests
- **Schweregrad:** hoch
- **Befund:** Es gibt keinen Test, der zwei parallele Requests simuliert (weder doppelte Reading-Erfassung am gleichen `(register_id, reading_at)`, noch zwei parallele `replace_meter`-Calls). Der UNIQUE-Constraint und das WAL-Verhalten sind in Tests nur indirekt durch sequenzielle Aufrufe geprüft.
- **Vorschlag:** `pytest-asyncio` oder `concurrent.futures.ThreadPoolExecutor` mit zwei Sessions; einer gewinnt, anderer bekommt 409 (Reading) bzw. 409 (replace_meter, wenn Befund 2.1 mit DB-Constraint behoben ist).

### 5.2 Keine Migrations-Round-Trip-Tests
- **Schweregrad:** hoch
- **Befund:** `conftest.py` baut die DB mit `Base.metadata.create_all`, **nicht** mit Alembic. Die zwölf bestehenden Migrationen sind nie als End-to-End-Sequenz getestet. Genau das hat zum Heating-Uppercase-Bug geführt (PR #26).
- **Vorschlag:** `test_migrations.py` mit:
  1. Frische SQLite-DB (tmp file).
  2. `alembic upgrade head` → auf jeder Zwischenrevision `INSERT` typischer Zeilen.
  3. `alembic downgrade base` und wieder `upgrade head`.
  4. Schema-Konsistenz-Check und Smoke-Read.

### 5.3 Atomarität von `replace_meter` bei Fehler ungetestet
- **Schweregrad:** hoch
- **Datei:** `backend/src/meters/services/meter_replacement.py:102-194`
- **Befund:** Alle existierenden Tests gehen den Happy Path. Es gibt keinen Test, der `replace_meter` mit unvollständigen `final_readings` aufruft und prüft, dass nach dem Fehler die alten Register noch `is_active=true` sind (DB-Rollback).
- **Vorschlag:** Test mit ELECTRICITY-MP (zwei Register), `final_readings={"1.8.0": "100"}` (ohne 2.8.0). Erwarten: 400, alte Register bleiben aktiv, kein neuer Meter angelegt.

### 5.4 Heating-Register-Vererbung beim Tausch ungetestet
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/services/meter_replacement.py:159-168`
- **Befund:** Die Logik kopiert User-konfigurierte Register vom alten zum neuen Meter (RegisterDef-Liste). Kein Test für: Custom-Register hinzugefügt + Tausch → neuer Meter hat das Custom-Register? Inaktive Register werden nicht mitübertragen?
- **Vorschlag:** Heating-MP anlegen, dritte Register via `POST /physical-meters/{id}/registers` ergänzen, dann `replace_meter` aufrufen, prüfen dass neuer Meter alle drei Register hat.

### 5.5 Login mit `is_active=False` ungetestet
- **Schweregrad:** mittel
- **Befund:** `test_auth.py` deckt korrektes Passwort, falsches Passwort und Rate-Limit ab — aber nicht den Fall „User existiert, ist aber deaktiviert". Wenn die Prüfung im Login-Service still bricht, könnte ein deaktivierter User trotzdem einloggen.
- **Vorschlag:** Test `test_login_blocked_for_inactive_user`.

### 5.6 Audit-Lücken in Tests
- **Schweregrad:** mittel
- **Befund:** Es gibt Audit-Tests für Reading-CRUD, MP-Create, Location-CRUD, Meter-Replacement, Login. Es fehlen:
  - User-Anlage / -Deaktivierung / -Rollenwechsel (kritisch laut CLAUDE.md, aber nicht abgedeckt)
  - TOTP_DISABLED
  - PASSWORD_CHANGED (siehe 1.4 — Aktion existiert noch nicht)
- **Vorschlag:** Drei zusätzliche Audit-Assertions in `test_users.py` und `test_auth.py`.

### 5.7 Export-Endpoints ohne Tests
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/api/v1/exports.py` (CSV/JSON-Dump)
- **Befund:** Kein dedizierter Test für CSV-Header, Decimal-Stringifizierung, JSON-Vollständigkeit (alle MPs / Meter / Register).
- **Vorschlag:** `test_exports.py` mit drei Tests (CSV-Header-Vollständigkeit, JSON-Struktur, Decimal-Format).
- **Unsicher:** Ich habe `exports.py` nicht selbst gelesen — wenn der Endpoint nicht existiert, ist der Befund hinfällig.

### 5.8 Frontend-Tests minimal
- **Schweregrad:** mittel
- **Befund:** Nur `format.test.ts` (20 Tests) und `LoginPage.test.tsx` (1 Test). Keine Tests für `RecordReadingPage`, `MeasuringPointsAdminPage` (Wizard mit 5 Energieträgern!), `ReadingsListPage`, `DashboardPage`. Bei einem Refactor (z. B. Wandlerfaktor-Logik im Frontend-Delta) gibt's kein Sicherheitsnetz.
- **Vorschlag:** Mindestens `RecordReadingPage` (mehrere Register gleichzeitig erfassen, Plausibilitätswarnung) und `MeasuringPointsAdminPage` Wizard (Anlage einer Heating-MP) mit Vitest + React Testing Library + msw als Mock.

### 5.9 `_pairwise` Edge-Cases ungetestet
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/services/consumption.py:25-33`
- **Befund:** Die Hilfsfunktion wird durch die Integration-Tests indirekt geprüft, aber nicht direkt mit 0, 1, 2 Elementen. Bei Refactor leicht subtil zu brechen.
- **Vorschlag:** Drei direkte Unit-Tests.

---

## 6. Performance-Auffälligkeiten

### 6.1 N+1: Deliveries laden `created_by` lazy
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/api/v1/deliveries.py:39` und `_to_read`
- **Befund:** `_to_read(d)` greift auf `d.created_by.username` zu. Die Listen-Endpoints laden `Delivery` ohne `selectinload(Delivery.created_by)`. Verifiziert: `grep -n selectinload backend/src/meters/api/v1/deliveries.py` ist leer. Bei 500 Lieferungen kommen 500 zusätzliche User-Selects.
- **Behebung:** `.options(selectinload(Delivery.created_by))` zu beiden Listen-Statements (Z. 56 und Z. 72) hinzufügen.

### 6.2 `state_for_register` lädt alle Readings/Deliveries des Registers
- **Schweregrad:** mittel
- **Datei:** `backend/src/meters/services/state.py:39-70`
- **Befund:** `register.readings` und `register.deliveries` werden komplett über die ORM-Beziehung geladen, in Python sortiert, dann nur das letzte Reading verwendet. Bei einem Register mit 10k Readings ist das verschwenderisch.
- **Behebung:** Direkte SQL-Abfrage `SELECT … ORDER BY reading_at DESC LIMIT 1` statt ORM-Lazy-Load.

### 6.3 `consumption_for_register` sortiert in Python statt in SQL
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/services/consumption.py:50`
- **Befund:** `sorted(register.readings, key=…)` lädt alle Readings in Memory und sortiert dort. Effekt ähnlich 6.2, etwas weniger gravierend, weil hier ohnehin alle Readings benötigt werden.
- **Behebung:** Beziehung mit `order_by="Reading.reading_at"` definieren (im Register-Model) — kein zusätzlicher Lade-Aufwand, aber Sortierung wandert in SQL.

### 6.4 Frontend-Bundle 869 kB (Vite warnt)
- **Schweregrad:** mittel
- **Befund:** Der jüngste Build zeigt `index-CnBjULMw.js — 869.99 kB │ gzip: 249.91 kB`. Vite warnt explizit (Z. „Some chunks are larger than 500 kB"). Initial-Render auf Mobilfunk merklich.
- **Behebung:** Route-based Code-Splitting via `React.lazy()` für Dashboard/Admin/Detail-Routen; ggf. Recharts gegen leichteres Chart-Lib tauschen oder gezielt importieren.

### 6.5 Keine Pagination-`offset` für Deliveries-Liste
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/api/v1/deliveries.py:62-87`
- **Befund:** `limit` ist da (Default 500, max 5000), `offset` fehlt. Damit sind ältere Deliveries bei > 5000 Datensätzen über die API nicht mehr erreichbar.
- **Behebung:** `offset: int = Query(0, ge=0)` hinzufügen, `stmt.offset(offset)` anwenden.

### 6.6 Dashboard: `consumptionSeries` ohne `useMemo`
- **Schweregrad:** niedrig
- **Datei:** `frontend/src/features/dashboard/DashboardPage.tsx` (im `MeasuringPointCard`-Bereich)
- **Befund:** Die Map → Array-Transformation läuft auf jedem Render. Recharts bekommt jedes Mal eine neue Array-Referenz und re-rendert.
- **Behebung:** `useMemo(() => …, [consumption])`.

---

## 7. Code-Qualität

### 7.1 Audit-Log-Schreibung ist über alle Endpoints dupliziert
- **Schweregrad:** niedrig
- **Dateien:** `api/v1/readings.py`, `api/v1/deliveries.py`, `api/v1/measuring_points.py`, `api/v1/users.py`, `api/v1/locations.py`
- **Befund:** Jedes Schreib-Endpoint baut den `record(...)`-Call manuell. Diff-Berechnung wiederholt sich.
- **Behebung:** Decorator oder Context-Manager `with audit(action, entity_type) as a: a.diff = …`.

### 7.2 `ReadingsListPage.tsx` > 1000 Zeilen
- **Schweregrad:** niedrig
- **Befund:** Filter, Liste, Edit-Dialog, Delivery-Edit, CSV-Export — alles in einer Datei. Wartbarkeit leidet, Test-Schreibung erschwert.
- **Behebung:** Aufteilen in `ReadingsFilter`, `ReadingsTable`, `EditReadingSheet`, `ExportButton`.

### 7.3 Magische HTTP-Statuscodes
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/api/v1/readings.py:110-129` (und weitere)
- **Befund:** `status_code=400` (Plausibilitätswarnung) ist gegen FastAPI-Konvention; 422 wäre semantisch korrekter. Code nutzt 400 mit `extra={acknowledge_field: …}` — das ist ein sinnvoller Pattern, sollte aber als Konstante definiert sein, damit Frontend und Backend nicht auseinanderlaufen.
- **Behebung:** `STATUS_PLAUSIBILITY_WARNING = 400` als Modul-Konstante.

### 7.4 Kein Logging-Setup
- **Schweregrad:** niedrig
- **Befund:** Im Backend gibt es keinen zentralen `logging.config.dictConfig`. Logs gehen nach stdout → journald. Bei Bedarf nach Korrelations-IDs oder strukturiertem JSON-Logging fehlt das Fundament.
- **Behebung:** `meters.core.logging`-Modul mit dictConfig + `request_id`-Middleware.

### 7.5 `_pairwise`-Iterator ohne expliziten Generator-Type-Hint
- **Schweregrad:** niedrig
- **Datei:** `backend/src/meters/services/consumption.py:25`
- **Befund:** `Iterable[tuple[Reading, Reading]]` als Annotation, dafür reicht's — aber Generator-Typ wäre genauer (`Iterator[…]`). mypy beschwert sich nicht.
- **Behebung:** kosmetisch.

---

## Zusammenfassung

| Sektion | Befunde | davon hoch+ |
|---|---:|---:|
| 1. CLAUDE.md-Abweichungen | 5 | 0 |
| 2. Bugs / logische Fehler | 4 | 1 |
| 3. Sicherheitsprobleme | 8 | 1 |
| 4. Datenmodell-Probleme | 5 | 0 |
| 5. Tests | 9 | 3 |
| 6. Performance | 6 | 0 |
| 7. Code-Qualität | 5 | 0 |
| **gesamt** | **42** | **5** |

### Top-5-Empfehlungen (nach Risiko)

1. **CSP `unsafe-inline` entfernen** (3.1, hoch) — direkter Hardening-Hebel gegen XSS.
2. **Migrations-Round-Trip-Tests einführen** (5.2, hoch) — der jüngste Heating-Uppercase-Bug wäre damit aufgefallen.
3. **Concurrency-Tests + DB-Constraint gegen zwei aktive Meter** (5.1 + 2.1, hoch) — sonst kann Tausch unter Last MPs in inkonsistenten Zustand bringen.
4. **`replace_meter`-Atomarität bei Fehler testen** (5.3, hoch) — Schutz gegen halb-vollzogene Tauschvorgänge.
5. **PWA-Service-Worker** (1.1, mittel) — von CLAUDE.md gefordert; ohne ihn ist die mobile Erfassung nicht offline-tauglich.

Keine kritischen Befunde gefunden. Die Codebase ist überwiegend solide; die Hochkategorien adressieren Härtungs- und Test-Lücken, keine offenen Sicherheitsnotfälle.
