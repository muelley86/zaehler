# Datenmodell

> Ausgelagert aus CLAUDE.md, damit die Projekt-Memory schlank bleibt.


Drei Ebenen: MeasuringPoint → PhysicalMeter → Register → Reading

- MeasuringPoint (logische Messstelle, dauerhaft):
  id, name, type (electricity|gas|water), location,
  is_bidirectional, has_dual_tariff, created_at
  Beispiel: "Hauptzähler Strom Keller"

- PhysicalMeter (konkretes Gerät, wird getauscht):
  id, measuring_point_id, serial_number,
  installed_at, removed_at (nullable),
  initial_values (JSON: {obis_code: startwert}),
  transformer_factor (nullable, nur Strom; seit Migration 0035 am Gerät statt an der
  Messstelle — jede Ablesung wird mit dem Faktor des Geräts gerechnet, an dem sie hängt;
  `MeasuringPoint.transformer_factor` ist nur noch der Faktor des aktiven Geräts)
  Beim Tausch: removed_at am alten setzen, neuen anlegen mit
  installed_at und Anfangsständen (meist 0, manchmal nicht).

- Register: id, physical_meter_id, obis_code, label, unit, is_active

- Reading: id, register_id, value (Decimal), reading_date,
  note, created_at, created_by_user_id
  (Fotos liegen seit der 1→N-Umstellung in der Kind-Tabelle `reading_photo`,
  bis zu 6 je Erfassung — die frühere Einzelspalte `photo_path` ist abgelöst.)

Werte als Decimal speichern, NIEMALS Float (Rundungsfehler bei
Zählerständen). reading_date strikt von created_at trennen –
Erfassung erfolgt oft nachträglich.

- User: id, username (unique), email (optional), password_hash,
  role (admin|recorder), is_active, created_at, last_login_at

- Session: id, user_id, token_hash, created_at, expires_at,
  last_seen_at, user_agent, ip_address


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
- Monats-/Bucket-Aggregation interpoliert **taggenau**: ein Verbrauchs-Delta,
  das über eine Monatsgrenze reicht, wird linear (konstanter Tagesverbrauch)
  anteilig auf die Monate verteilt (`split_across_buckets`). Monatswerte werden
  in `monthly_consumption` materialisiert (Cache) — siehe Sektion „Weitere
  Features → Metering".
- Quellenwahl zentral in `services/consumption_source.py::points_for_measuring_point`:
  Granularität `month`/`year` liest die materialisierte `monthly_consumption`-Tabelle
  (Jahres-Rollup ist exakt — ein Monats-Bucket überspannt nie eine Jahresgrenze),
  `day`/`week`/Gesamt (kein Bucket) rechnet on-the-fly aus den Roh-Readings.
  `SourceCache` memoisiert beide Quellen für die Dauer eines Requests.
  `clip_consumption_to_range` schneidet ausschließlich Roh-Intervalle taggenau zu —
  nie Bucket-Punkte (deren Grenzen bleiben inklusiv, kein Clipping).

## Zählerwechsel-Workflow

Endpoint: POST /api/v1/measuring-points/{id}/replace-meter

Pflichtfelder:

- final_readings: Endstände aller aktiven Register des alten Zählers
- removed_at: Datum
- new_serial_number
- installed_at: Datum (>= removed_at)
- initial_readings: Startstände des neuen Zählers pro OBIS-Code
- new_transformer_factor (optional): Feld weglassen = Faktor des alten Geräts übernehmen,
  `null` = kein Wandler

Atomar in einer Transaktion:

1. final_readings als Reading am alten PhysicalMeter speichern
2. removed_at am alten setzen, alle alten Register is_active=false
3. neuen PhysicalMeter mit Registern anlegen
4. initial_readings als erstes Reading am neuen PhysicalMeter

