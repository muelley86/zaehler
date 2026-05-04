# Changelog

Alle nennenswerten Änderungen an der Zählerstand-App. Format folgt
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/) und
[Semantic Versioning](https://semver.org/lang/de/).

Ab v1.0.0 wird dieses File **automatisch** von
[release-please](https://github.com/googleapis/release-please) aus
[Conventional-Commits](https://www.conventionalcommits.org/de/v1.0.0/)
generiert. Manuelle Einträge bitte oberhalb der nächsten Tag-Zeile
ergänzen, sonst werden sie beim nächsten Lauf überschrieben.

## [2.2.0](https://github.com/muelley86/zaehler/compare/v2.1.1...v2.2.0) (2026-05-04)


### Funktionen

* **measuring-points:** Wandlerfaktor für Strom-Messstellen ([04ee377](https://github.com/muelley86/zaehler/commit/04ee3779f4bb923b078aa5f92e49148112099552))
* Wandlerfaktor für Strom-Messstellen + UI-Fixes ([c75238e](https://github.com/muelley86/zaehler/commit/c75238e5f0dfba69de39855a0450a5dacd34e454))

## [2.1.1](https://github.com/muelley86/zaehler/compare/v2.1.0...v2.1.1) (2026-05-04)


### Fehlerbehebungen

* **install:** Node.js 20 statt apt-Default — behebt pnpm-Engine-Warning ([a5a50dc](https://github.com/muelley86/zaehler/commit/a5a50dcabf471f1d77c7d34e07127da267d31b14))
* **install:** Node.js 20 statt apt-Default — behebt pnpm-Engine-Warning ([ebb2807](https://github.com/muelley86/zaehler/commit/ebb2807cafb16ebc01645627c078ce0aa93b02e9))
* **ui:** Einstellungen (inkl. 2FA) auch in Desktop-Sidebar erreichbar ([a313f82](https://github.com/muelley86/zaehler/commit/a313f8220e7e005b8045ec54fbf1fe6eb7b07afc))
* **ui:** Sheet via Portal rendern — behebt 2FA-Modal "kleines graues Fenster" auf iOS ([4ef23eb](https://github.com/muelley86/zaehler/commit/4ef23eb90efe8b808684b67f4b7e96b38ced35c1))

## [2.1.0](https://github.com/muelley86/zaehler/compare/v2.0.0...v2.1.0) (2026-05-04)


### Funktionen

* **locations:** Geo-Koordinaten mit Karten-Picker und Read-Sheet ([1391b7e](https://github.com/muelley86/zaehler/commit/1391b7e6f337716c385c6de1dd095b92c2c1fa88))
* **locations:** MapPicker mit Adress-Suche (Nominatim) + kompakteres Layout ([b86feca](https://github.com/muelley86/zaehler/commit/b86fecadffa61cea066e7f4f1263e66cf20faf32))
* **lxc:** neues 'fix-database'-Kommando für DB-Recovery in einem Schritt ([808aefa](https://github.com/muelley86/zaehler/commit/808aefa81b5538c13f8d0a8ef9551679e9ba74a4))
* **readings:** Plausi-Warnung statt harter Block + selectinload + UI-Fixes ([d968e7e](https://github.com/muelley86/zaehler/commit/d968e7e83ca13ab771d64921d53549b7929806f6))


### Fehlerbehebungen

* **alembic:** DB-URL aus settings.database_url statt alembic.ini ([7b30d77](https://github.com/muelley86/zaehler/commit/7b30d77a9016291a3a741b908b6f6b18b37774fe))
* **auth:** force_password_change erzwingen + Username-Limiter-Reset + resolve_session-Härtung ([bba5504](https://github.com/muelley86/zaehler/commit/bba5504372aa3cea54c5fa36175ddd3ffff347f8))
* **cli:** create-admin verlangt alembic-Migration statt Base.metadata.create_all ([4f61c4c](https://github.com/muelley86/zaehler/commit/4f61c4c186996eabb51074dfccb569dda525114d))
* **lxc:** as_user wechselt ins $HOME, sonst scheitert pnpm self-update ([1cf708f](https://github.com/muelley86/zaehler/commit/1cf708fd9798835db5b9bf70a8c3b37e52569698))
* Suche-Form schloss Sheet, MP-Detail-API fehlte, Standort-Link in Detail ([0f97662](https://github.com/muelley86/zaehler/commit/0f976629ea1c7616a653aa567d5d9a7b0d37e61d))
* **ui:** aria-Labels auf Erfassen-CTA, aria-hidden auf dekorative Icons ([6fb4e09](https://github.com/muelley86/zaehler/commit/6fb4e09d0d4d3c384f6696447f30355caeb19bbb))
* **ui:** MapPicker-Layout — Buttons garantiert sichtbar im iPhone-Sheet ([340c836](https://github.com/muelley86/zaehler/commit/340c8360eddfeac0eabc8dbf9ba8298484adfae9))
* **ui:** Save-Bar über Tab-Bar, MapPicker passt auf iPhone-Sheet ([5f527d8](https://github.com/muelley86/zaehler/commit/5f527d80cd8464201ec352f1c82857902642a6b4))


### Refactoring

* **schemas:** Location.name strip + tank_capacity nur bei type=oil ([d73a479](https://github.com/muelley86/zaehler/commit/d73a479362c69db723af8dd38ff16a4cc48aa5cf))

## [2.0.0](https://github.com/muelley86/zaehler/compare/v1.0.0...v2.0.0) (2026-05-03)


### ⚠ BREAKING CHANGES

* **install:** Bestehende Installs mit METERS_BIND_HOST=127.0.0.1 laufen unverändert (configure-network ist opt-in). Wer das aktuelle Wizard-Verhalten "Proxy automatisch konfigurieren" wollte, ruft jetzt nach 'install' einmal 'configure-network' auf.

### Funktionen

* **install:** Reverse-Proxy-Domain optional im Wizard, IP-Zugriff garantiert ([db36842](https://github.com/muelley86/zaehler/commit/db3684219493ebc75a6c4ce6e4ec641cf311ad73))


### Fehlerbehebungen

* **config:** METERS_ALLOWED_ORIGINS akzeptiert comma-separierte Strings ([ab26bbb](https://github.com/muelley86/zaehler/commit/ab26bbb8a2a2a876eebcc2e8403635fde8a1782f))
* **frontend:** Auth-Hook in eigene Datei + flächige prettier-Formatierung ([de06ef2](https://github.com/muelley86/zaehler/commit/de06ef2dd9789801d9f928e1717e5cdbe4c61f97))
* **install:** UTF-8 erzwingen vor Locale-Setup ([4af2f60](https://github.com/muelley86/zaehler/commit/4af2f607ea47ec8dd030706526ab91db5da70035))
* **install:** Wizard immer LAN-default + neues 'configure-network'-Kommando ([e34d8a7](https://github.com/muelley86/zaehler/commit/e34d8a79e852546ab37714e8c209ab994bfdfaa0))
* **install:** Wizard mit drei Topologien + Repo-URL-Default + NGINX/NPM-Doku ([e8dad47](https://github.com/muelley86/zaehler/commit/e8dad47e3818eb130ba7edc108810d4ac43a8ec9))


### Dokumentation

* Backup-Dokumentation in beiden README-Dateien ausgebaut ([b28c0d5](https://github.com/muelley86/zaehler/commit/b28c0d58ae4294489b3a4f8c7f82235dba7599c5))
* MFA-Querverweise — Wizard-Hinweis, Login-Trouble, Recovery, Backup-Schutz ([91e3fad](https://github.com/muelley86/zaehler/commit/91e3fadfe7ecb0ef890ee7266d63f3ba888c3c69))

## [1.0.0] – 2026-05-03

### Funktionen

- Mehrere Messstellen-Typen (Strom mit HT/NT/bidirektional, Gas, Wasser,
  Ölheizung mit Tank-Fixpunkten, Lieferungen und Bestandskorrektur).
- Mehrere Erfassungen pro Tag, Plausibilitätsprüfung mit Warnung bei
  Rückgang kumulativer Zähler.
- Standorte zentral verwaltbar, Benutzerverwaltung mit `admin`/`recorder`-
  Rollen und erzwungenem Passwortwechsel beim ersten Login.
- Audit-Log über Logins, Änderungen, Zählerwechsel, 2FA-Events,
  Backup-Code-Verwendung.
- Dashboard mit Filtern nach Standort/Zählerart/Messstelle/Zeitraum,
  Verbrauchs- und Stand-Diagrammen, aggregierter Verbrauchs-Übersicht.
- CSV-Export auf Dashboard- und Erfassungs-Seite.
- Liquid-Glass-UI in OKLCH-Farben mit warmem Orange-Akzent;
  Light/Dark-Modus erst- und gleichrangig (System-Setting + manueller
  Toggle), JetBrains Mono mit `tabular-nums` für alle Zahlen,
  responsive (Mobile-Bottom-Tab-Bar / Desktop-Sidebar).
- Zwei-Faktor-Authentisierung pro User (TOTP nach RFC 6238) mit
  10 single-use Backup-Codes; QR-Setup, Self-Service-Aktivierung +
  Deaktivierung in der Mehr-Page.
- Self-hosted Fonts (Inter Tight + JetBrains Mono via @fontsource);
  keine externen CDN-Abhängigkeiten.
- LXC-Bootstrap mit whiptail-Wizard im Stil der Proxmox-Helper-Scripts;
  fragt HTTPS-Reverse-Proxy ab und konfiguriert dann automatisch
  `cookie_secure`, `trust_proxy`, `allowed_origins`, HSTS.

### Sicherheit

- Server-seitige Sessions (HMAC-SHA256-gehasht in der DB), bcrypt-12
  für Passwörter.
- Login-Lockout zweistufig: 5 Fehlversuche/min/IP → 15 min, 10
  Fehlversuche/10 min/Username → 30 min (schützt gegen IP-Hopping).
- CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options,
  Permissions-Policy auf jeder Antwort; HSTS bei aktivem
  `cookie_secure`.
- Origin-Check-Middleware auf allen mutating Requests
  (POST/PATCH/PUT/DELETE) — Defense-in-Depth zu `SameSite=strict`.
- `X-Forwarded-For` wird nur mit explizitem `METERS_TRUST_PROXY=True`
  ausgewertet.
- systemd-Hardening mit `MemoryDenyWriteExecute`,
  `SystemCallFilter=@system-service`, `PrivateUsers`,
  `RestrictNamespaces/Realtime/SUIDSGID`, leerem
  `CapabilityBoundingSet`.
- Backup-Verzeichnis unter `0700`; `data/`-Verzeichnis unter `0750`.

### Tooling

- `zaehler.sh` als zentrales Verwaltungsskript mit Subkommandos
  `install`, `upgrade-system/-tools/-app/-all`, `backup`, `restore`,
  `rollback`, `reset-password`, `audit`, `status`, `help`.
- Tägliches automatisches Backup via systemd-Timer (Default 03:30,
  Wizard-konfigurierbar); Retention 30 jüngste Snapshots.

[1.0.0]: https://github.com/muelley86/zaehler/releases/tag/v1.0.0
