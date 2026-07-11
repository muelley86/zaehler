# Code-Audit — Zählerstand-App

Stand: 2026-05-05, Branch `main`, Commit-HEAD aktuell.

Methodik: vier parallele Code-Walks (CLAUDE.md/Datenmodell, Sicherheit, Tests, Performance/Code-Qualität). Befunde sind anschließend einzeln im Quelltext nachverifiziert. Wo nicht eindeutig nachprüfbar, ist das mit „**Unsicher**" markiert.

Schweregrad-Skala: **kritisch** (Datenverlust, RCE, breite Privilege-Eskalation), **hoch** (klare Sicherheitslücke / Korrektheitsbug mit Auswirkung auf alle User), **mittel** (Korrektheits- oder Härtungsproblem, eingeschränkter Blast-Radius), **niedrig** (Hygiene, Doku, Stilfragen).

Keine Code-Änderungen sind in diesem Audit enthalten — Befunde sind reine Diagnose.

---

## Voll-Audit (2026-07-04, v2.67.1, HEAD `7e41e1c`)

Anlass: Seit den letzten Audits (Code-Walk 2026-05-05 + Status-Nachtrag 29.05.
unten; Tool-Audit `audit/security_audit_040626.md`) sind **57 Commits / ~13
Releases (v2.55–v2.67.1)** dazugekommen, mit großen, bis dato **nie auditierten**
Features: Voll-Backup-ZIP + GUI-Restore, virtuelle (verrechnete) Messstellen,
Eigentümer-/Lieferanten-/Mieter-Stammdaten mit periodisierten Zuordnungen,
Reports-Erweiterungen, Node-24-Anhebung. Zusätzlich rückt der geplante
**Firmen-Rollout** Skalierung in den Vordergrund.

Methodik: Tool-Sweep (dieselbe Suite wie Juni, Roh-Ausgaben in
`audit/raw-20260704/`) + 4 parallele Code-Walks (Security Backend, Security
Frontend/Deploy/CI, Performance/Skalierung Backend, Frontend-Qualität). **Jeder**
Befund wurde anschließend einzeln im Quelltext (und wo relevant gegen die Tests)
nachverifiziert; nicht belegbare Tool-/Agenten-Treffer sind unten transparent als
False Positives geführt. Kein Anwendungscode wurde in diesem Audit geändert.

Schweregrade: **hoch** (Sicherheitslücke/Korrektheits- oder Skalierungsproblem mit
breiter Wirkung), **mittel** (eingeschränkter Blast-Radius / Härtung), **niedrig**
(Hygiene). Keine **kritischen** Befunde.

### A. Neue Befunde (verifiziert)

| ID | Schweregrad | Datei:Zeile | Befund | Minimal-Fix (funktionserhaltend) |
|---|---|---|---|---|
| **N-1** | hoch | `api/v1/{mieters,owners,suppliers}.py:43/31/31` (`list_*`, `CurrentUser` statt `AdminUser`) | Jeder eingeloggte **Recorder** kann per `GET /api/v1/mieters` bzw. `/owners`/`/suppliers` die **komplette** Stammdatenliste systemweit lesen — inkl. Mieter-Klarname + **Privatadresse/E-Mail/Telefon** und Eigentümer-**USt-/Steuer-ID** — unabhängig von seinem `UserMeasuringPointAccess`. Durch Test `test_mieters.py:96` / `test_owners.py` (Recorder → 200) belegt; per Docstring als „jeder eingeloggte User darf lesen" **bewusst** so gebaut, durchbricht aber das sonst konsequente 404-statt-403-Zugriffsmodell für die sensibelsten PII. DSGVO-relevant beim Firmen-Rollout (Recorder Standort A sieht Mieter-PII aller Standorte). | Für Nicht-Admins reduziertes Read-Modell (nur `id` + Anzeigename für Dropdown/Filter) oder separater `…/lookup`-Endpoint; volle Felder admin-only. **Funktionsrisiko:** Recorder-Frontend gegenprüfen, ob es mehr als den Namen braucht (Filter-UI nutzt nur `id`+Label). |
| **N-2** | hoch | Deps: `starlette 1.0.1`, `python-multipart 0.0.27` (`backend/uv.lock`) | Zwei **produktionswirksame** DoS-CVEs (osv-scanner): starlette urlencoded-Form-DoS (GHSA-82w8-qh3p-5jfq, CVSS 7.5 — `request.form()` ignoriert `max_fields`/`max_part_size` bei `x-www-form-urlencoded`) und python-multipart quadratische Parse-Zeit bei Semikolon-Feldern (GHSA-5rvq-cxj2-64vf, 7.5). Unauth. erreichbar über jeden Form-Endpoint (Login-POST). | `starlette>=1.3.1`, `python-multipart>=0.0.30`. FastAPI 0.136.1 verlangt nur `starlette>=0.46` → Bump kollisionsfrei. Deploy-sicher **ohne** pnpm/uv-Overrides (Lehre aus #241/#242). **Funktionsrisiko:** minimal, Patch-/Minor-Bumps. |
| **N-3** | mittel | `services/restore.py:164-201` (`_extract_archive`) | Restore-ZIP: `_copy_limited` begrenzt nur die **komprimierte** Upload-Größe (1 GiB). Beim Entpacken wird weder `member.file_size` noch eine laufende Summe geprüft → **Dekompressions-Bombe** kann das Filesystem füllen → Totalausfall (SQLite-Writes/WAL) für alle. Admin-only, aber mit dem Rollout viele Admin-Konten. | In `_extract_archive` vor dem Kopieren `member.file_size` + laufende Gesamtsumme gegen harten Deckel prüfen (JPEGs komprimieren kaum → großzügiger Faktor bricht nichts). **Funktionsrisiko:** keins für legitime Backups. |
| **N-4** | mittel | `services/restore.py:114-128` + `216-235` (`_cleanup_expired`/`stage_upload`) | Ein Staging-Verzeichnis wird erst **am Ende** von `_stage_into` in `_staged` registriert. Ein parallel laufender zweiter Upload sieht es als „verwaist" und `rmtree`t es mitten im ersten Vorgang → unbehandelte `FileNotFoundError` (500) im Wartungs-Flow. Kein TTL-Ablauf nötig, nur zeitliche Überlappung (großes Backup, langsame Leitung, Mehr-Admin). | Verzeichnis sofort nach `mkdir()` in eine lock-geschützte „reserved"-Menge eintragen; Orphan-Sweep respektiert sie. **Funktionsrisiko:** rein interne State-Verwaltung. |
| **N-5** | mittel | `api/v1/restore.py:28`, `api/v1/imports.py:29` | Kein Rate-Limit / keine Nebenläufigkeitsbegrenzung auf `/restore/upload` (bis 1 GiB + Extraktion/Integritätscheck je Aufruf) und `/imports/*` (openpyxl-Parsing). Einziger Limiter im Backend ist Login/2FA. Zweite Verteidigungslinie fehlt (kompromittiertes Admin-Konto). | Vorhandenes Limiter-Muster pro `user.id` wiederverwenden, oder Anzahl offener `_staged`-Einträge deckeln (sonst 429). **Funktionsrisiko:** keins bei sinnvoller Schwelle (Restore/Import selten). |
| **N-6** | mittel | `features/dashboard/DashboardPage.tsx:838-843` (`csvField`) | Dashboard-CSV-Export fehlt der **Formel-Injection-Schutz** (`'`-Präfix bei führendem `= + - @`), den `ReadingsListPage.tsx`/`ReportsPage.tsx` haben **und CLAUDE.md für alle drei Frontend-CSVs dokumentiert**. Exportierte Freitextfelder (`mp.name`, `current_owner_name`, `main_location_name`, `installation_location`) landen unescaped → CSV-Formel-Injection in Excel/Calc (CWE-1236). | `^[=+\-@]`-Präfix-Behandlung ergänzen; sauber: gemeinsames `lib/csv.ts` (DRY gegen künftige Drift). **Funktionsrisiko:** keins für normale Werte. |
| **N-7** | mittel | `deploy/lxc/zaehler.sh:552,1377,1512` (`as_user`, `:140`) | `as_user()` führt `sudo -u zaehler bash -lc "... $*"` aus — **zweite** Shell-Auswertung. Das Passwort wird via `--password '$WIZ_ADMIN_PASSWORD'`/`$admin_pw`/`$pw` interpoliert; nur Längenprüfung (≥12), keine Zeichenprüfung. Ein `'` bricht aus → Command-Injection als User `zaehler` (darf `systemctl restart`, schreibt `meters.env`/`METERS_SECRET_KEY`). Bricht mindestens jede Provisionierung mit `ADMIN_PASSWORD` aus einem Secret-Store, dessen Zeichensatz nicht kontrolliert ist (`install`/`fix-database`/`reset-password`). | Passwort vor Interpolation escapen: `pw_esc=${WIZ_ADMIN_PASSWORD//\'/\'\\\'\'}` → `--password '$pw_esc'` (o. `printf %q`). **Funktionsrisiko:** keins; Passwörter mit `'` funktionieren danach zusätzlich korrekt. |
| **N-8** | niedrig | `features/readings/RecordReadingPage.tsx:132`, `features/scanner/TokenAssignSheet.tsx:44` | `?token=`-Query-Param wird — anders als überall sonst (`parseScannedUrl` mit `TOKEN_RE`, Print-Sheet mit `encodeURIComponent`) — **ungeprüft/unkodiert** in `api.get(\`/qr-tokens/${tokenParam}/resolve\`)` interpoliert. `..%2f`-Sequenzen verschieben den (credentialed) Fetch-Pfad same-origin. Backend-AuthZ + POST-only-Mutationen mildern die Wirkung. | Vor Nutzung `TOKEN_RE`-Prüfung (sonst verwerfen) bzw. `encodeURIComponent`. **Funktionsrisiko:** keins; gültige 8-Zeichen-Tokens unverändert. |
| **N-9** | niedrig | `features/admin/qr-codes/QrCodesAdminPage.tsx:74` (`loadPrefs`), `QrTokensPrintSheet.tsx:293` | localStorage-Druckparameter (`marginTopMm`…) werden per `as Partial<StoredPrefs>` **ohne Laufzeitprüfung** übernommen und unescaped in ein `style="…"`-Attribut via `document.write()` interpoliert. Ein `"` bricht aus dem Attribut → HTML/CSS-Injection im Druckfenster (CSP `script-src 'self'` verhindert Skript). Braucht Erst-Zugriff (DevTools/andere XSS). | Beim Laden je Feld `Number.isFinite(...)` prüfen (Fallback Default), analog zur schon vorhandenen `handleChange`-Validierung. **Funktionsrisiko:** keins für gültige Werte. |
| **N-10** | niedrig | `deploy/lxc/zaehler.sh:183-191` | Neu mit #290 (Node-24): NodeSource-Installer wird nach festem `/tmp/nodesource_setup.sh` geladen und als root ausgeführt (TOCTOU/Symlink-Race; keine Signaturprüfung). LXC ist Einzelzweck-Container → Risiko klein. | `tmp_setup=$(mktemp)` statt festem Pfad. **Funktionsrisiko:** keins. |
| **N-11** | niedrig | `deploy/systemd/zaehler.service:37,59` | `ReadWritePaths=/opt/zaehler` weiter als nötig (wegen `uv run`-Re-Sync beim Start) → RCE im App-Prozess könnte eigenen Code/venv persistent ändern. | `ExecStart … uv run --no-sync …` + `ReadWritePaths=/opt/zaehler/data`. **Funktionsrisiko:** prüfen — `--no-sync` startet bei pyproject-Drift ohne Auto-Sync; Deploy macht `uv sync --frozen` bereits separat. Beide Deploy-Varianten unberührt. |
| **N-12** | niedrig | `api/v1/imports.py:43-45` | Import liest die Datei komplett (`file.file.read()`), **dann** erst 5-MB-Prüfung — inkonsistent zum chunk-weisen `_copy_limited`. Bei 5-MB-Cap harmlos, würde bei Limit-Anhebung/Wiederverwendung zum Problem. | Chunkweise lesen + früh abbrechen. **Funktionsrisiko:** keins (gleicher 400). |

### B. Skalierungs-Befunde (Firmen-Rollout, verifiziert)

| ID | Schweregrad | Datei:Zeile | Befund | Minimal-Fix |
|---|---|---|---|---|
| **P-1** | hoch | `api/v1/measuring_points.py:194-216` (`measuring_points_with_state`) | Reicht **keine** Bulk-Dicts durch → jede MP fällt auf `current_assignment`+`current_supplier_assignment`+`current_mieter_assignment` **und** `state_for_measuring_point` einzeln zurück ≈ **1 + 6·N Queries**. Genutzt von `GET /{owners,suppliers,mieters,locations,main-locations}/{id}/measuring-points`. Bei 150 MPs >900 Roundtrips je Detailseite. Das korrekte Bulk-Muster existiert bereits in `list_measuring_points:226-254`. | Bulk-Dicts (`current_*_assignments_bulk`) durchreichen + Bulk-State-Query über alle MP-IDs. **Funktionsrisiko:** keins (identische Werte/Reihenfolge). |
| **P-2** | hoch | `api/v1/dashboard.py:85-121` | Schleife über alle zugänglichen MPs ruft `state_for_measuring_point` (pro MP) + bei Nicht-Monats-Granularität `consumption_for_measuring_point` (lädt **komplette** Historie je MP) auf; `from_at`/`to_at` filtern erst in Python → Datenmenge wächst mit Gesamt-Historie, nicht mit dem Zeitraum. | State bulk (eine Query über alle MP-IDs) + Request-Cache `mp_id→points` (mit P-3/P-4 geteilt). **Funktionsrisiko:** keins bei korrektem Bulk; Cache nur pro Request. |
| **P-3** | hoch | `services/virtual_measuring_point.py:86-95` + `dashboard.py:134-154` | Virtuelle MPs laden die volle Komponenten-Historie erneut, obwohl dieselbe MP im selben Request oft schon geladen wurde → dieselbe teure Voll-Ladung 2–3× pro Request. | Gemeinsames `points_cache` durchreichen. **Funktionsrisiko:** keins (identische Rohpunkte). |
| **P-4** | hoch | `services/report_aggregation.py:177-180` | `aggregate_report` iteriert über **alle** MPs des Mandanten und lädt bei Nicht-Monats-Granularität pro MP die volle Historie (auch `/reports/aggregate.csv`); kein Zeitraum-Pushdown in SQL. | Gemeinsamer Request-Cache (mit P-2/P-3); mittelfristig `daily_consumption`-Materialisierung analog `monthly_consumption`. **Funktionsrisiko:** keins bei Caching der Rohpunkte. |
| **P-5** | mittel | `services/{owner,supplier,mieter}_assignment.py` + Migrationen `20260528_1228`/`20260612_1100`/`20260615_1200` | Invariante „genau ein offenes Assignment je MP" nur per Check-then-Insert in der App; **kein** Partial-Unique-Index `WHERE valid_to IS NULL` (Migrationen legen nur `unique=False`-Indizes an). Zwei parallele Admin-Requests können still zwei offene Perioden anlegen. Referenzmuster existiert: `20260505_1000_one_active_meter.py`. | Partial-Unique-Index je Tabelle + `IntegrityError`→409 (wie `replace_meter_endpoint`). **Funktionsrisiko:** keins im Normalbetrieb (spiegelt die App-Prüfung). |
| **P-6** | mittel | `api/v1/search.py:74-111` | Kein `.limit()` im SQL: kurzer Substring (`MIN_QUERY_LEN=2`) matcht bei großer Firma viele MPs, alle werden voll eager-geladen (Location/MainLocation/PhysicalMeter/Owner-Historie) + in Python sortiert, erst dann auf `limit` gekürzt. | SQL-Hard-Cap `.limit(1000)` (deutlich > `MAX_LIMIT=200`) vor der Python-Sortierung. **Funktionsrisiko:** minimal (Cap großzügig). |
| **P-7** | mittel | `services/monthly_consumption.py:136-150` (`_after_commit`) | Cache-Neuberechnung ist **nicht** O(n²) (dedupliziert auf Register), läuft aber **synchron** im Request-Thread; ein initialer Massenimport (hunderte Register) blockiert die Response → Reverse-Proxy-Timeout-Risiko. | Für `/imports/readings/commit` `_SKIP_KEY` setzen + Recompute via `BackgroundTasks` nach Response. **Funktionsrisiko:** kurz veraltete Monats-Diagramme bis der Task durch ist (wie bereits akzeptiertes Stale-Verhalten). |

### C. Frontend-Qualität (verifiziert)

| ID | Schweregrad | Datei:Zeile | Befund | Minimal-Fix |
|---|---|---|---|---|
| **Q-1** | mittel | `features/admin/measuring-points/MeasuringPointDetailPage.tsx:1561-2560` | ~970 Zeilen (38 %) sind 3× struktur-identische Historien-Cards (Owner/Mieter/Supplier; Kommentar: „1:1-Spiegel"). Jede Verhaltensänderung 3× pflegen → Drift-Gefahr. | Generische `AssignmentHistoryCard<T>` (analog vorhandenem `MasterDataList<T>`). **Funktionsrisiko:** keins bei sorgfältiger Extraktion. |
| **Q-2** | mittel | s. Datei `:101-154,203-213` | Geteilter `tick`-Zähler: jede Card-Änderung triggert **beide** Top-Level-`useEffect`s (4 Requests), auch irrelevante. | Card-spezifische `onChanged`-Callbacks / PATCH-Rückgabewert statt Full-Refetch. **Funktionsrisiko:** gering — prüfen, dass Stammdaten-Card nach Perioden-Wechsel aktuell bleibt. |
| **Q-3** | mittel | s. Datei `:1245-1254` (`RegisterTable`) | Map+flatMap+sort bei jedem Render, während das analoge `sortedMeters:725` bewusst `useMemo` hat. | `useMemo([states, mp.physical_meters])`. **Funktionsrisiko:** keins. |
| **Q-4** | mittel | `lib/api.ts:31-79` | `request()` und `upload()` duplizieren Response-Parsing/`ProblemDetails`/`ApiError` wortgleich. | Gemeinsame `parseJsonResponse<T>()`-Hilfsfunktion. **Funktionsrisiko:** keins. |
| **Q-5** | niedrig–mittel *(unsicher, skalenabhängig)* | `MeasuringPointsAdminPage.tsx:343`, `ReadingsListPage.tsx:423/740`, `ReportsPage.tsx:793/847` | Ungebremstes Rendern großer Listen/Tabellen (MP-Liste, „Alle anzeigen", Report-Tabellen) ohne Virtualisierung/Cap — heute (Haushalt) unkritisch, beim Firmen-Rollout spürbar. | Warnschwelle/Cap oder Virtualisierung (`react-window`) ab >100–500 Zeilen; CSV als Pfad für große Mengen. **Funktionsrisiko:** Virtualisierung ändert DOM → RTL-Tests anpassen. |

### D. Status der 5 offenen Alt-Befunde (aus Nachtrag 2026-05-29)

- **2.3** (Dashboard-Datumsfilter per String-`.slice(0,10)`): ✅ **behoben** — Zeitraum geht als `from_at`/`to_at`-Query an `/dashboard` (`DashboardPage.tsx:215`).
- **7.2** (`ReadingsListPage.tsx` >1000 Z.): ⬜ **offen** — 1492 Z. (intern via `memo`/`useCallback` sauber, nur Datei-Split offen).
- **1.5** (`register.is_active` bool vs. `physical_meter.removed_at` timestamp): ⬜ **offen** (Design-Entscheidung, kein Bug).
- **6.3** (`services/consumption.py` Python-`sorted()`): ⬜ **offen** (bewusst, kleine Mengen; siehe aber P-2/P-4, die dieses Laden in heißen Pfaden multiplizieren).
- **7.1** (Audit-`record()` inline dupliziert): ⬜ **offen** — 56 Aufrufe über 15 Dateien, kein Decorator/Context-Manager.

### E. Bewusst NICHT als Befund gewertet (False Positives / bekannt / zurückgestellt)

Belegt die „keine False Positives"-Anforderung — diese Tool-/Agenten-Treffer wurden geprüft und verworfen:

- **Bandit B608** `restore.py:158` (`SELECT COUNT(*) FROM "{table}"`): Tabellenname aus **fester** interner Whitelist (`user`/`measuring_point`/`reading`/`reading_photo`), kein User-Input → **False Positive**.
- **Bandit B104** `config.py:62` (`0.0.0.0`) & **Semgrep bcrypt-hash** `auth.py:34` (`_DUMMY_PASSWORD_HASH`, Anti-Timing) & **Default `secret_key`** (Boot-Assertion): **bekannt/bewusst**, unverändert.
- **Semgrep Flask-format-string** `qr_tokens.py:87`, `qr.py:67`: FastAPI liefert JSON/String, kein Flask-HTML-Template; f-String baut nur eine URL — **False Positive** (Flask-Heuristik auf FastAPI).
- **Semgrep logger-credential-leak** `qr_tokens.py:254`: loggt `token_str[:2]…` (maskiert), kein Secret → **False Positive**.
- **Semgrep postMessage `'*'`** `handoff/mockup/tweaks-panel.jsx`: Mockup, **nicht ausgeliefert** → **False Positive**.
- **Semgrep uv/pnpm-Supply-Chain-Hygiene** (`exclude-newer`/`minimumReleaseAge`/`blockExoticSubdeps`/`trustPolicy`): Härtungs-**Empfehlungen**, keine Schwachstellen; als optionale Supply-Chain-Härtung fürs Rollout notiert (niedrig), kein Befund.
- **osv `pydantic-settings` 2.14.0→2.14.2** (GHSA-4xgf, 7.1): Symlink-Bypass **nur** bei `secrets_nested_subdir=True` — App nutzt das nicht → **nicht ausnutzbar** (Mitnahme-Bump optional).
- **osv `starlette` GHSA-wqp7 (SSRF)**: nur Windows (UNC/`StaticFiles`); LXC ist Linux → **nicht anwendbar** (durch N-2-Bump ohnehin miterledigt).
- **osv `form-data` 4.0.5→4.0.6** (npm, 8.7): **dev-only** (via `jsdom`→`vitest`), nicht ausgeliefert → niedrig, kein Prod-Befund.
- **gitleaks (5 Treffer)**: ausschließlich Test-Passwörter in `backend/tests/` → **bekannt**.
- **trufflehog**: 0. **zizmor**: 0 (CI-Härtung nach Node-24 #290 intakt). **checkov**: 0. **shellcheck SC2155** `zaehler.sh:822,1364`: Rückgabewert-Maskierung, niedrig (schon im Juni notiert).
- **Zurückgestellte Items** (nicht neu „entdeckt"): TOTP-Secret-Klartext-at-rest, `cookie_secure`-LAN-Default, HMAC-Session-Lookup nicht constant-time. Unverändert wie dokumentiert. Die Offline-Queue (PWA) ist inzwischen ✅ umgesetzt (v2.69.0, PR #321/#324).
- **Sauber gegengeprüft (kein Befund):** Zip-Slip/Symlink im Restore (Whitelist-Extraktion + `test_restore_ignores_zip_slip_entries`), Maintenance-503-Gate, Restore-Rollback-Vollständigkeit, virtuelle-MP-Zyklen (FK nur auf reale MP), Foto-IDOR/Traversal (`photo_full_path` `resolve()`+`is_relative_to`, Pillow-Decode), `search`/`entries`/`dashboard`/`report_aggregation` MP-Zugriffsfilter, QR-Assign-Scope, Origin-Check auf Multipart, alle `target="_blank"` mit `rel="noopener"`, kein `dangerouslySetInnerHTML`, kein `any`.

### F. Priorisierter Maßnahmenplan (für den Folge-Schritt, PR-Schnitt)

Getrennte PRs je Themen-Cluster (Konvention: mehrteilige Aufgaben splitten):

1. **`fix(deps)`** — N-2: starlette ≥1.3.1 + python-multipart ≥0.0.30 (ohne Overrides, Lockfile-Regen). *Löst produktive DoS-CVEs, kleinstes Risiko.* Mitnahme optional: pydantic-settings 2.14.2.
2. **`fix(security)` PII** — N-1: Recorder-Read der Stammdaten auf `id`+Name reduzieren / `…/lookup`-Endpoint; volle Felder admin-only. *Höchste Datenschutz-Priorität für den Rollout.* Frontend-Recorder-Ansicht mitprüfen.
3. **`fix(deploy)`** — N-7 (Passwort-Escaping) + N-10 (`mktemp`) + N-11 (`--no-sync`/`ReadWritePaths`) + SC2155. *Deploy-Härtung, ein PR.*
4. **`fix(restore)`** — N-3 (entpackte Größe) + N-4 (Staging-Race) + N-5 (Rate-Limit/Cap). *Restore-Härtungs-Cluster.*
5. **`fix(csv)`** — N-6: Formel-Schutz Dashboard + Extraktion `lib/csv.ts` (DRY). Kleiner PR.
6. **`perf(reports)`** — P-1..P-4: Bulk-Loading + geteilter Request-Points-Cache. *Größter Skalierungs-Hebel; ggf. P-1 (Detailseiten) und P-2..P-4 (Dashboard/Reports) in zwei PRs.*
7. **`fix(db)`** — P-5: Partial-Unique-Index gegen überlappende Zuordnungsperioden (+ Migration + 409-Handling).
8. **`fix(frontend)`** — N-8 (Token-Validierung) + N-9 (localStorage-Validierung). Kleine Härtungen.
9. **`chore`/`refactor` (niedrig)** — P-6 (Search-Cap), P-7 (Import-Background-Recompute), N-12; Q-1..Q-5 (Refactors) nach Bedarf.

### G. Umsetzungs-Nachtrag (2026-07-05) — Backlog vollständig abgearbeitet

Der komplette Maßnahmenplan aus §F wurde in **verhaltenserhaltenden** Einzel-PRs
(je Themen-Cluster) umgesetzt und über **sechs Releases** (2.67.2 → 2.68.3)
ausgeliefert. Jeder Befund einzeln im Quelltext verifiziert; bestehende Tests
blieben durchgehend grün (Backend 593→598, Frontend 328→337). **Alle 24 Befunde
aus §A/§B/§C sind erledigt & live** — es ist nichts aus diesem Audit mehr offen.

| ID | Status | Release | Umsetzung (Kurz) |
|---|---|---|---|
| **N-1** | ✅ | 2.67.2 | `list_*`/`get_*` für owners/suppliers/mieters auf `AdminUser`; `/{id}/measuring-points` bewusst offen (nur MP-Daten, keine PII). |
| **N-2** | ✅ | 2.67.2 | `starlette>=1.3.1` + `python-multipart 0.0.32` + `pydantic-settings 2.14.2`; **ohne** Overrides (Lehre #241/#242), osv `uv.lock`=0. |
| **N-3** | ✅ | 2.67.2 | Entpack-Größendeckel in `_extract_archive` (laufende Summe + `file_size`). |
| **N-4** | ✅ | 2.67.2 | Staging-Race behoben: `_reserved`-Set direkt nach `mkdir()`, Orphan-Sweep respektiert es. |
| **N-5** | ✅ | 2.67.2 | Upload-Cap `_MAX_CONCURRENT_STAGED=3` → 429 auf `/restore/upload`. |
| **N-6** | ✅ | 2.67.2 | `csvField` nach `lib/csv.ts` extrahiert (DRY), Dashboard-CSV bekommt Formel-Guard. |
| **N-7** | ✅ | 2.67.2 | `printf %q` gegen Command-Injection in `as_user` (3 Stellen). |
| **N-8** | ✅ | 2.67.2 | `TOKEN_RE`-Gate + `encodeURIComponent` vor `?token=`-Fetch. |
| **N-9** | ✅ | 2.67.2 | `sanitizeOverride` (Laufzeitprüfung) für localStorage-Druckparameter. |
| **N-10** | ✅ | 2.67.2 | `mktemp` statt festem `/tmp/nodesource_setup.sh` (+ SC2155). |
| **N-11** | ✅ | 2.68.1 + 2.68.2 | Zweistufig: Teil 1 `uv run --no-sync` (2.68.1); Teil 2 Code+venv read-only via **`ReadOnlyPaths=/opt/zaehler/repo/{backend,frontend}`** + `PYTHONDONTWRITEBYTECODE=1` (2.68.2). Ansatz ggü. §F **umgedreht** — reales LXC-Split-Layout (Fotos+Restore-Staging unter `/opt/zaehler/repo/data`) hätte ein enges `ReadWritePaths` gebrochen; `ReadWritePaths=/opt/zaehler` bleibt → null Funktionsrisiko. Am LXC verifiziert. |
| **N-12** | ✅ | 2.68.1 | `_read_limited` (chunkweises Lesen, früher Abbruch) statt `file.file.read()`. |
| **P-1** | ✅ | 2.67.3 | `measuring_points_with_state` reicht Bulk-Dicts + Bulk-State durch (1+6N → wenige Queries). |
| **P-2** | ✅ | 2.67.3 | Dashboard: Bulk-State + geteilter `PointsCache` (mit P-3/P-4). |
| **P-3** | ✅ | 2.67.3 | Virtuelle MPs teilen den Request-`PointsCache` (keine Doppel-Voll-Ladung). |
| **P-4** | ✅ | 2.67.3 | `aggregate_report` nutzt denselben `PointsCache`. |
| **P-5** | ✅ | 2.67.2 | Partial-Unique-Index `uq_*_assignment_open_per_mp` (Migration 0033) + `open_period_guard` → 409. |
| **P-6** | ✅ | 2.68.1 | `SEARCH_SQL_CAP=1000` (`.limit()`) vor der Python-Sortierung. |
| **P-7** | ✅ | 2.68.1 | `defer_recompute` + `recompute_registers` via `BackgroundTasks` für `/imports/readings/commit`. |
| **Q-1** | ✅ | 2.68.0 | Generische `AssignmentHistoryCard<T>` in `_shared/` ersetzt 3× gespiegelte Cards. |
| **Q-2** | ✅ | 2.68.3 | Gezieltes `refreshMp` (nur MP nachladen) für die Zuordnungs-Cards statt vollem `tick`-Refetch. |
| **Q-3** | ✅ | 2.68.3 | `stateByRegister`/`allRegisters` in `RegisterTable` per `useMemo`. |
| **Q-4** | ✅ | 2.68.0 | Gemeinsame `parseJsonResponse<T>()` aus `request()`/`upload()` extrahiert. |
| **Q-5** | ✅ | 2.68.0 | Listen-Caps (`MP_PAGE_SIZE=100`, `ALL_CONFIRM_THRESHOLD=500`, `REPORT_ROW_CAP=500`) — dependency-frei (kein `react-window`, LXC-Lockfile-sicher). |

**Bewusst NICHT umgesetzt (Nutzer-Entscheidung, kein offener Befund):** Layout-Smell
`media_dir` (Fotos im Git-Checkout `/opt/zaehler/repo/data` statt bei der DB) — durch
den Deploy nachweislich sicher (`git reset --hard` nur getrackte Dateien, `git clean`
nur auf `backend/src/meters/static`); eine Foto-Migration wäre reine Kosmetik mit
Prod-Daten-Risiko und wurde verworfen.

**§D-Alt-Befunde:** 2.3 war bereits behoben; **7.2** (`ReadingsListPage`-Split),
**1.5** (Bool/Timestamp-Konvention), **6.3** (Python-`sorted` in `consumption`),
**7.1** (Audit-Decorator) bleiben offen — alle „niedrig", nicht Teil dieses Backlogs.
Zurückgestellte Härtungen (TOTP-Encryption-at-rest, `cookie_secure`-LAN-Default)
unverändert wie dokumentiert; die Offline-Queue ist inzwischen ✅ umgesetzt
(v2.69.0, PR #321/#324 — Outbox + Stammdaten-Snapshot in IndexedDB, In-App-Sync-Engine).

---

## Status-Nachtrag (2026-05-29)

Verifikation gegen den aktuellen `main` (HEAD `8efe152`, Release 2.24.4). Geprüft
wurde jeder Befund einzeln im Quelltext / in den Tests / in den Migrationen.
Stand der Abarbeitung: **34 behoben, 5 offen (alle Schweregrad „niedrig"),
2 bewusst dokumentiert/mitigiert, 1 war nie ein Bug.**

Legende: ✅ behoben · 🟡 teilweise/dokumentiert · ⬜ offen · ☑️ kein Handlungsbedarf

| Nr. | Schweregrad | Status | Beleg / Anmerkung |
|---|---|---|---|
| 1.1 PWA Service-Worker | mittel | ✅ | `frontend/src/main.tsx` `registerSW({immediate:true})` (vite-pwa); PWA-Icons in PR #91 |
| 1.2 Foto-Upload | mittel | ✅ | Upload-Endpoint `PUT /readings/{id}/photo` + `photo_lat/lon` (PR #55/#62/#64). Bewusst separater Upload, nicht in `ReadingCreate` |
| 1.3 `created_by_user_id` „IMMER gesetzt" | mittel | ✅ | `reading.py:48` jetzt `nullable=False` (+SET NULL = effektives RESTRICT); Migration `20260505_1300_created_by_not_null` |
| 1.4 PASSWORD_CHANGED Audit | niedrig | ✅ | `_enums.py:33` + Eintrag in `auth.py:241` |
| 1.5 inaktiv: Bool vs. Timestamp | niedrig | ⬜ | unverändert (Design-Entscheidung, kein Bug) |
| 2.1 Race Condition `replace_meter` | hoch | ✅ | Partial-Unique-Index `Migration 20260505_1000_one_active_meter` (`WHERE removed_at IS NULL`) |
| 2.2 `_coerce_decimal_map` → 500 | mittel | ✅ | `meter_replacement.py:37-44` try/except → `ProblemError(400)` |
| 2.3 Datums-Filter String-Vergleich | niedrig | ⬜ | `DashboardPage.tsx` weiterhin `.slice(0,10)`-Vergleich |
| 2.4 `transformer_factor` ohne Max | niedrig | ✅ | `measuring_point.py:44,122` `le=10000` |
| 3.1 CSP `script-src 'unsafe-inline'` | hoch | ✅ | `middleware.py:40` `script-src 'self'` (Bootstrap nach `/theme-bootstrap.js` ausgelagert); `style-src 'unsafe-inline'` bewusst (React-inline-styles) |
| 3.2 TOTP-Challenge ohne UA/IP-Bindung | mittel | ✅ | `totp.py:175-188` vergleicht UA + IP, invalidiert bei Abweichung |
| 3.3 `verify_2fa` ohne IP-Limiter | mittel | ✅ | `auth.py:136-142` `login_limiter` auf IP |
| 3.4 X-Forwarded-For ohne Format-Check | niedrig | ✅ | `deps.py:88-90` `ipaddress.ip_address()`-Validierung + Fallback |
| 3.5 Backup ohne 0600 | mittel | ✅ | `backup.sh` `umask 0077` + `chmod 0600` auf `.db.gz` und Foto-Archiv |
| 3.6 LOGIN_FAILED speichert Username | niedrig | ✅ | `auth.py:96` `username_key[:32]` (lowercased, gekürzt) |
| 3.7 TOTP-Secret Klartext in DB | niedrig | 🟡 | unverändert Klartext; dokumentiert (DB nur lokal, `0600`). Encryption-at-rest = zurückgestelltes Audit-Item |
| 3.8 `cookie_secure` Default False | mittel | 🟡 | bewusst False (Direkt-HTTP-LAN); neue Boot-Warnung `assert_secure_production_config()` (PR #113/#114) |
| 4.1 `created_by` nullable (Reading+Delivery) | mittel | ✅ | beide `nullable=False` (`reading.py:48`, `delivery.py:41`) |
| 4.2 Delivery ohne UNIQUE | niedrig | ✅ | `delivery.py:30` `uq_delivery_register_at` + Migration `20260505_1200` |
| 4.3 Audit-`diff` ohne Größenlimit | niedrig | ✅ | `services/audit.py` `_DIFF_MAX_BYTES = 8 KB` Soft-Limit |
| 4.4 Audit-Index `(user_id, created_at)` | niedrig | ✅ | Migration `20260505_1200_audit_3_indexes` + `20260529_0600_audit_log_created_at_index` (PR #116) |
| 4.5 lat/lon als Float | niedrig | ☑️ | intentional (GPS-Genauigkeit); + CHECK-Constraints. Kein Handlungsbedarf |
| 5.1 Concurrency-Tests | hoch | ✅ | `tests/integration/test_concurrency.py` (ThreadPoolExecutor) |
| 5.2 Migrations-Round-Trip-Tests | hoch | ✅ | `tests/integration/test_migrations.py` (Alembic upgrade/downgrade) |
| 5.3 `replace_meter`-Atomarität | hoch | ✅ | `test_measuring_points.py::test_replace_meter_rolls_back_on_incomplete_finals` |
| 5.4 Heating-Register-Vererbung | mittel | ✅ | `test_oil.py::test_replace_meter_inherits_custom_heating_registers` |
| 5.5 Login mit `is_active=False` | mittel | ✅ | `test_auth.py::test_login_blocked_for_inactive_user` |
| 5.6 Audit-Lücken (User/TOTP/PW) | mittel | ✅ | `test_users_lifecycle.py` + `test_audit.py` (password_change, totp_disable) |
| 5.7 Export-Endpoints ohne Tests | mittel | ✅ | `tests/integration/test_exports.py` |
| 5.8 Frontend-Tests minimal | mittel | ✅ | jetzt 16 Test-Dateien (RecordReadingPage, MeasuringPointsAdminPage, QrScan, …) |
| 5.9 `_pairwise` Edge-Cases | niedrig | ✅ | `tests/unit/test_pairwise.py` (empty/single/two/three) |
| 6.1 N+1: Deliveries `created_by` | mittel | ✅ | `deliveries.py:60,81` `selectinload(Delivery.created_by)` (PR #116) |
| 6.2 `state_for_register` lädt alles | mittel | ✅ | `state.py:51-56` `ORDER BY … LIMIT 1`; MP-Variante 3 Bulk-Queries |
| 6.3 `consumption` sortiert in Python | niedrig | ⬜ | `consumption.py:50` weiterhin `sorted()` in Python (bewusst, kleine Datenmengen) |
| 6.4 Frontend-Bundle / Code-Splitting | mittel | ✅ | `App.tsx` 16 Routen via `React.lazy()` |
| 6.5 Deliveries ohne `offset` | niedrig | ✅ | `deliveries.py:77,98` `offset`-Query-Param |
| 6.6 Dashboard `consumptionSeries` ohne `useMemo` | niedrig | ✅ | `DashboardPage.tsx` in `useMemo()` |
| 7.1 Audit-Schreibung dupliziert | niedrig | ⬜ | weiterhin inline `record(...)`-Aufrufe, kein Decorator/Context-Manager |
| 7.2 `ReadingsListPage.tsx` > 1000 Zeilen | niedrig | ⬜ | weiterhin ~1323 Zeilen, nicht aufgeteilt |
| 7.3 Magische HTTP-Statuscodes | niedrig | ✅ | `readings.py` `STATUS_PLAUSIBILITY_WARNING = 400` |
| 7.4 Kein zentrales Logging-Setup | niedrig | ✅ | `core/logging.py` mit `configure_logging()` (dictConfig) |
| 7.5 `_pairwise` ohne Generator-Type-Hint | niedrig | ✅ | `consumption.py:25` `-> Iterator[tuple[Reading, Reading]]` |

**Offen (5, alle Schweregrad „niedrig", kein Sicherheits-/Korrektheitsrisiko):**
1.5 (Bool/Timestamp-Konvention), 2.3 (Frontend-String-Datumsfilter),
6.3 (Python-Sortierung in `consumption`), 7.1 (Audit-Decorator),
7.2 (`ReadingsListPage`-Aufteilung).

**Bewusst dokumentiert/mitigiert (2):** 3.7 (TOTP-Secret-Encryption — zurückgestellt),
3.8 (`cookie_secure` für Direkt-HTTP-LAN, Boot-Warnung ergänzt).

Alle 5 ursprünglichen **hoch**-Befunde (2.1, 5.1, 5.2, 5.3, + Test zu 2.1) sind behoben.

---

## 1. Abweichungen von CLAUDE.md

### 1.1 PWA: Service-Worker nicht implementiert
- **Schweregrad:** mittel
- **Datei:** `frontend/src/` (kein `service-worker.ts` / kein `*.sw.ts` vorhanden), `frontend/public/manifest.webmanifest:1` (Manifest existiert)
- **Befund:** CLAUDE.md Zeile 25 fordert „PWA-fähig (Manifest + Service Worker, offline-tauglich für Erfassung)". Manifest ist da, **kein Service Worker registriert**. Verifiziert per `ls frontend/src/*sw*` (keine Treffer) und Inspektion von `main.tsx` (kein `navigator.serviceWorker.register`).
- **Auswirkung:** Erfassung am Zählerschrank ohne LAN-Verbindung scheitert; App ist nicht offline-tauglich.
- **Behebung:** Vite-PWA-Plugin oder eigener `service-worker.ts`. Cache-First für `/assets/*`, Network-First mit Offline-Queue (IndexedDB) für `POST /readings`.
- **Nachtrag 2026-07-11:** ✅ vollständig behoben — Service Worker seit PR #91 (vite-plugin-pwa), Offline-Queue + Stammdaten-Snapshot (IndexedDB) + In-App-Sync-Engine in v2.69.0 (PR #321/#324); Details in CLAUDE.md „Weitere Features → Offline-Modus".

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

> **Nachtrag 2026-05-29:** Inzwischen sind 34 der 42 Befunde behoben (inkl. aller
> 5 hoch-Befunde). Offen sind nur noch 5 „niedrig"-Punkte, 2 sind bewusst
> dokumentiert/mitigiert, 1 war kein Bug. Details siehe **Status-Nachtrag** oben.
