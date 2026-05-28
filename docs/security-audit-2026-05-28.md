# Security-Audit — 2026-05-28

Vollständiger Review der Code-Basis durch drei unabhängige Explore-Agents
(SQL/Injection, Auth/Session, XSS/CSP/Upload/Secrets/Headers). Stand:
Backend 314 Tests grün, Tag `v2.24.2`.

## Zusammenfassung

**Keine kritischen Befunde.** Code ist defensiv programmiert mit
Defense-in-Depth: CSP streng, Origin-Check für CSRF, Magic-Byte-Validierung
beim Foto-Upload, Path-Traversal abgesichert, Rate-Limiting + Last-Admin-
Schutz + Username-Enumeration-Schutz, `secret_key`-Boot-Assertion.

Zwei **Low-Severity-Anmerkungen** dokumentiert (kein PR-Fix in dieser
Iteration, beide praktisch mitigiert). Zwei **defensive Härtungen** an
der Boot-Config in diesem Commit ergänzt (`assert_secure_production_config`).

## Befunde im Detail

### Sauber: Injection-Vektoren

- **SQL-Injection**: durchgehend SQLAlchemy-ORM mit Bind-Parametern; einziges
  `text()` (`models/physical_meter.py:34`) ist ein Literal ohne User-Input.
- **Command-Injection**: keine `subprocess`/`os.system`/`shell=True` im Backend.
- **Path-Traversal**: `services/reading_photo.py:199-212` validiert Basenamen
  und prüft `is_relative_to(media_dir)`. Generierte Filenames via
  `secrets.token_urlsafe(6)`, kein User-Input.
- **SSRF**: kein HTTP-Client zu User-kontrollierten URLs (Nominatim wird nur
  vom Frontend angesprochen).
- **JSON/XML-Injection**: alle Inputs durch Pydantic-Schemas validiert.
- **CRLF/Header-Injection**: `Content-Disposition`-Filenames sind hartkodiert.

### Sauber: Auth/Session

- **Session-Cookie**: `HttpOnly=True`, `SameSite=Strict`,
  `Secure=settings.cookie_secure` (in Production: Pflicht, siehe Härtung unten).
- **Token-Generierung**: `secrets.token_urlsafe(48)` → ~288 Bit Entropie.
- **Token-Speicherung**: nur HMAC-SHA256-Hash in der DB.
- **Sliding-Expiration** 30 Tage, server-seitig invalidiert beim Logout.
- **Multi-Device-Logout**: `revoke_all_for_user()` implementiert.
- **CSRF**: `install_origin_check()` lehnt mutierende Methoden mit fremdem
  Origin ab. Plus `SameSite=Strict` als 99-%-Mitigation. Kein CSRF-Token
  nötig.
- **IDOR**: `assert_can_access_mp` / `restrict_mp_query` konsequent
  angewendet (readings, deliveries, search, exports, state).
- **Recorder-Edit-Window**: `_can_edit` (readings.py) prüft
  `created_by_user_id` + 24 h.
- **Privilege-Escalation**: `PATCH /users/{id}` blockt Self-Edit + erzwingt
  Last-Admin-Schutz.
- **Password**: bcrypt-cost-12 (Default), Reset invalidiert alle Sessions,
  Force-Change-Flag.
- **TOTP**: Backup-Codes als HMAC-Hash, One-Time-Use, RFC-6238 mit ±30 s
  Drift; Username-Enumeration-Schutz via Dummy-Hash auf Login-Fail.
- **Rate-Limiting**: 5 Versuche/60 s pro IP + Username, 900 s Sperre. Thread-
  safe mit `monotonic()`.

### Sauber: Frontend / Upload / Headers

- **XSS**: kein `dangerouslySetInnerHTML`, alle User-Strings durch React
  HTML-escaped gerendert.
- **CSP** (`core/middleware.py:33-54`): `default-src 'self'`,
  `script-src 'self'` (kein `unsafe-inline`), `style-src 'self' 'unsafe-inline'`
  (React-Inline-Styles), `object-src 'none'`, `frame-ancestors 'none'`,
  `connect-src` whitelistet OSM/Esri/Nominatim.
- **File-Upload**: MIME-Validierung via `Image.open()`-Magic-Byte-Check,
  20 MB Default-Limit, Filename aus `secrets.token_urlsafe`, Pillow-Re-Encode
  (entfernt potenziell ausführbare Bestandteile aus EXIF).
- **Security-Headers**: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (camera selektiv freigegeben), HSTS mit
  `includeSubDomains` wenn `cookie_secure=True`. Kein `X-Powered-By`.
- **CORS**: bewusst kein `CORSMiddleware` — Same-Origin im LXC.
- **Secrets**: `secret_key`-Default wird beim Boot mit `assert_secure_secret_key()`
  erzwungen (RuntimeError in Production). Keine API-Tokens im Bundle.
- **Dependencies**: keine bekannten CVE-anfälligen Versionen
  (fastapi ≥ 0.115, sqlalchemy ≥ 2.0, bcrypt ≥ 4.2, Pillow via qrcode).

### Low-Severity-Anmerkungen (kein PR-Fix in dieser Iteration)

1. **TOTP-Secret plaintext in DB** (`models/user.py:46`). Bei DB-File-Leak
   wäre der zweite Faktor kompromittiert. Risiko gering, weil das DB-File im
   LXC mit `0600` liegt und der Container von Außen nicht direkt
   beschreibbar/lesbar ist. Encryption-at-rest (z. B. `cryptography.fernet`
   mit `secret_key` als KMS) wäre sauberer und kommt, sobald wir externe
   Threat-Models einbeziehen.

2. **HMAC-Lookup pro Request** (`services/auth.py:81`). Die DB-Query
   `Session.token_hash == hash_session_token(token)` ist nicht
   konstant-zeit, aber der Hash-Schritt davor (HMAC-SHA256) ist der
   teuerste Anteil. Theoretisches Timing-Leak ist praktisch durch das
   Login-Rate-Limit + Session-TTL mitigiert. Constant-time-Vergleich
   (`secrets.compare_digest`) wäre die saubere Variante; kommt in einer
   späteren Iteration.

## Härtung in diesem Commit

Neue Funktion `assert_secure_production_config()` in `core/config.py`,
aufgerufen in der App-Factory (`main.py`):

- `debug=False && cookie_secure=False` → **RuntimeError beim Boot**.
  Verhindert, dass das Session-Cookie in Production über HTTP gesendet
  werden kann.
- `debug=False && cookie_secure=True && trust_proxy=False` → **Warning**.
  Der LXC-Reverse-Proxy ist faktisch immer vorgeschaltet, wenn HTTPS
  terminiert wird. Ohne `trust_proxy=True` greift das Rate-Limit auf die
  Proxy-IP zurück und sperrt das ganze Netzwerk gemeinsam.

`assert_secure_secret_key()` existiert bereits und bleibt unverändert.

Tests in `tests/unit/test_consumption.py` decken Boot-Abort, Warning und
Dev-Skip ab.

## Re-Audit-Trigger

Nächstes Audit spätestens:
- bei Major-Dep-Bump (FastAPI 1.x, SQLAlchemy 3.x, React 19, …),
- nach Einführung externer Integrationen (Webhooks, SSO, etc.),
- oder einmal pro Jahr (nächstes Datum: 2027-05).
