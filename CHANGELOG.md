# Changelog

Alle nennenswerten Änderungen an der Zählerstand-App. Format folgt
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/) und
[Semantic Versioning](https://semver.org/lang/de/).

Ab v1.0.0 wird dieses File **automatisch** von
[release-please](https://github.com/googleapis/release-please) aus
[Conventional-Commits](https://www.conventionalcommits.org/de/v1.0.0/)
generiert. Manuelle Einträge bitte oberhalb der nächsten Tag-Zeile
ergänzen, sonst werden sie beim nächsten Lauf überschrieben.

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
