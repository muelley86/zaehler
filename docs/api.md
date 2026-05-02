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
