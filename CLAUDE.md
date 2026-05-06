# Zählerstand-App

## Zweck
Self-hosted Webapp zur Erfassung und Historisierung von Strom-, Gas- und
Wasserzählerständen für einen Privathaushalt. Läuft in einem LXC-Container
auf eigener Hardware. Keine Cloud, keine externen Abhängigkeiten zur Laufzeit.

## Tech-Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2
- DB: SQLite (Datei unter ./data/meters.db)
- Frontend: React 18 + Vite + TypeScript, Tailwind CSS
- Charts: Recharts
- Auth: bcrypt (Passwort-Hash), Session-Cookie (httpOnly, SameSite=Strict, Secure)
- Tests: pytest + httpx (Backend), Vitest + React Testing Library (Frontend)
- Linting/Format: ruff, mypy --strict, eslint, prettier
- Package-Manager: uv (Python), pnpm (JS)

## Architektur
- Monorepo: /backend, /frontend, /docs, /deploy
- Frontend wird gebaut und vom FastAPI als Static Files ausgeliefert
- Ein Prozess, ein Port (Standard 8000)
- API-Routen unter /api/v1/..., alles andere → SPA-Fallback auf index.html
- Multi-User mit gemeinsamem Datenbestand (alle Nutzer sehen dieselben Zähler)
- Rollen: admin und recorder (siehe Sektion Auth & Benutzer)
- PWA-fähig (Manifest + Service Worker, offline-tauglich für Erfassung)

## Datenmodell

Drei Ebenen: MeasuringPoint → PhysicalMeter → Register → Reading

- MeasuringPoint (logische Messstelle, dauerhaft):
  id, name, type (electricity|gas|water), location,
  is_bidirectional, has_dual_tariff, created_at
  Beispiel: "Hauptzähler Strom Keller"

- PhysicalMeter (konkretes Gerät, wird getauscht):
  id, measuring_point_id, serial_number,
  installed_at, removed_at (nullable),
  initial_values (JSON: {obis_code: startwert})
  Beim Tausch: removed_at am alten setzen, neuen anlegen mit
  installed_at und Anfangsständen (meist 0, manchmal nicht).

- Register: id, physical_meter_id, obis_code, label, unit, is_active

- Reading: id, register_id, value (Decimal), reading_date,
  note, photo_path (optional), created_at, created_by_user_id

Werte als Decimal speichern, NIEMALS Float (Rundungsfehler bei
Zählerständen). reading_date strikt von created_at trennen –
Erfassung erfolgt oft nachträglich.

- User: id, username (unique), email (optional), password_hash,
  role (admin|recorder), is_active, created_at, last_login_at

- Session: id, user_id, token_hash, created_at, expires_at,
  last_seen_at, user_agent, ip_address

## Auth & Benutzer

Rollen:
- admin: alle Rechte (User-Verwaltung, MeasuringPoints/PhysicalMeter
  anlegen/bearbeiten/löschen, Zählerwechsel durchführen, Readings
  erfassen/bearbeiten/löschen, Export)
- recorder: Readings erfassen und eigene Readings (created_by = self)
  innerhalb von 24h bearbeiten/löschen. Kein Zugriff auf
  User-Verwaltung, keine MeasuringPoint-/PhysicalMeter-Änderungen,
  kein Zählerwechsel.

Registrierung: keine öffentliche Registrierung. Nur admin legt
User an. Beim Anlegen wird ein initiales Passwort gesetzt
(oder Einmal-Token generiert), das beim ersten Login geändert
werden muss (force_password_change Flag).

Login:
- Endpoint: POST /api/v1/auth/login (username, password)
- Bei Erfolg: Session-Cookie setzen, Session-Eintrag in DB
- Rate-Limit: 5 Fehlversuche pro Minute pro IP, danach 15 min Sperre
- Logout: POST /api/v1/auth/logout (invalidiert Session in DB)

Session:
- Server-seitig in DB (nicht JWT) – ermöglicht zentrales Invalidieren
- Default-Lebensdauer: 30 Tage Sliding-Expiration
- "Abmelden auf allen Geräten" für admin und für eigene User möglich

Passwort-Policy:
- Mindestens 12 Zeichen, kein anderes Komplexitätskriterium erzwingen
- bcrypt mit cost-factor 12
- Passwort-Änderung erfordert aktuelles Passwort
- Admin kann Passwort eines Users zurücksetzen (force_password_change=true)

Audit:
- Reading.created_by_user_id wird IMMER gesetzt
- Änderungen an Readings (update/delete) als AuditLog-Eintrag:
  AuditLog: id, user_id, action, entity_type, entity_id,
  diff (JSON: vorher/nachher), created_at
- Audit auch für: User-Anlage/Deaktivierung, Rollen-Änderung,
  Zählerwechsel, Vergabe/Entzug von MP-Zugriffen
  (action=access_granted/access_revoked, entity_type=user),
  QR-Token-Lebenszyklus (action=token_created/token_assigned/
  token_unassigned/token_deleted, entity_type=qr_token)

Per-Recorder MP-Zugriff:
- Tabelle UserMeasuringPointAccess (Composite-PK user_id + mp_id, Cascade)
  steuert, welche MeasuringPoints ein Recorder lesen und bebuchen darf.
- Default für neue Recorder: keine Zuordnung (least privilege). Admin
  vergibt explizit, was sichtbar sein soll.
- Admin sieht und bedient alle MPs unabhängig von der Tabelle (kein
  Eintrag nötig — Rolle reicht).
- Filter greift in: GET /measuring-points (+/{id}/state, /consumption,
  /qr admin-only sowieso), GET /readings, /deliveries und beim POST/PATCH/
  DELETE auf Reading/Delivery via Pre-Check über register_id.
- Recorder bekommt 404 statt 403 auf nicht-zugeordnete MPs — verhindert
  Existenz-Leaks.
- Verwaltung: GET/PUT /api/v1/users/{id}/measuring-points (admin-only,
  PUT ersetzt das komplette Set, lehnt Admin-Targets mit 422 ab).
  Read-only-Liste pro MP: GET /api/v1/measuring-points/{id}/users.
- Side-Effect: GET /api/v1/export/dump.json ist jetzt admin-only
  (Voll-Backup ist als Recorder-Artefakt sinnlos und semantisch
  inkonsistent mit dem Filter-Modell).

## Gleichzeitige Erfassung (Concurrency)

Mehrere Nutzer können parallel Readings erfassen. Konflikte werden
auf DB-Ebene behandelt:

- Eindeutigkeit: UNIQUE (register_id, reading_date) verhindert
  Doppelerfassung desselben Stichtags durch zwei Nutzer
- Bei Konflikt: HTTP 409 mit Hinweis auf existierendes Reading
  (inkl. created_by und Wert) – Frontend zeigt Vergleichsdialog
- Optimistic Locking nicht nötig (Readings sind append-only,
  Updates selten und nur durch admin oder Ersteller innerhalb 24h)
- SQLite im WAL-Modus betreiben (PRAGMA journal_mode=WAL),
  sonst blockieren parallele Writes
- Lange Transaktionen vermeiden, Foto-Uploads NICHT in der
  DB-Transaktion verarbeiten

## OBIS-Register pro Messstellentyp

Strom (je nach Konfiguration der MeasuringPoint):
- Wenn !has_dual_tariff: 1.8.0 (Bezug)
- Wenn !has_dual_tariff und is_bidirectional: zusätzlich 2.8.0 (Einspeisung)
- Wenn has_dual_tariff: 1.8.1 (HT) und 1.8.2 (NT) statt 1.8.0
- Wenn has_dual_tariff und is_bidirectional: zusätzlich 2.8.1 und 2.8.2

Gas: ein Register (interne Bezeichnung 7.8.0, Einheit m³)
Wasser: ein Register (Einheit m³, kein OBIS-Standard)

Bei der Erfassung werden ausschließlich die aktiven Register des
aktuell gültigen PhysicalMeter abgefragt.

## Verbrauchsberechnung

- Verbrauch wird pro Register berechnet, nicht pro Zähler
- Verbrauch zwischen zwei Readings = value_neu − value_alt,
  beide MÜSSEN am selben PhysicalMeter hängen
- Über Zählerwechsel hinweg: Verbrauch des Wechselzeitraums =
  letzter Stand am alten Meter − vorletzter Stand am alten Meter,
  ab installed_at neu beginnend mit initial_values des neuen Meters
- Aggregation auf MeasuringPoint-Ebene summiert über alle
  PhysicalMeter im jeweiligen Zeitraum
- Rollover (mechanischer Zähler): wenn value_neu < value_alt
  und kein Zählerwechsel dazwischen, als Überlauf behandeln
  (Konfiguration: max_value pro Register, default 99999.9)
- Eigenverbrauch PV NICHT berechnen (aus Bezug+Einspeisung allein
  nicht ableitbar, dafür wäre ein Smart-Meter-Reader nötig)

## Zählerwechsel-Workflow

Endpoint: POST /api/v1/measuring-points/{id}/replace-meter

Pflichtfelder:
- final_readings: Endstände aller aktiven Register des alten Zählers
- removed_at: Datum
- new_serial_number
- installed_at: Datum (>= removed_at)
- initial_readings: Startstände des neuen Zählers pro OBIS-Code

Atomar in einer Transaktion:
1. final_readings als Reading am alten PhysicalMeter speichern
2. removed_at am alten setzen, alle alten Register is_active=false
3. neuen PhysicalMeter mit Registern anlegen
4. initial_readings als erstes Reading am neuen PhysicalMeter

## API-Konventionen
- Routen: /api/v1/{ressource} (kebab-case bei Mehrwort-Ressourcen)
- JSON in/out, Datumsangaben als ISO-8601 (UTC)
- Decimal-Werte als String serialisieren (Pydantic-Konfiguration)
- Fehler im RFC-7807-Format (problem+json)
- Validierungsfehler mit feldbezogenen Details

## UI-Anforderungen
- Mobile-first (Erfassung am Zählerschrank mit dem Handy)
- Eingabe großer Touch-Targets, numerische Tastatur bei Zahlenfeldern
- Foto-Upload optional (vom Zählerstand zur Beweissicherung)
- Plausibilitätscheck beim Speichern: neuer Wert >= letzter Wert
  (außer Rollover oder Zählerwechsel) – Warnung, nicht harter Block
- Übersichtsdashboard mit Verbrauchsdiagrammen pro MeasuringPoint
  (Tag/Monat/Jahr aggregiert)
- Export als CSV (alle Readings) und JSON (vollständiger Dump)
- Login-Seite, "Passwort ändern"-Dialog, erzwungene Änderung beim
  ersten Login
- Admin-Bereich: User-Verwaltung (Liste, anlegen, deaktivieren,
  Rolle ändern, Passwort zurücksetzen), AuditLog-Ansicht
- Reading-Liste zeigt Ersteller-Namen pro Eintrag
- QR-Scan-Workflow (Token-Verheiratung):
  - Admin erzeugt im Bereich `/qr-codes` anonyme Tokens auf Vorrat
    (8-Zeichen Crockford-Base32, z.B. `K7MP3X9F`). Tokens werden in einer
    eigenen Tabelle `qr_token` verwaltet — nicht direkt aus der MP-ID
    abgeleitet.
  - Bulk-Druck: ausgewählte Tokens werden auf einem A4-Bogen ausgedruckt.
    Drei Layouts wählbar (gespeichert in localStorage):
    `cut-2x4` (Schnitt-Bogen 95×65 mm, 8/Bogen — Default, mit Token-Text
    und MP-Namen), `avery-l4731rev` (25,4 × 10 mm, 7×27 = 189/Bogen) und
    `avery-3320` (32 × 10 mm, 4×11 = 44/Bogen). Auf den Avery-Bögen wird
    nur der QR als 10×10 mm Quadrat mittig pro Etikett gedruckt — keine
    Token-/MP-Beschriftung, weil sie auf dieser Größe nur Platz kostet.
    Für die Avery-Bögen sind Margin/Pitch in mm im UI feinjustierbar
    (Override pro Layout in localStorage). Wichtig in
    `QrTokensPrintSheet.tsx`: `window.open` darf NICHT mit `noopener`
    aufgerufen werden — sonst gibt der Browser `null` zurück und das
    `document.write` greift nie (weiße Seite).
  - Vor Ort: Mitarbeiter scannt mit Smartphone-Kamera (oder In-App-Scanner
    `html5-qrcode`, lazy-loaded), landet auf `/erfassen?token=…`. Backend
    löst über `GET /api/v1/qr-tokens/{token}/resolve` auf:
    - zugeordnet → MP wird vorausgewählt, sofort erfassen
    - frei + Berechtigung → Assign-Modal mit MP-Dropdown
    - frei ohne Berechtigung → Hinweis "Bitte Admin um Zuordnung bitten"
    - unbekannt → "Ungültiger QR-Code"
  - Token-Endpoints (`/api/v1/qr-tokens`): Listing/Bulk-Create/Render-QR
    /Unassign/Delete sind admin-only. Der Assign-Endpoint ist auch für
    Recorder offen, deren `User.can_assign_qr_tokens=true` ist — und nur
    für MPs, auf die der Recorder über Feature B Zugriff hat.
  - `parseScannedUrl` versteht zusätzlich das Legacy-Format `?mp=X` für
    eventuell noch existierende ausgedruckte Direkt-URL-Etiketten —
    neu wird nur noch `?token=X` ausgegeben.
  - Permissions-Policy: `camera=(self)` für Same-Origin-Kamera-Zugriff.
  - Der frühere Endpoint `GET /api/v1/measuring-points/{id}/qr` ist
    entfernt (Direkt-URL-Druck wird nicht mehr unterstützt).

## Konventionen
- Python: ruff (lint+format), mypy strict, type hints überall
- TypeScript: strict mode, kein `any`, kein `as` ohne Begründung
- Commits: Conventional Commits (feat:, fix:, chore:, refactor:, test:)
- Branch-Naming: feature/..., fix/..., chore/...
