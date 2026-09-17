# UI-Anforderungen

> Ausgelagert aus CLAUDE.md, damit die Projekt-Memory schlank bleibt.


- Mobile-first (Erfassung am Zählerschrank mit dem Handy)
- Eingabe großer Touch-Targets, numerische Tastatur bei Zahlenfeldern
- Foto-Upload optional (vom Zählerstand zur Beweissicherung), bis zu 6 Fotos je Erfassung
- Plausibilitätscheck beim Speichern: neuer Wert >= letzter Wert
  (außer Rollover oder Zählerwechsel) – Warnung, nicht harter Block
- Übersichtsdashboard (`features/dashboard/`): ein `GET /api/v1/dashboard`-Request
  pro Zeitraum/Granularität deckt die ganze Seite (kein `/measuring-points`,
  kein `/locations`), Client-Cache (SWR, 12 Einträge, `useDashboardData.ts`,
  auf Logout/401 geleert). KPI-Kacheln mit Δ zur Vorperiode, Hinweise-Karte
  (nie/lange nicht abgelesen ab 45 Tagen, Abweichung > ±30 % ggü. Vorperiode),
  Top-Verbraucher (Top 5, nur Bezug, reale Messstellen). Filter inline
  (Desktop) bzw. Bottom-Sheet mit Chips (Mobile, `DashboardFilters.tsx`).
  **Keine Diagramme** (seit v2.72 entfernt — Verläufe gibt es in den
  Auswertungen): das Frontend sendet fest `granularity=month` (günstigster
  Backend-Pfad über `monthly_consumption`; die `totals[]` für KPI/Hinweise/
  Top-Verbraucher sind granularitätsunabhängig, `consumption[]` wird nicht
  ausgewertet). Cache-Hit mit Hintergrund-Refetch zeigt „Aktualisiere…". Kein
  CSV-Export auf dieser Seite (dafür der Export-Bereich).
- Auswertungen (`features/reports/`, Route `/auswertungen`): **kein Auto-Load**
  — Filter setzen (Gruppierung, Zeitraum, Auflösung, Vergleich, kategoriale
  Filter inkl. expliziter **Messstellen**-Mehrfachauswahl → Query-Param
  `measuring_point_id`, in Report-Configs als `measuring_point_ids`; alle
  haben Standardwerte) und explizit **„Auswerten"** drücken, erst dann
  `GET /reports/aggregate` (`useReportQuery`: anstehende vs. ausgeführte
  Query, Abort des Vorgängers). **„Filter zurücksetzen"** (Aktionszeile)
  stellt die ganze Seite auf Standard und ist im Standardzustand deaktiviert.
  **Vergleich** (`ComparePeriodFields.tsx`): Periode 1 = der gewählte
  Zeitraum, Periode 2 = Vorjahr (Default, `previousYearRange`) | Vorperiode
  (`previousPeriodRange`, Regel wie `services/dashboard.py::previous_range`) |
  Benutzerdefiniert (von/bis); die aufgelösten Daten werden angezeigt. Gate
  (`runBlocker`): Button deaktiviert + Hinweis nur bei „Benutzerdefiniert"
  ohne Von/Bis, Periode 2 „Benutzerdefiniert" ohne Daten bzw. Vorjahr/
  Vorperiode bei offenem Zeitraum. **Gespeicherte Auswertungen** stehen immer ganz oben
  (auch leer); ein Klick übernimmt nur die Filter, ausgewertet wird erst per
  Button. Nach einer Filteränderung bleibt der letzte Lauf stehen mit Hinweis
  „Filter geändert – erneut auswerten"; Tabelle/CSV/partial-Hinweis leiten
  sich ausschließlich aus dem ausgeführten Lauf ab (CSV = das Angezeigte,
  „Speichern" = die aktuellen Filter). Ergebnis als **Tabelle | Diagramm**
  umschaltbar (Default Tabelle; Recharts-Chunk lädt erst beim Umschalten):
  Auflösung „Gesamt" oder Vergleich → Balken je Zeile (Vergleich: beide
  Perioden nebeneinander), Tag/Woche/Monat/Jahr → Verlauf je Gruppe(+Richtung)
  über `period_end`, Linie mit Umschalter auf Balken; ein Chart je (Zählerart,
  Einheit), Lesbarkeits-Hinweis ab 25 Serien. **Vergleichstabelle**:
  Messstelle | Zählerart | Zeitraum A | Zeitraum B | Δ | Δ % — die beiden
  Perioden-Köpfe zeigen den vom Backend zurückgemeldeten Datumsbereich des
  ausgeführten Laufs (`periodLabel`: „01.01.2025 – 31.12.2025", offene Enden
  „ab …"/„bis …", sonst „Gesamter Zeitraum"); dieselben Labels tragen die
  Vergleichs-CSV und die Diagramm-Legende. **Nur im CSV-Export**
  (`/reports/aggregate.csv`, nicht Tabelle/JSON/Vergleichs-CSV) stehen
  zusätzlich `Seriennummer` (nach `Gruppen_ID`) sowie `Wandlerfaktor`,
  `Zählerstand_Beginn`, `Zählerstand_Ende` (vor `Verbrauch`) — befüllt nur
  bei Gruppierung „Messstelle" für echte Messstellen
  (`services/report_meter_readings.py`: taggenau interpolierte Stände an den
  Periodengrenzen, Rohwert wie am Display, HT/NT summiert, Zählerwechsel →
  „alt / neu").
- Globaler Datumsbereich (`components/GlobalDateRange.tsx`, State in
  `features/prefs/FilterPrefsProvider.tsx`, Helfer in `lib/dateRange.ts`):
  app-weiter Zeitraum-Filter (Dashboard, Erfassungen, Auswertungen — dort per
  Perioden-Preset statt `shared_range` abwählbar), sitzungspersistent
  (sessionStorage `app.dateRange`). Standard (v2.71.0): 1. Tag des Vormonats
  bis letzter Tag des laufenden Monats; „Datum zurücksetzen" stellt genau
  diesen Standard wieder her. Die ◀/▶-Pfeile verschieben monatsweise
  (`shiftRangeByMonths`); ein Monatsende bleibt dabei Monatsende
  (30.06. +1 → 31.07., Stepping invertierbar), andere Tage werden aufs
  Zielmonatsende geclampt.
- Export als CSV (alle Readings) und JSON (vollständiger Dump); CSV im
  deutschen Excel-Format (`;`-Delimiter, Komma-Dezimal, UTF-8-BOM)
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
    Zwei Layouts wählbar (gespeichert in localStorage):
    `cut-2x4` (Schnitt-Bogen 95×65 mm, 8/Bogen — Default, mit Token-Text
    und MP-Namen) und `avery-l6008` (Avery L6008-20, wetterfest, 25,4 ×
    10 mm, 7×27 = 189/Bogen). Auf den Avery-Bögen wird nur der QR als
    10×10 mm Quadrat mittig pro Etikett gedruckt — keine Token-/MP-
    Beschriftung, weil sie auf dieser Größe nur Platz kostet.
    Für den Avery-Bogen sind Margin/Pitch in mm im UI feinjustierbar
    (Override pro Layout in localStorage). Alte localStorage-Keys
    (`avery-l4731rev`, `avery-3320`) werden in `loadPrefs()` migriert
    bzw. verworfen. **Beim Drucken im Browser-Dialog** zwingend
    „Ränder: Keine" und „Skalierung: 100 %" wählen — sonst staucht
    der Browser den Inhalt und die letzte Etikettenreihe rutscht aus
    dem Druckbereich. Das Pop-up zeigt vor dem Druck einen gelben
    Hinweis-Banner mit genau diesen Einstellungen. Wichtig in
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

