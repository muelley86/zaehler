# Code-Audit — Zählererfassungstool

Stand: 2026-05-02 · Branch HEAD: `0f97662` · Backend-Tests: 47/47 grün · Frontend: lint/type/build clean

Befund-Schema pro Eintrag:

- **Schweregrad** (kritisch / hoch / mittel / niedrig)
- **Datei:Zeile**
- **Beschreibung**
- **Vorschlag**

Wenn ein Punkt nicht eindeutig zu beurteilen war, ist das explizit mit „zu verifizieren" markiert. Es wurde **kein Code geändert**.

---

## 1. Abweichungen von CLAUDE.md (Konventionen, Architektur, Stack)

### 1.1 `Location.latitude/longitude` als Float, nicht Decimal — bewusst, aber CLAUDE.md sagt anders

- **Schweregrad**: niedrig (vermutlich vertretbar)
- **Datei:Zeile**: `backend/src/meters/models/location.py:24-25` · `backend/alembic/versions/20260504_0900_location_geo.py:26-27`
- **Beschreibung**: CLAUDE.md sagt: „Werte als Decimal speichern, NIEMALS Float (Rundungsfehler bei Zählerständen)". Geo-Koordinaten sind keine Zählerstände, sondern Anzeige-Daten — Float ist hier praktikabel (GPS ~6 Dezimalstellen Genauigkeit). Trotzdem fehlt eine explizite Begründung als Kommentar im Modell.
- **Vorschlag**: Kommentar im Modell ergänzen, dass die Decimal-Regel ausschließlich für Zählerwerte und Bestände gilt, nicht für Anzeige-Metadaten wie Koordinaten. Alternativ Numeric(9,6) — aber Float reicht funktional.

### 1.2 Recorder-Permission-Differenzierung Wert vs. Note nicht in CLAUDE.md festgelegt

- **Schweregrad**: niedrig
- **Datei:Zeile**: `backend/src/meters/api/v1/readings.py:54-62`
- **Beschreibung**: CLAUDE.md erwähnt nur „eigene Readings (created_by = self) innerhalb von 24h bearbeiten/löschen". Es ist nicht spezifiziert, ob ein Recorder im 24h-Fenster auch den `value` ändern darf, oder ob nur die `note` editierbar ist. Der aktuelle Code lässt jeden Patch zu.
- **Vorschlag**: Im CLAUDE.md klarstellen, ob Recorder im 24h-Fenster auch `value`/`reading_at` ändern dürfen oder nur `note`. Falls Letzteres: im PATCH-Endpoint feldweise filtern.

### 1.3 Ursprüngliche „iOS / SwiftUI"-Designvorgabe in CLAUDE.md nicht enthalten — Liquid-Glass-Refresh ist konsensual, aber nicht dokumentiert

- **Schweregrad**: niedrig (Doku-Drift)
- **Datei:Zeile**: `CLAUDE.md` (UI-Anforderungen) und Frontend
- **Beschreibung**: CLAUDE.md spricht nur von „Mobile-first, große Touch-Targets, numerische Tastatur" — kein Hinweis auf den Liquid-Glass-Look (OKLCH-Palette, Glas-Layer, `useChartTheme`). Wenn morgen jemand das Frontend isoliert betrachtet, fehlt der Designkanon.
- **Vorschlag**: Eine kurze Sektion „Designsprache" in CLAUDE.md ergänzen oder auf `frontend/handoff/DESIGN_TOKENS.md` verweisen.

### 1.4 OBIS-Code 7.8.0 für Gas ist nicht standardkonform

- **Schweregrad**: niedrig (Konvention)
- **Datei:Zeile**: `CLAUDE.md` (OBIS-Register-Sektion) — und damit übernommen in `backend/src/meters/core/obis.py` (zu verifizieren)
- **Beschreibung**: 7.8.0 ist im IEC-62056-OBIS-Standard nicht als Gas-Volumen-Register definiert (DLMS/COSEM nutzt 7-x-x für andere Dinge). Eigene Konvention ist OK, aber CLAUDE.md selbst sagt „interne Bezeichnung" — gut, das passt. Kein echter Audit-Befund, nur Hinweis: bei späterer Datenexport-Schnittstelle Richtung Energie-Zähler-Standard ist Anpassung nötig.
- **Vorschlag**: Bei künftiger Smart-Meter-Schnittstelle eindeutig auf eigene Bezeichnung mappen, nicht auf 7.8.0 als „Standard" verlassen.

---

## 2. Bugs und logische Fehler

### 2.1 `RangeError` aus `parseDe()` in `ReadingsListPage.EditForm` nicht abgefangen

- **Schweregrad**: hoch
- **Datei:Zeile**: `frontend/src/lib/format.ts:38-47` (Wirft) · `frontend/src/features/readings/ReadingsListPage.tsx` ~Zeile 812 (EditForm-Submit, zu verifizieren mit aktueller Datei)
- **Beschreibung**: `parseDe()` wirft `RangeError` bei ungültiger Eingabe. In `RecordReadingPage.tsx` wird das im Submit caught (Zeile ~184), in der Inline-Edit-Form der Readings-Liste nicht. Folge: bei Eingabe wie „abc" oder „1..2" crasht die Form anstelle einer freundlichen Fehlermeldung.
- **Vorschlag**: Den `parseDe()`-Aufruf im EditForm-Submit in try/catch wrappen und `RangeError.message` als Form-Fehler anzeigen, identisch zur RecordReadingPage.

### 2.2 Stale-State-Race in `RecordReadingPage` beim Nachladen nach Erfassung

- **Schweregrad**: mittel
- **Datei:Zeile**: `frontend/src/features/readings/RecordReadingPage.tsx:169-181`
- **Beschreibung**: Nach erfolgreicher Erfassung wird `stateByRegister` neu geladen — ohne `cancelled`-Flag wie der initiale Effect. Wenn Nutzer schnell mehrfach speichern oder die Page unmountet wird, könnte ein altes Promise auf einer abgehängten Komponente State setzen (React-Warning, kein Crash, aber unsauber).
- **Vorschlag**: `AbortController` oder `cancelled`-Flag analog zum initialen Effect (Zeilen 61-81) nutzen.

### 2.3 Veraltete API-Anfragen werden nicht gecancelt

- **Schweregrad**: mittel
- **Datei:Zeile**: `frontend/src/features/readings/ReadingsListPage.tsx:95-117`
- **Beschreibung**: Beim schnellen Wechseln der Filter werden parallele API-Anfragen gestartet. Es gibt keinen `AbortController`, sodass langsame veraltete Antworten frischere Werte überschreiben können (klassische Promise-Race) — und State auf unmountete Komponenten gesetzt wird.
- **Vorschlag**: `AbortController` pro Effect, an `api.get` weiterreichen; bei Cleanup `controller.abort()`.

### 2.4 `MeasuringPointUpdate.tank_capacity`-Typecheck — nur sinnvoll bei `type=oil`

- **Schweregrad**: niedrig
- **Datei:Zeile**: `backend/src/meters/api/v1/measuring_points.py:171-180` · `backend/src/meters/models/measuring_point.py` (Feld)
- **Beschreibung**: Es gibt keine Constraint, die `tank_capacity` nur bei `type=MeterType.OIL` zulässt. Ein Admin kann `tank_capacity=1000` auf einem Strom-Zähler setzen — wirkt sich nicht aus, weil die State-Logik den Wert nur für OIL nutzt, ist aber konzeptionelles Datenrauschen.
- **Vorschlag**: Im `MeasuringPointCreate`/`MeasuringPointUpdate`-Schema ein `model_validator` der ablehnt, wenn `tank_capacity` gesetzt UND `type != oil` ist.

### 2.5 Inkonsistenz: Migration 0006 legt `updated_at` an, Models nutzen sie nicht

- **Schweregrad**: niedrig
- **Datei:Zeile**: `backend/alembic/versions/20260503_1000_totp_2fa.py:45,60` · `backend/src/meters/models/backup_code.py`
- **Beschreibung**: Die Migration legt eine `updated_at`-Spalte für `backup_code` und `pending_totp_challenge` an. Die ORM-Models erben aber nur von `TimestampMixin` (das nur `created_at` enthält). Resultat: tote Spalte in der DB.
- **Vorschlag**: Entweder die Spalte in einer Folge-Migration entfernen, oder `UpdatedAtMixin` einführen und nutzen — falls Update-Tracking gewünscht ist (eher nein, da BackupCode single-use ist und PendingTotpChallenge nach Ablauf gelöscht wird).

### 2.6 Plausibilitätscheck ist „harter 400-Block", obwohl CLAUDE.md eine Warnung verlangt

- **Schweregrad**: hoch (Verstoß gegen explizite CLAUDE.md-Regel)
- **Datei:Zeile**: `backend/src/meters/api/v1/readings.py:101-117` (vorheriger Stand) und `:118-134` (nachfolgender Stand)
- **Beschreibung**: `_check_value_in_series` wirft `ProblemError(status_code=400)` mit Titel „Wert kleiner als vorheriger Stand" bzw. „Wert größer als nachfolgender Stand". CLAUDE.md (UI-Anforderungen) schreibt aber explizit: „Plausibilitätscheck beim Speichern: neuer Wert >= letzter Wert (außer Rollover oder Zählerwechsel) – **Warnung, nicht harter Block**". Aktuell verhindert das legitime Nachträge bei Rollover ohne `accepts_deliveries`-Flag und ungewöhnliche Korrekturen.
- **Vorschlag**: Backend-Endpoint nimmt einen Query-/Body-Param `?force=true` (oder `acknowledge_warning=true`) entgegen, der den Check überspringt. Frontend zeigt bei 200-Response mit `warnings`-Feld einen Confirm-Dialog und sendet auf Bestätigung erneut mit `force=true`. Die `extra`-Daten (previous/next-Stand) bleiben strukturell, sind aber kein Block.

### 2.7 `relativer alembic.ini`-Pfad — durch `env.py` überschrieben, aber Stolperfalle bleibt

- **Schweregrad**: niedrig (bereits gefixt durch env.py-Override, aber nicht abschließend gehärtet)
- **Datei:Zeile**: `backend/alembic.ini` · `backend/alembic/env.py`
- **Beschreibung**: `alembic.ini` hat `sqlalchemy.url = sqlite:///../data/meters.db` (relativ) — ohne `env.py`-Override würde alembic in `repo/data/meters.db` schreiben statt in die echte App-DB. Ein neuer Maintainer könnte den Override versehentlich entfernen.
- **Vorschlag**: In `alembic.ini` den Default-Wert leer setzen (`sqlalchemy.url =`) oder auf `sqlite:///__configure_in_env_py__` — sodass der Override-Mechanismus nicht stillschweigend umgangen werden kann.

---

## 3. Sicherheitsprobleme (Auth, SQL-Injection, Secrets, CORS)

### 3.1 Username-Rate-Limit wird nach erfolgreichem 2FA-Login nicht zurückgesetzt

- **Schweregrad**: hoch
- **Datei:Zeile**: `backend/src/meters/api/v1/auth.py` (verify_2fa-Endpoint, Zeile zu verifizieren) · `backend/src/meters/services/rate_limit.py:66-68`
- **Beschreibung**: Nach erfolgreicher 1FA wird `username_limiter.record_failure()` bei TOTP-Fehler erhöht, aber nach erfolgreicher TOTP-Verifikation wird `record_success()` nicht aufgerufen. Folge: Counter bleibt erhöht und kann bei legitimen Folgelogins zu unnötiger Sperre führen. Praktisch begrenzt, aber unsauber.
- **Vorschlag**: In `verify_2fa` nach erfolgreicher Code-/Backup-Code-Validierung `username_limiter.record_success(user.username.lower())` aufrufen.

### 3.2 Theoretische Race-Condition in `resolve_session` bei User-Löschung

- **Schweregrad**: niedrig (verifiziert: praktisch sehr enges Fenster)
- **Datei:Zeile**: `backend/src/meters/services/auth.py:81-83`
- **Beschreibung**: `user = session.user` wird dereferenziert, dann `user.is_active`. Bei concurrent User-Hard-Delete (nicht Deaktivierung) zwischen Session-Lookup und User-Lazy-Load könnte `user` `None` sein. Da User-Löschung im UI nur deaktiviert (is_active=False), nicht hart löscht, ist das praktisch ungefährlich — aber Defense-in-Depth.
- **Vorschlag**: `if user is None or not user.is_active:` — kostet eine Zeile, eliminiert das Risiko vollständig.

### 3.3 Keine CHECK-Constraint auf `latitude`/`longitude` in der DB

- **Schweregrad**: niedrig
- **Datei:Zeile**: `backend/alembic/versions/20260504_0900_location_geo.py:26-27`
- **Beschreibung**: Pydantic validiert `-90..90` und `-180..180`, aber wer per `sqlite3`-CLI direkt schreibt, kann ungültige Werte einschleusen. Defense-in-Depth-Lücke.
- **Vorschlag**: Migration mit `CheckConstraint('latitude BETWEEN -90 AND 90', name='ck_location_lat_range')` und Pendant für Longitude.

### 3.4 CSV-Export-Felder schützen nicht gegen Excel-Formel-Injection

- **Schweregrad**: mittel
- **Datei:Zeile**: `frontend/src/features/readings/ReadingsListPage.tsx` (csvField-Helper, Zeile ~985)
- **Beschreibung**: Der CSV-Helper escapet Anführungszeichen und Trennzeichen, aber nicht führende `=`/`+`/`-`/`@`. Ein Recorder könnte in einer `note` `=cmd|'/c calc'` eintragen — beim Öffnen der CSV in Excel/LibreOffice würde das als Formel interpretiert. Da nur authentifizierte User Daten erzeugen können, ist die praktische Risiko-Lage moderat (kein anonymer Angreifer-Vektor).
- **Vorschlag**: Im `csvField`-Helper Werte, die mit `[=+\-@]` beginnen, mit `'` (Apostroph) prefixen.

### 3.5 OSM-Link in `LocationMapSheet` ohne URL-Encoding

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/components/LocationMapSheet.tsx:24`
- **Beschreibung**: Die Koordinaten kommen aus dem eigenen Backend (Float-Spalten) und sind durch Pydantic auf Range validiert — eine Injection ist über den normalen Pfad nicht möglich. Trotzdem: keine Defense-in-Depth, falls in Zukunft jemand den Datentyp ändert.
- **Vorschlag**: `URL` und `searchParams.set()` nutzen statt String-Template — kostet nichts und ist robust.

### 3.6 Origin-Check übersieht Requests ohne Origin-Header

- **Schweregrad**: niedrig (akzeptable Design-Entscheidung)
- **Datei:Zeile**: `backend/src/meters/core/middleware.py:75-77`
- **Beschreibung**: `if origin and not _origin_allowed(...)` lässt mutating Requests durch, wenn der Origin-Header gar nicht gesetzt ist (z. B. CLI-Clients, ältere Browser, manche Background-Sync). Das ist gewollt für API-Clients, schwächt aber den CSRF-Schutz auf gewollte „Same-Site=Strict-Cookie"-Stärke ab.
- **Vorschlag**: Akzeptabel, weil SameSite=Strict dahinter steht. Nur in Doku festhalten („Origin-Check ist defense-in-depth, primärer CSRF-Schutz ist SameSite=Strict").

### 3.7 Session-Cookie-Lebensdauer 30 Tage — sliding ohne harte Obergrenze

- **Schweregrad**: niedrig
- **Datei:Zeile**: `backend/src/meters/services/auth.py` (`resolve_session`, Sliding-Renewal)
- **Beschreibung**: Sliding-Expiration verlängert die Session bei jedem Request. Eine kompromittierte Session bleibt damit theoretisch unbegrenzt aktiv, solange sie genutzt wird. CLAUDE.md spricht von 30 Tagen Sliding — das ist konsistent, aber best-practice wäre eine zusätzliche Hard-Lifetime (z. B. 90 Tage absolut).
- **Vorschlag**: Optionales `absolute_expires_at = created_at + 90d` neben `expires_at` (sliding). Bei Überschreitung Session-Re-Login erzwingen.

---

## 4. Datenmodell-Probleme

### 4.1 Fehlende Composite-Indizes auf `audit_log` für Filterabfragen

- **Schweregrad**: mittel
- **Datei:Zeile**: `backend/alembic/versions/20260501_0900_initial.py:74-76`
- **Beschreibung**: AuditLog hat Indizes auf `user_id` und `entity_id`, aber nicht auf `(action, created_at)` oder `(entity_type, created_at)`. Die Audit-Log-Ansicht filtert typischerweise nach Action/EntityType in Zeitfenstern — wird mit wachsender Audit-Größe zu vollem Tabellen-Scan.
- **Vorschlag**: Migration mit `Index('ix_audit_action_created', 'action', 'created_at')` und `Index('ix_audit_entity_created', 'entity_type', 'created_at')`.

### 4.2 Pending TOTP-Challenges werden nicht periodisch aufgeräumt

- **Schweregrad**: mittel
- **Datei:Zeile**: `backend/src/meters/services/totp.py` (cleanup_expired_challenges, falls vorhanden)
- **Beschreibung**: Bei häufigen Login-Abbrüchen sammeln sich abgelaufene `PendingTotpChallenge`-Einträge. Es gibt eine Cleanup-Funktion, aber kein Trigger (kein Scheduler, kein Cron). Tabelle wächst unbegrenzt.
- **Vorschlag**: Entweder beim Login-Endpoint (vor Issue der neuen Challenge) für den User einen lazy-cleanup ausführen, oder einen täglichen Cleanup im `zaehler.sh backup`-Path mitlaufen lassen.

### 4.3 Reading-List-Endpoint ohne `selectinload(Reading.created_by)` — N+1 Query bei Username-Auflösung

- **Schweregrad**: hoch (Performance bei wachsendem Datenbestand)
- **Datei:Zeile**: `backend/src/meters/api/v1/readings.py:137-162` (`list_readings`) und `_to_read` Zeilen 41-51
- **Beschreibung**: `_to_read()` greift auf `reading.created_by.username` zu (Zeile 50). Ohne `selectinload(Reading.created_by)` lädt SQLAlchemy pro Reading eine eigene User-Query — bei `limit=500` sind das bis zu 500 zusätzliche SELECTs.
- **Vorschlag**: `stmt = stmt.options(selectinload(Reading.created_by))` direkt nach Zeile 147 in `list_readings`.

### 4.4 `limit=5000` auf Readings-Endpoint ohne echte Pagination

- **Schweregrad**: mittel
- **Datei:Zeile**: `backend/src/meters/api/v1/readings.py:137-162`
- **Beschreibung**: Die API erlaubt `limit=5000` und lädt alle Rows in den Speicher. Bei einem Privathaushalt mit 4 Zählern × wöchentlicher Erfassung wird das nach 10 Jahren noch unproblematisch sein (~2000 Rows) — aber das Frontend lädt aktuell mit Default 500 ohne Cursor.
- **Vorschlag**: Cursor-Pagination mit `?after=<reading_id>` oder klassisch mit `?offset` + `?limit`. Frontend: lazy-load on-scroll.

### 4.5 Race-Condition bei `replace_meter`: zwei parallele Admin-Requests können Constraint verletzen

- **Schweregrad**: niedrig (Single-User-Heimanwendung)
- **Datei:Zeile**: `backend/src/meters/services/meter_replacement.py:110-113`
- **Beschreibung**: Beide Requests sehen denselben aktiven Meter, beide markieren `removed_at`, beide legen einen neuen Meter an. Erst beim zweiten Commit greift evtl. eine Constraint, oder es werden zwei aktive Meter erzeugt.
- **Vorschlag**: SQLite kennt kein `SELECT FOR UPDATE`, aber ein expliziter `BEGIN IMMEDIATE` in der Transaktion plus eine UNIQUE-Constraint auf `(measuring_point_id) WHERE removed_at IS NULL` (partial unique index) würde zweite Erstellung deterministisch ablehnen.

### 4.6 `Location.name` akzeptiert Whitespace-only Strings

- **Schweregrad**: niedrig (verifiziert)
- **Datei:Zeile**: `backend/src/meters/schemas/location.py:9,16`
- **Beschreibung**: `Field(min_length=1, max_length=120)` zählt Whitespace mit. „   " (drei Spaces) erfüllt `min_length=1`, ist aber kein sinnvoller Standortname. Beim erneuten Anlegen von „   " plus „    " (4 Spaces) wären beide via `unique`-Index unterschiedlich, obwohl semantisch leer.
- **Vorschlag**: Pydantic-Validator (`@field_validator('name')`), der `value.strip()` zurückgibt und nach Strip auf nicht-leer prüft. Im `LocationUpdate` analog.

### 4.7 `Reading.created_by_user_id` mit `ON DELETE SET NULL` — User-Hard-Delete verliert Username

- **Schweregrad**: niedrig (verifiziert; Designentscheidung mit Folge)
- **Datei:Zeile**: `backend/src/meters/models/reading.py:39-41`
- **Beschreibung**: `ForeignKey("user.id", ondelete="SET NULL")` ist eine vernünftige Wahl (Reading bleibt erhalten), aber: nach Hard-Delete des Users ist `created_by_username` für historische Readings `None`. Die Audit-Spur hängt dann nur noch am `audit_log` selbst (`audit_log.user_id` hat ggf. eine andere Cascade-Strategie — zu verifizieren). Falls UI-seitig im Auditbereich „User X hat … getan" angezeigt werden soll, ist das verloren.
- **Vorschlag**: Pragmatisch: User dürfen nur deaktiviert (is_active=False), nie hart gelöscht werden. Oder zusätzlich `username` als `created_by_username` denormalisiert in `Reading`-Tabelle speichern. Aktuell: User-Delete-Endpoint prüfen — wird tatsächlich nur deaktiviert?

---

## 5. Fehlende oder schwache Tests

### 5.1 Verbrauchsberechnung über Zählerwechsel hinweg — ungetestet

- **Schweregrad**: kritisch
- **Datei:Zeile**: `backend/tests/` (kein `test_consumption_replacement.py`)
- **Beschreibung**: `services/consumption.py` aggregiert Verbrauch über mehrere PhysicalMeter eines MeasuringPoint. Es existieren keine Tests für: Verbrauch direkt vor/nach Zählerwechsel, mehrfacher Wechsel, Wechsel mit `initial_values != 0`. Das ist die Kerngeschäftslogik der App.
- **Vorschlag**: `test_consumption_replacement.py` mit Cases: (a) ein Wechsel mit `initial=0`, (b) Wechsel mit `initial=50`, (c) drei aufeinanderfolgende Wechsel, (d) Heizöl-Tank-Wechsel mit Lieferung dazwischen.

### 5.2 Rollover (mechanischer Zähler) — keine Edge-Cases

- **Schweregrad**: hoch
- **Datei:Zeile**: `backend/tests/unit/test_consumption.py` (zu verifizieren, ob existiert)
- **Beschreibung**: Wenn ein Test existiert, deckt er nur den Default-`max_value`-Fall ab. Ungetestet: custom max_value, Tank-Register (sollte NICHT rollovern), Mehrfach-Rollover über mehrere Readings.
- **Vorschlag**: Cases: (a) max_value=999.9, Reading 950→50, Verbrauch=99.9; (b) Oil-Tank 100→20, kein Rollover; (c) 3 aufeinanderfolgende Rollovers.

### 5.3 Concurrency: zwei parallele Reading-Inserts mit gleichem `(register_id, reading_at)`

- **Schweregrad**: kritisch
- **Datei:Zeile**: `backend/tests/integration/` (kein `test_concurrency.py`)
- **Beschreibung**: Das UNIQUE-Constraint ist die einzige Schutzlinie gegen Doppel-Erfassung. Es gibt keinen Test, der zwei TestClients parallel POST'en lässt und prüft, dass genau einer 201, der andere 409 mit Vergleichsinfo (`existing.created_by_user_id`, `existing.value`) bekommt.
- **Vorschlag**: `test_concurrency.py` mit `threading.Thread` × 2 oder zwei sequenziellen Requests mit Force-Constraint-Probe. 409-Response auf den Inhalt geprüft.

### 5.4 2FA — Challenge-Expiry und Drift-Toleranz

- **Schweregrad**: hoch
- **Datei:Zeile**: `backend/tests/integration/test_auth.py`
- **Beschreibung**: Vorhanden: Setup → Activate → Login-mit-Code → Backup-Code-Verbrauch. Fehlt: (a) Challenge nach 5 Min abgelaufen → 401, (b) `±1 step` Drift-Toleranz, (c) mehrere Fehl-Codes auf gleicher Challenge → Lock/Invalidate.
- **Vorschlag**: `monkeypatch` auf `datetime.now`, Code generieren mit `pyotp.TOTP(secret).at(now - 30s)` und Erwartung 200, dann Code von `now - 90s` und Erwartung 401.

### 5.5 Audit-Log-Vollständigkeit — keine systematischen Tests

- **Schweregrad**: hoch
- **Datei:Zeile**: `backend/tests/integration/` (kein `test_audit.py`)
- **Beschreibung**: Audit ist Compliance-Anforderung. Es fehlen Tests, die nach jeder mutierenden Operation (Reading CREATE/UPDATE/DELETE, MeterReplaced, User-Anlage, Rollen-Änderung, TOTP-Enable/Disable) prüfen, dass ein AuditLog-Eintrag mit korrekter `action`, `entity_type`, `diff` und `user_id` existiert.
- **Vorschlag**: `test_audit_completeness.py` mit Parametrized-Test je Operation.

### 5.6 Recorder 24h-Boundary — kein Boundary-Test

- **Schweregrad**: mittel
- **Datei:Zeile**: `backend/tests/integration/test_readings.py`
- **Beschreibung**: Es gibt einen Test „Recorder kann eigenes Reading <24h ändern", aber keinen Boundary-Test bei `created_at = now - 24h - 1s` → 403 erwartet.
- **Vorschlag**: Test mit `monkeypatch` auf `_can_edit`-Zeitvergleich.

### 5.7 Heizöl-Tank Verbrauchsberechnung mit Lieferungen

- **Schweregrad**: hoch
- **Datei:Zeile**: `backend/tests/unit/` (kein `test_oil_consumption.py`)
- **Beschreibung**: Die Formel `consumption = (prev_value + sum(deliveries)) - cur_value` ist komplexer als die normale Differenz. Ungetestet: (a) Lieferung zwischen zwei Readings, (b) mehrere Lieferungen, (c) Lieferung vor erstem Reading, (d) Lieferung nach letztem Reading (sollte `state.refilled_since` befüllen).
- **Vorschlag**: 5 Cases im `test_oil_consumption.py`.

### 5.8 Plausibilitätscheck — Rückdatierung mitten in Serie

- **Schweregrad**: mittel
- **Datei:Zeile**: `backend/tests/integration/`
- **Beschreibung**: Ungetestet: Reading A=100 (1.1.), Reading C=110 (3.1.), nun Reading B=95 rückdatiert (2.1.) → muss 400 mit Hinweis auf nächstes/vorheriges geben. Tank-Register skip — auch nicht getestet.
- **Vorschlag**: Test mit drei Readings und einem rückwirkenden Insert dazwischen.

### 5.9 Frontend `parseDe`/`formatDe` — nur ein LoginPage-Test, sonst kein Frontend-Unit-Test

- **Schweregrad**: hoch
- **Datei:Zeile**: `frontend/src/lib/format.ts` (kein `format.test.ts`)
- **Beschreibung**: `parseDe` ist Kern-Konvertierung „1.234,56" → „1234.56". Edge-Cases (führende `,`, mehrere Punkte, Leerstring, US-Format) ungetestet. `formatDe` mit verschiedenen Optionen ebenfalls.
- **Vorschlag**: Vitest-Datei mit ~10 Cases pro Funktion.

### 5.10 Force-Password-Change Flow ungetestet

- **Schweregrad**: mittel
- **Datei:Zeile**: `backend/tests/integration/`
- **Beschreibung**: User mit `force_password_change=true` sollte bei Aufruf jedes Endpoints außer `/auth/change-password` 401/403 erhalten — oder zumindest das Frontend zur Password-Change-Seite zwingen. Nicht getestet, ob das Backend das durchsetzt.
- **Vorschlag**: Test: Admin legt User an, neuer User loggt ein, GET `/api/v1/me` zeigt `force_password_change=true`, danach POST `/api/v1/measuring-points` muss 403 sein, POST `/auth/change-password` darf durchgehen.

### 5.11 Permission-Matrix recorder vs. admin nicht systematisch

- **Schweregrad**: mittel
- **Datei:Zeile**: `backend/tests/integration/`
- **Beschreibung**: Es gibt vereinzelte recorder-403-Tests, aber keine Matrix, die alle mutierenden Endpoints (MP, Location, User, Audit, Replace-Meter) gegen recorder-Token testet.
- **Vorschlag**: `test_permissions_matrix.py` mit pytest-parametrize über (endpoint, method) × (admin, recorder) → erwarteter Status.

### 5.12 useChartTheme — Theme-Wechsel-Reaktivität ungetestet

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/lib/useChartTheme.ts` (kein Test)
- **Beschreibung**: Hook reagiert auf `prefers-color-scheme` und `.dark`-Class — wenn der Listener-Cleanup falsch ist, leaked es. Wenn die DOM-Beobachtung nicht greift, bleiben Charts in alter Farbe.
- **Vorschlag**: Vitest mit `@testing-library/react renderHook` und `matchMedia`-Mock.

---

## 6. Performance-Auffälligkeiten

### 6.1 N+1 in `list_readings` (siehe 4.4)

Dupliziert mit Datenmodell-Sektion — Hauptproblem ist das fehlende `selectinload(Reading.created_by)`.

### 6.2 Frontend Bundle > 500 kB (Vite-Warning beim Build)

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/vite.config.ts` · betroffen: Recharts, Leaflet, react-leaflet
- **Beschreibung**: Recharts und Leaflet werden synchron in den Main-Bundle gepackt. Sie werden aber nur auf Dashboard- und Locations-/Detail-Pages gebraucht. Mobile-Nutzer am Zählerschrank lädt das Bundle voll, obwohl er nur die Erfassungs-Page nutzt.
- **Vorschlag**: `React.lazy()` + `<Suspense>` für Dashboard-Seite (Recharts) und für `LocationMap`/`LocationMapSheet` (Leaflet). Sollte das Initial-Bundle deutlich reduzieren.

### 6.3 `MeasuringPointsAdminPage`/`DashboardPage` laden alle States in einem `Promise.all` ohne Throttling

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/features/dashboard/DashboardPage.tsx` · `frontend/src/features/measuring-points/MeasuringPointsAdminPage.tsx`
- **Beschreibung**: Bei vielen MeasuringPoints (n > 20) feuert das Frontend n parallele Requests. Selbst-gehostet ist das praktisch egal, aber bei Cold-Start mit kalter SQLite-WAL kann es zu Lock-Konflikten führen.
- **Vorschlag**: Nicht akut — bei einem typischen Privathaushalt (< 10 MPs) irrelevant. Falls relevant: `pLimit(5)` o. Ä.

### 6.4 Recharts re-rendert bei jedem `useChartTheme`-Tick

- **Schweregrad**: niedrig (zu verifizieren)
- **Datei:Zeile**: `frontend/src/features/dashboard/DashboardPage.tsx` · `frontend/src/lib/useChartTheme.ts`
- **Beschreibung**: Wenn `useChartTheme` Object-Referenzen instabil zurückgibt, re-rendern alle Charts bei jedem Render. `useMemo` im Hook sollte das verhindern.
- **Vorschlag**: Im Hook `useMemo` für das zurückgegebene Theme-Objekt nutzen, abhängig von den CSS-Variablen-Werten.

### 6.5 Fehlende Pagination im Frontend für Readings (siehe 4.5)

Das Backend-`limit=500` lädt das gesamte Set in den DOM, was bei hunderten Einträgen zu Render-Druck führt. Cursor-basierte Lazy-Load wäre langfristig sinnvoll.

---

## 7. Code-Qualität (Tote Pfade, Duplikate, Type-Hints)

### 7.1 `setLocations` in `DashboardPage` ist toter Code

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/features/dashboard/DashboardPage.tsx:61` (Deklaration), Zeilen 76-80 (kein Aufruf)
- **Beschreibung**: `const [, setLocations] = useState<...>([])` wird angelegt, aber `setLocations` nie aufgerufen. Suggeriert unfertige Refaktorierung.
- **Vorschlag**: Entweder entfernen oder aktivieren (z. B. wenn ein Location-Filter geplant ist).

### 7.2 Inkonsistente `key`-Strategie (`String(id)` vs. `\`prefix-${id}\``)

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/features/dashboard/DashboardPage.tsx:255` vs. `frontend/src/features/readings/ReadingsListPage.tsx:491-506`
- **Beschreibung**: Manche Listen nutzen `key={String(id)}`, andere `key={\`pill-${id}\`}`. Funktioniert beides, aber Inkonsistenz erschwert spätere Refaktoren.
- **Vorschlag**: Konvention im Codebase festlegen (z. B. immer Template-String mit Prefix), dann anpassen.

### 7.3 Sheet-Effect mit `onClose` in Dependency-Array

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/components/ui/Sheet.tsx:18-25`
- **Beschreibung**: `useEffect(..., [open, onClose])` registriert den Escape-Listener bei jedem Render neu, falls `onClose` nicht stabil ist. Konsumenten geben oft Inline-Funktionen.
- **Vorschlag**: Entweder `onClose` per `useRef` capture, oder konsumenten dokumentieren, dass `onClose` `useCallback`-stabil sein soll.

### 7.4 Z-Index-Hierarchie nicht zentralisiert

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/components/AppShell.tsx:202-208` (Tab-Bar `z-20`) · `frontend/src/components/ui/Sheet.tsx:30` (Sheet `z-50`) · `frontend/src/features/readings/RecordReadingPage.tsx:350` (Save-Bar `z-30`)
- **Beschreibung**: Drei Z-Index-Ebenen, jede Magic-Number. Beim Hinzufügen eines vierten Overlays (z. B. Toast) Risiko von Konflikten.
- **Vorschlag**: `frontend/src/components/ui/zindex.ts` mit benannten Konstanten — Verwendung im Tailwind über `z-[var(--z-tabbar)]` oder als JS-Literal.

### 7.5 `Object.keys(TYPE_LABELS) as MeterType[]` — typsicherer geht's

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/features/dashboard/DashboardPage.tsx:270` · `frontend/src/features/readings/ReadingsListPage.tsx:393`
- **Beschreibung**: `as`-Cast wird benutzt, weil `Object.keys` immer `string[]` zurückgibt. CLAUDE.md sagt „kein `as` ohne Begründung".
- **Vorschlag**: `const METER_TYPES = ['electricity','gas','water','oil'] as const satisfies readonly MeterType[]` und über das Array iterieren statt über `keys`.

### 7.6 Duplizierte Lade-Logik MP+Location+State zwischen Pages

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/features/measuring-points/MeasuringPointDetailPage.tsx` · `frontend/src/features/dashboard/DashboardPage.tsx` · `frontend/src/features/readings/RecordReadingPage.tsx`
- **Beschreibung**: Die drei Pages laden alle MeasuringPoints und ihre States über die gleichen Endpoints, jeweils mit eigenem Loading-State und Error-Handling.
- **Vorschlag**: Custom-Hook `useMeasuringPointsWithState()` extrahieren, der das einheitlich kapselt. Alternativ: leichte State-Library wie Zustand für Caching.

### 7.7 Decimal-Serialisierung als String — nicht in OpenAPI dokumentiert

- **Schweregrad**: niedrig
- **Datei:Zeile**: `backend/src/meters/schemas/common.py:8-11` (DecimalString-Type, falls benannt)
- **Beschreibung**: API-Konsumenten (z. B. eigener CSV-Skript) sehen in OpenAPI „type: string", verstehen aber nicht warum. Dokumentation fehlt.
- **Vorschlag**: `Field(..., description="Decimal value serialized as string to avoid float precision loss")` in Schemas.

### 7.8 `_to_read`-Helper in mehreren API-Modulen mit ähnlicher Struktur

- **Schweregrad**: niedrig (zu verifizieren)
- **Datei:Zeile**: `backend/src/meters/api/v1/measuring_points.py:55-58` · ggf. weitere Module mit eigener `_to_read`-Funktion
- **Beschreibung**: Viele Endpoint-Module haben einen privaten `_to_read`-Helper, der Pydantic-`.model_validate(...)` plus 1-2 Zusatzfelder kombiniert. Geringes Duplikat-Risiko.
- **Vorschlag**: Wenn das Pattern dreifach auftaucht: in `meters.api.v1._helpers` zusammenfassen.

### 7.9 Magic Numbers für Map-Höhen, Sheet-Höhen, Zoomstufen

- **Schweregrad**: niedrig
- **Datei:Zeile**: `frontend/src/components/LocationMap.tsx`, `LocationMapSheet.tsx`, `LocationsAdminPage.tsx` (200/360 px Map, Zoom 17)
- **Beschreibung**: Karten-Default-Zoom 17, Default-Center auf Berlin, Map-Höhen 200/360 — überall hardcoded.
- **Vorschlag**: `frontend/src/components/LocationMap.constants.ts` mit `DEFAULT_ZOOM`, `DEFAULT_CENTER`, `MAP_HEIGHT_*` exportieren.

### 7.10 Fehlende `aria-label` auf Icon-only-Buttons (Accessibility)

- **Schweregrad**: mittel (Accessibility, indirekt Code-Qualität)
- **Datei:Zeile**: `frontend/src/components/AppShell.tsx:216-237` (Erfassen-CTA Button mit `<Plus />` ohne aria-label) · `frontend/src/components/ui/Select.tsx:30` (ChevronDown ohne `aria-hidden`)
- **Beschreibung**: Mehrere prominente Icon-Buttons ohne Beschreibung für Screenreader. Tab-Bar-Button „Erfassen" hat nur Icon. Logout-Button hat schon `aria-label`, andere fehlen.
- **Vorschlag**: Alle Icon-only-Buttons mit `aria-label` versehen, dekorative Icons mit `aria-hidden`.

---

## Zusammenfassung: Prioritäten

**Kritisch** (bei Gelegenheit zuerst):
- 5.1 Verbrauchstest über Zählerwechsel
- 5.3 Concurrency-Test (Doppel-Erfassung)

**Hoch**:
- 2.1 RangeError in EditForm fangen
- 2.6 Plausibilitätscheck als Warnung statt harter 400-Block (CLAUDE.md-Verstoß, verifiziert)
- 3.1 Username-Limiter nach 2FA-Erfolg zurücksetzen
- 4.3 selectinload(Reading.created_by) in `list_readings`
- 5.2 Rollover-Edge-Cases
- 5.4 2FA-Challenge-Expiry-Tests
- 5.5 Audit-Log-Vollständigkeit
- 5.7 Heizöl-Verbrauchstests
- 5.9 Frontend-Format-Tests

**Mittel** (gut zu tun, kein akuter Schaden):
- 2.2 / 2.3 Stale-State-Race / fehlende Cancellation
- 3.4 CSV-Formel-Injection
- 4.1 Audit-Log-Indizes
- 4.2 Pending-Challenge-Cleanup
- 4.4 Pagination
- 5.6 / 5.8 / 5.10 / 5.11 Test-Lücken
- 7.10 Icon-Button-Accessibility

**Niedrig** / Doku / Style:
- 1.x, 2.4 / 2.5 / 2.7, 3.2 / 3.3 / 3.5 / 3.6 / 3.7, 4.5 / 4.6 / 4.7, 6.x, 7.x

---

**Verifikationsstand**: Folgende Befunde der ersten Audit-Version wurden direkt am Code verifiziert und entweder bestätigt oder gestrichen:

- ✅ **WAL-Pragma**: bestätigt korrekt gesetzt (`db/__init__.py:55-66`, `connect`-Listener mit WAL + foreign_keys + synchronous=NORMAL). Befund gestrichen.
- ✅ **Plausi-Block**: bestätigt als harter 400 (`readings.py:101-117, 118-134`) — Verstoß gegen CLAUDE.md, neu auf „hoch" eingestuft (2.6).
- ✅ **Username-Limiter / Konto-Enumeration**: bestätigt als false alarm (`auth.py:84-86` triggert Limiter auch bei nicht-existenten Usern). Befund gestrichen.
- ✅ **Delivery.amount > 0**: bestätigt als false alarm (`schemas/delivery.py:13,19` hat `Field(gt=Decimal('0'))`). Befund gestrichen.
- ✅ **resolve_session-Race**: bestätigt theoretisch existent, aber praktisch ungefährlich (User-Delete erfolgt nur als Deaktivierung). Auf „niedrig" downgegradet (3.2).
- ✅ **Location.name strip**: bestätigt — Whitespace-only mit `min_length=1` erlaubt (4.6).
- ✅ **Reading.created_by ondelete=SET NULL**: bestätigt — Designentscheidung, konsequent dokumentieren (4.7).

Verbleibende „zu verifizieren"-Hinweise im Text betreffen Punkte, die nicht direkt in der Sitzung gelesen wurden (z. B. 7.8 Helper-Duplikate, 4.7 Audit-Log-FK-Cascade, 6.4 useChartTheme-Stabilität). Die sind als Hinweis markiert, kein Schaden bei Inaktion.
