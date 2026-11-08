# Security-Audit — Zählerstand-App (2026-11-08)

**Stand des Audits:** `main` @ `57de334` (v2.90.1) · **Methode:** quelltextbasierter
Audit mit dem `security-audit`-Skill (Profil `standard`, 9 Hunter in 3 Wellen,
3 Coverage-Critics, je Kandidat unabhängige Verifier) · **Behoben in:** v2.90.2

> Der vollständige Arbeitsstand des Audits (Coverage-Ledger, Kandidaten,
> Verifier-Berichte) lag außerhalb des Repos. Befunde und Behebung sind hier
> selbst-enthaltend dokumentiert.

## 1. Zusammenfassung

**Keine kritischen oder hohen Befunde.** Die Kerngrenzen halten:
Recorder-Scope mit 404 über alle Lese-, Schreib-, Aggregat-, Such- und
Export-Pfade, Rollen admin / `can_billing` / recorder (alle Billing-Routen
gegated), Sessions + CSRF (SameSite=Strict + Origin-Check), strenge CSP,
Restore ohne Zip-Slip, SPA-Traversal-Schutz, keine HTML-Senken im Frontend,
SHA-gepinnte CI-Actions. Erstmals mitgeprüft: Abrechnungsmodul, Offline-Outbox,
Notizen, Kostenstellen/Bill-to.

Zehn Befunde, einer **mittel**, der Rest **niedrig** bis niedrig–mittel. Da der
Audit selbst keinen Zielcode ausführen durfte, wurde jeder Befund vor dem Fix
mit einem roten Regressionstest bestätigt (TDD) — alle zehn reproduzierten.

## 2. Befunde und Behebung

| # | Befund | Prio | Fix | PR |
|---|---|---|---|---|
| 1 | **TOTP-Brute-Force:** ein korrekter Passwort-Schritt leerte `login_limiter` und `username_limiter`, bevor der 2FA-Code geprüft war. Mit bekanntem Passwort ließ sich die Sperre per Re-Login beliebig oft umgehen. | mittel | Buckets werden erst nach vollständig erfolgreichem Login geleert (ohne 2FA: nach dem Passwort, mit 2FA: nach `/2fa/verify`). | #390 |
| 2 | **Pixel-Bombe im Foto-Upload:** Pillow warnt zwischen 1× und 2× `MAX_IMAGE_PIXELS` nur und decodiert trotzdem — ein PNG < 1 MB belegte bis ~1,4 GB RAM im einzigen App-Prozess. | niedrig–mittel | Eigene Obergrenze `MAX_PIXELS = 64 MP` in `services/reading_photo.py`, geprüft aus dem Header **vor** `load()`. | #392 |
| 3 | **Rechteausweitung App → root im Container:** Repo-Skripte (`deploy/lxc/*.sh`), Unit-Quelle und `.git/config` gehören dem Dienstkonto, werden bei `sudo zaehler …` aber von root ausgeführt bzw. ausgewertet. | niedrig–mittel | `zaehler.service`: ganzes Repo `ReadOnlyPaths`, einzige Ausnahme `repo/data`. `zaehler.sh` ruft `backup.sh` nur noch über `as_user` auf; `ensure_runtime_dirs` legt `repo/data` vor dem Start an. Statischer Regressionstest `test_deploy_hardening.py`. | #394 |
| 4 | **X-Forwarded-For links gelesen:** `client_ip` nahm das erste XFF-Element. Anhängende Proxies (nginx/NPM mit `$proxy_add_x_forwarded_for`) hängen die echte IP hinten an — das linke Element ist frei wählbar (IP-Rate-Limit umgehbar, gefälschte IPs im Audit-Log). | niedrig | Rechtestes Element, das kein vertrauenswürdiger Proxy ist (`_rightmost_untrusted_hop` in `api/deps.py`). | #395 |
| 5 | **Installer-Modus `proxy-other`:** `trust_proxy=True` bei Bind `0.0.0.0` ohne `trusted_proxy_ips` — jeder LAN-Client konnte XFF fälschen. | niedrig | Wizard fragt die Proxy-IP ab und pinnt sie; leer ⇒ `trust_proxy=False`. Boot-Warnung bei `trust_proxy` + nicht-loopback Bind + leerer Allowlist. | #395 |
| 6 | **Backup-Codes ohne Re-Auth:** `POST /auth/2fa/backup-codes/regenerate` brauchte nur das Session-Cookie — ein gestohlenes Cookie wurde zum dauerhaften zweiten Faktor; kein Audit-Eintrag. | niedrig | Verlangt aktuelles Passwort + gültigen TOTP-/Backup-Code (wie `/2fa/disable`), schreibt Audit `backup_codes_regenerated`. Frontend: gemeinsames `ReauthSheet`. | #391 |
| 7 | **Body vor Auth ungedeckelt:** Starlette spoolte beliebig große Request-Bodies auf Platte bzw. in den RAM, bevor die Auth-Prüfung lief. | niedrig | ASGI-Middleware `core/body_limit.py`: ohne gültige Session 64 KiB, mit Session `METERS_REQUEST_MAX_BODY_BYTES` (Default 25 MB, mind. Foto-Limit + 1 MB), Restore-Upload `METERS_BACKUP_MAX_UPLOAD_BYTES`. `Content-Length` sofort, chunked beim Lesen gezählt. | #392 |
| 8 | **SW-Cache nicht geleert:** der Workbox-Cache `api-get` wurde nur beim Logout-Button geleert, nicht bei 401 oder beim Login eines anderen Users — ein Folge-User sah offline API-Antworten des Vorgängers. | niedrig | `purgeUserCaches()` auch im 401-Zweig von `/auth/me` und bei Identitätswechsel nach Login/2FA-Verify. | #393 |
| 9 | **Logout ohne Server-Bestätigung:** scheiterte `POST /auth/logout` (Netz, 5xx), meldete die UI trotzdem „abgemeldet“ — Server-Session und 30-Tage-Cookie blieben gültig (geteiltes Gerät). | niedrig | Lokaler Purge nur bei Erfolg oder 401; sonst bleibt der User angemeldet und bekommt eine Fehlermeldung. | #393 |
| 10 | **QR-Assign-Existenzleck:** `POST /qr-tokens/{token}/assign` antwortete mit 409 inkl. `measuring_point_id` einer für den Recorder fremden Messstelle — Bruch der 404-Invariante. | niedrig | Gleiche Zugriffsprüfung wie `resolve`: fremde MP ⇒ 404. | #391 |

Begleitend (v2.90.3, #398): ein beim Verifizieren aufgefallener, nicht
sicherheitsrelevanter Fokus-Race im `Sheet` — der Initial-Fokus überschreibt
keinen Fokus mehr, den der Nutzer vor dem nächsten Frame schon gesetzt hat.

## 3. Verhaltensänderungen für Betrieb und Nutzer

- **Backup-Codes neu generieren** fragt jetzt Passwort und Authenticator- bzw.
  Backup-Code ab (`docs/anleitung.md` 6.3).
- **Abmelden** schlägt bei Netz-/Serverfehlern sichtbar fehl, statt lokal
  abzumelden.
- **Anonyme Requests** mit Body > 64 KiB werden mit 413 abgewiesen. Der
  Login-Body ist weit darunter; betroffen wäre nur Missbrauch.
- **`proxy-other`** fragt beim nächsten `sudo zaehler configure-network` die
  Proxy-IP ab. Bestandsinstallationen in diesem Modus: einmal neu durchlaufen,
  sonst bleibt `trust_proxy=True` ohne Allowlist (Boot-Warnung im Log).
- **systemd:** Das Repo `/opt/zaehler/repo` ist für den Dienst read-only,
  schreibbar bleiben `/opt/zaehler` (DB, Backups, Caches) und `repo/data`.
  Wirksam nach `sudo zaehler upgrade-app` (installiert die Unit neu).

## 4. Härtungshinweise (keine Befunde, offen)

Nicht als Befund gewertet, für spätere Iterationen festgehalten:

- **Auth:** CLI `reset-password` widerruft keine Sessions; Pending-2FA-Challenges
  ohne eigenen Fehlversuchsdeckel; `REQUIRE_TOTP_FOR_ADMIN` + erzwungener
  Passwortwechsel können sich gegenseitig blockieren; Last-Admin-Schutz ist
  check-then-act; der Username-Limiter erlaubt gezieltes Sperren eines Kontos.
- **Limiter/Audit:** `LoginRateLimiter._state` ohne Eviction (praktisch durch
  bcrypt-Drosselung begrenzt); `LOGIN_FAILED`-Einträge ohne Retention;
  Neustart setzt Sperren zurück.
- **Restore (admin-only):** Anzahl ZIP-Einträge ungedeckelt; widerrufene
  Sessions aus dem Backup leben wieder auf.
- **Uploads:** verwaiste Fotodatei bei Commit-Fehler; Rechnungs-PDF inline statt
  `attachment`/CSP-`sandbox`; pdfplumber synchron (nur Billing-User).
- **Billing:** Race zwischen `assert_entwurf` und Commit beim parallelen
  Festschreiben (auditiert); `als_text` entschärft nur `=`.
- **Recorder-Scope:** `/owners|suppliers|mieters/{id}/measuring-points` liefert
  200 `[]` statt 404 (Orakel nur über die ID); LIKE-Muster nicht escaped.
- **Offline:** Outbox-Replay prüft die Identität nicht gegen die Cookie-Session
  (Multi-Tab im selben Profil); kein Cross-Tab-Auth-Signal.
- **Deploy:** `uvicorn` ohne `proxy_headers=False`; `configure-network`-Werte
  landen ungeprüft in der gesourcten `meters.env`; Bootstrap/NodeSource/uv per
  `curl | sh` ohne Pin; Unit ohne `MemoryMax`/`TasksMax`.
