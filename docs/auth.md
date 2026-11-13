# Auth & Benutzer

> Ausgelagert aus CLAUDE.md, damit die Projekt-Memory schlank bleibt.


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
- Die Fehlversuchs-Zähler (IP und Username) werden erst nach **vollständig**
  erfolgreichem Login geleert — bei aktivem 2FA also erst nach
  `/2fa/verify`, nicht schon nach dem korrekten Passwort. Sonst ließe sich
  der 6-stellige Code per Re-Login unbegrenzt durchprobieren.
- Client-IP für Rate-Limit und Audit: ohne `trust_proxy` die direkte
  Verbindung; mit `trust_proxy` das **rechteste** `X-Forwarded-For`-Element,
  das kein vertrauenswürdiger Proxy ist (nginx/NPM hängen die echte IP
  hinten an, das linke Element ist vom Client frei wählbar). Mit
  `trusted_proxy_ips` wird XFF nur von diesen Peers akzeptiert.
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
  Existenz-Leaks. Das gilt auch für QR-Tokens: `resolve` und `assign`
  antworten bei einem Token an einer fremden MP mit 404 (kein 409 mit
  `measuring_point_id`).
- Verwaltung: GET/PUT /api/v1/users/{id}/measuring-points (admin-only,
  PUT ersetzt das komplette Set, lehnt Admin-Targets mit 422 ab).
  Read-only-Liste pro MP: GET /api/v1/measuring-points/{id}/users.
- Side-Effect: GET /api/v1/export/dump.json ist jetzt admin-only
  (Voll-Backup ist als Recorder-Artefakt sinnlos und semantisch
  inkonsistent mit dem Filter-Modell).
- **ACHTUNG — `can_billing` hebelt diesen Filter aus.** Das Merkmal
  (siehe `docs/features.md`) öffnet die Abrechnungs-Endpoints
  (`/billing-circles/**`, `/billing-invoices/**`, `/billing-runs/**`) über
  die Dependency `require_billing`. Diese Routen wenden `restrict_mp_query`
  bewusst **nicht** an: wer abrechnet, muss quer über alle Messstellen
  rechnen können. Ein Recorder mit `can_billing=True` liest damit
  Zählerstände, Seriennummern und Verbräuche **aller** Messstellen —
  auch derer, für die er keinen `UserMeasuringPointAccess`-Eintrag hat.
  Das Merkmal ist also kein reiner Modul-Schalter, sondern erweitert die
  Lesesicht. Beim Vergeben entsprechend bewerten; die Schreibrechte auf
  Readings bleiben davon unberührt.


Passwortwechsel und Sessions:

- `POST /auth/change-password` **rotiert die Session**: alle bestehenden
  Sessions werden widerrufen und sofort eine neue ausgestellt (neues Cookie
  in der Antwort). Der Nutzer bleibt im aktuellen Browser angemeldet, alle
  anderen Geräte fliegen raus.
- Die Rotation ist Absicht und nicht optional: ein gestohlenes Cookie ist
  derselbe Token wie der des Opfers. Würde die aktuelle Session verschont,
  überlebte ausgerechnet der Diebstahl den Passwortwechsel.
- Der Admin-Reset (`POST /users/{id}/reset-password`) widerruft ebenfalls
  alle Sessions, stellt aber keine neue aus.

TOTP-Replay-Schutz:

- Jeder 30-Sekunden-Zeitschritt gilt **genau einmal** je Nutzer
  (`User.last_totp_counter`, Migration 0042). Ein abgefangener Code ist
  damit nicht mehr im gesamten Toleranzfenster (±1 Step = bis zu 90 s)
  wiederverwendbar.
- Praktische Folge: zwei Anmeldungen unmittelbar hintereinander brauchen
  zwei verschiedene Codes — die zweite wartet auf das nächste Fenster.
- Der Zähler ist reine Zeit und gilt secret-übergreifend. `/2fa/setup` und
  `/2fa/disable` setzen ihn deshalb zurück, sonst schlüge eine
  Neueinrichtung im selben Zeitschritt fehl.
- Springt die Serveruhr zurück (NTP-Korrektur, LXC-Suspend), ist TOTP
  gesperrt, bis die Realzeit aufgeholt hat. Escape-Hatch sind die
  Backup-Codes — sie werden geprüft, nachdem TOTP fehlgeschlagen ist.

Re-Auth für 2FA-Aktionen:

- `/2fa/disable` und `/2fa/backup-codes/regenerate` verlangen das aktuelle
  Passwort und — bei aktivem 2FA — einen gültigen TOTP- oder Backup-Code
  (`_require_reauth`). Ein entwendetes Session-Cookie allein reicht damit
  nicht, um 2FA abzuschalten oder sich frische Backup-Codes als dauerhaften
  zweiten Faktor zu verschaffen. Regenerate schreibt den Audit-Eintrag
  `backup_codes_regenerated`.

Logout im Frontend:

- Lokal (Me-Snapshot, Offline-Queue, Dashboard- und SW-Cache `api-get`)
  wird nur abgemeldet, wenn `POST /auth/logout` erfolgreich war oder mit 401
  antwortet. Bei Netz-/Serverfehler bleibt der User angemeldet und sieht
  eine Fehlermeldung — sonst blieben Server-Session und Cookie auf einem
  geteilten Gerät unbemerkt gültig.
- Der SW-Cache `api-get` wird außerdem bei 401 von `/auth/me` und beim Login
  eines **anderen** Users geleert.

Verlorene Sitzung im laufenden Betrieb:

- Die Oberfläche kann angemeldet aussehen, obwohl der Server die Sitzung nicht
  (mehr) kennt: Sitzung abgelaufen, Server mit anderer Datenbank oder anderem
  `METERS_SECRET_KEY` neu gestartet, oder nach einem Netzfehler aus dem
  Me-Snapshot wiederhergestellt.
- `lib/api.ts` meldet deshalb jedes 401 außerhalb der Endpunkte unter `/auth/`
  über `lib/authEvents.ts` (`reportUnauthorized`). Der `AuthProvider` hört
  darauf (`subscribeUnauthorized`), prüft `/auth/me` neu und landet über den
  401-Zweig von `refresh` auf der Anmeldung (Snapshot und Caches werden geleert).
  401 der Auth-Endpunkte selbst (falsches Passwort, `/auth/me` ohne Sitzung)
  lösen nichts aus.
- Große Anfragen ohne gültige Sitzung: Das Body-Limit (`core/body_limit.py`)
  läuft **vor** der Auth und lässt ohne Sitzung nur 64 KiB zu. Größere Bodies
  beantwortet es mit **401 „Nicht angemeldet oder Sitzung abgelaufen“**, ohne
  ein Byte zu lesen — nicht mit 413, sonst sucht man (z. B. beim
  Restore-Upload) nach einem Größenlimit statt nach der Anmeldung. Nur unter
  `/api/v1/auth/` bleibt es bei 413. Mit gültiger Sitzung gilt
  `METERS_REQUEST_MAX_BODY_BYTES`, für `/restore/upload`
  `METERS_BACKUP_MAX_UPLOAD_BYTES`; darüber weiterhin 413.

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

