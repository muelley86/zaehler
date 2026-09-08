# API

> Stub. Wird im Implementierungs-Schritt befüllt.

Alle Endpoints unter `/api/v1`. Fehler im RFC-7807-Format
(`application/problem+json`). Decimal-Werte als String.

## Auth

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/change-password`

## Users (admin only)

- `GET /users`
- `POST /users`
- `PATCH /users/{id}`
- `POST /users/{id}/reset-password`
- `POST /users/{id}/sessions/revoke`

## Measuring Points

- `GET /measuring-points`
- `POST /measuring-points`
- `PATCH /measuring-points/{id}`
- `DELETE /measuring-points/{id}`
- `POST /measuring-points/{id}/replace-meter`

## Dashboard

- `GET /dashboard?granularity=day|week|month|year&from_at=YYYY-MM-DD&to_at=YYYY-MM-DD`
  — ein Request für die ganze Dashboard-Seite. Je zugänglicher Messstelle:
  Stammdaten-Minimum (Name, Typ, Standort, Hauptstandort, Eigentümer,
  Kostenstelle), aktive Register, `last_reading_at`, Verbrauchsreihe
  (`consumption[]`, Buckets der gewählten Granularität) und `totals[]`
  (`current`/`previous` je OBIS-Code, Einheit und Richtung `bezug|einspeisung`;
  `null` = kein Ablese-Intervall deckt den Zeitraum). Verrechnete Messstellen
  unter `virtual_items[]` (Netto-Reihe, `obis_code: "virtual"`). Top-Level:
  `from_date`, `to_date`, `previous_from_date`, `previous_to_date`,
  `granularity`, `partial` (`true` für Nicht-Admins: nur zugeordnete
  Messstellen enthalten). Vorperiode = gleich viele ganze Monate zurück, wenn
  der Bereich monatsaligned ist, sonst gleiche Tageslänge endend am Tag vor
  `from_at`. `granularity=month|year` liest die materialisierte Tabelle
  `monthly_consumption`, `day|week` rechnet aus den Roh-Ablesungen.
  `from_at > to_at` → 422. Die Dashboard-UI sendet seit v2.72 fest
  `granularity=month` (sie zeigt keine Verbrauchsreihe mehr; `totals[]` sind
  granularitätsunabhängig) — die anderen Werte bleiben für API-Clients gültig.

## Reports

- `GET /reports/aggregate?dimension=…&granularity=total|day|week|month|year&from_at=&to_at=`
  und `GET /reports/aggregate.csv` (gleiche Parameter). Kategoriale Filter als
  wiederholbare Query-Params: `main_location_id`, `location_id`, `owner_id`,
  `kostenstelle`, `meter_type`, `measuring_point_id` (explizite Messstellen-
  Auswahl; bei gesetztem Filter entfallen verrechnete/virtuelle Zeilen wie bei
  den anderen kategorialen Filtern). Der Response echot `from_date`/`to_date`.
- `GET|POST /report-configs`, `PATCH|DELETE /report-configs/{id}`: `filters`
  enthält u. a. `measuring_point_ids` (fehlt in Alt-Configs → leer).

## Readings

- `GET /readings`
- `POST /readings`
- `PATCH /readings/{id}`
- `DELETE /readings/{id}`

## Export

- `GET /export/readings.csv`
- `GET /export/dump.json`

## Audit

- `GET /audit-log`
