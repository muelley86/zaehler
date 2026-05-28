# Changelog

Alle nennenswerten Änderungen an der Zählerstand-App. Format folgt
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/) und
[Semantic Versioning](https://semver.org/lang/de/).

Ab v1.0.0 wird dieses File **automatisch** von
[release-please](https://github.com/googleapis/release-please) aus
[Conventional-Commits](https://www.conventionalcommits.org/de/v1.0.0/)
generiert. Manuelle Einträge bitte oberhalb der nächsten Tag-Zeile
ergänzen, sonst werden sie beim nächsten Lauf überschrieben.

## [2.18.0](https://github.com/muelley86/zaehler/compare/v2.17.0...v2.18.0) (2026-05-28)


### Funktionen

* **dashboard:** Standort-Gruppen mit zuklappbaren Akkordeons ([#95](https://github.com/muelley86/zaehler/issues/95)) ([a0ecc30](https://github.com/muelley86/zaehler/commit/a0ecc30d69ac431bf3c47ae9a5c3fa58b66f6c6e))

## [2.17.0](https://github.com/muelley86/zaehler/compare/v2.16.5...v2.17.0) (2026-05-28)


### Funktionen

* **dashboard:** Default-Datumsbereich auf aktuelles Jahr, „Zaehlerstand"-Prefix vor Bezugs-Label ([#93](https://github.com/muelley86/zaehler/issues/93)) ([f3d4e3b](https://github.com/muelley86/zaehler/commit/f3d4e3b9ceee41a9e7e155e5df7b71eef04f7988))

## [2.16.5](https://github.com/muelley86/zaehler/compare/v2.16.4...v2.16.5) (2026-05-28)


### Fehlerbehebungen

* **pwa:** Release-Trigger fuer fehlende Manifest-Icons (v2.16.5) ([9219dd2](https://github.com/muelley86/zaehler/commit/9219dd28505de80e2466ee5cc0c72936b2509fd5))

## [2.16.4](https://github.com/muelley86/zaehler/compare/v2.16.3...v2.16.4) (2026-05-28)


### Fehlerbehebungen

* **scanner:** Zoom 2x wenn unterstuetzt, Capabilities-Log, AF nur bei Support ([#89](https://github.com/muelley86/zaehler/issues/89)) ([d8497b3](https://github.com/muelley86/zaehler/commit/d8497b3ef0af52adf52c488a69922d2124e2e576))

## [2.16.3](https://github.com/muelley86/zaehler/compare/v2.16.2...v2.16.3) (2026-05-28)


### Fehlerbehebungen

* **scanner:** AutoFocus + kleinere qrbox + Diagnose-Log fuer kleine QRs ([#87](https://github.com/muelley86/zaehler/issues/87)) ([519d347](https://github.com/muelley86/zaehler/commit/519d3478232fd3d288cb681185f62e902bef0b01))

## [2.16.2](https://github.com/muelley86/zaehler/compare/v2.16.1...v2.16.2) (2026-05-28)


### Fehlerbehebungen

* **scanner:** width/height aus 1. start-Argument in videoConstraints verschieben ([#85](https://github.com/muelley86/zaehler/issues/85)) ([28c85d4](https://github.com/muelley86/zaehler/commit/28c85d49d077873457e50557c2b2a90440da23ad))

## [2.16.1](https://github.com/muelley86/zaehler/compare/v2.16.0...v2.16.1) (2026-05-28)


### Fehlerbehebungen

* **scanner:** Original-Fehler sichtbar machen, iOS-Constraints aufweichen ([#83](https://github.com/muelley86/zaehler/issues/83)) ([808ce6f](https://github.com/muelley86/zaehler/commit/808ce6f814ac82ad9379e3e31380a782c40d166e))

## [2.16.0](https://github.com/muelley86/zaehler/compare/v2.15.3...v2.16.0) (2026-05-28)


### Funktionen

* **scanner+qr-admin:** HD-Aufloesung, iOS-Chrome-Hinweis, Pagination + 4 Druck-Modi ([#79](https://github.com/muelley86/zaehler/issues/79)) ([d08ddff](https://github.com/muelley86/zaehler/commit/d08ddffff3f2c451560d799093576aede9ad5c40))

## [2.15.3](https://github.com/muelley86/zaehler/compare/v2.15.2...v2.15.3) (2026-05-28)


### Fehlerbehebungen

* **scanner:** fps + qrbox-Konfig fuer iPhone-Erkennung + iOS-Permission-Hinweis ([#77](https://github.com/muelley86/zaehler/issues/77)) ([696b4f3](https://github.com/muelley86/zaehler/commit/696b4f3b1cb9ba5c04ad103295b69ee38bcc340c))

## [2.15.2](https://github.com/muelley86/zaehler/compare/v2.15.1...v2.15.2) (2026-05-28)


### Fehlerbehebungen

* **perf:** Backend-Hang dauerhaft entlasten + Scanner-Diagnose-Toast ([#75](https://github.com/muelley86/zaehler/issues/75)) ([30879c0](https://github.com/muelley86/zaehler/commit/30879c00adc506a6450ebfef219185f96599006e))

## [2.15.1](https://github.com/muelley86/zaehler/compare/v2.15.0...v2.15.1) (2026-05-28)


### Fehlerbehebungen

* **readings:** Concurrency-Limit fuer State-Fetch in der Erfassen-Seite ([#73](https://github.com/muelley86/zaehler/issues/73)) ([c0bd7e1](https://github.com/muelley86/zaehler/commit/c0bd7e1edc4adb711b4d6a3bf073c41b7eab7d37))

## [2.15.0](https://github.com/muelley86/zaehler/compare/v2.14.2...v2.15.0) (2026-05-28)


### Funktionen

* **qr:** Avery L6008-20 als Drucklayout, L4731REV/3320 entfernt ([#71](https://github.com/muelley86/zaehler/issues/71)) ([b5b877e](https://github.com/muelley86/zaehler/commit/b5b877e3a50be9231ef0a1bcd35c35238a0dffd0))

## [2.14.2](https://github.com/muelley86/zaehler/compare/v2.14.1...v2.14.2) (2026-05-28)


### Fehlerbehebungen

* **qr:** Bulk-QR-Druck mit 189 Etiketten zuverlaessig hinbekommen ([#69](https://github.com/muelley86/zaehler/issues/69)) ([242f0e0](https://github.com/muelley86/zaehler/commit/242f0e0e841842bab17bba63029a87c9a1aae860))

## [2.14.1](https://github.com/muelley86/zaehler/compare/v2.14.0...v2.14.1) (2026-05-27)


### Fehlerbehebungen

* **readings:** GPS-Bar der Lightbox im mobilen Hochformat reparieren ([#67](https://github.com/muelley86/zaehler/issues/67)) ([20a079a](https://github.com/muelley86/zaehler/commit/20a079adf3fbecbd7453e4779fc789e5aa8fc509))

## [2.14.0](https://github.com/muelley86/zaehler/compare/v2.13.0...v2.14.0) (2026-05-27)


### Funktionen

* **readings:** Galerie-Upload + Browser-Geolocation als GPS-Fallback ([#64](https://github.com/muelley86/zaehler/issues/64)) ([4e23007](https://github.com/muelley86/zaehler/commit/4e230076062d29dc56a9bb0f70e71eea9a8859a0))
* **ui:** App-Version im Sidebar-Footer ueber dem Profil anzeigen ([#65](https://github.com/muelley86/zaehler/issues/65)) ([922403a](https://github.com/muelley86/zaehler/commit/922403a6d5cd03ff66bffb52763154b01f0ce5e5))

## [2.13.0](https://github.com/muelley86/zaehler/compare/v2.12.1...v2.13.0) (2026-05-27)


### Funktionen

* **readings:** GPS aus Foto-EXIF + Karten-Link in der Lightbox ([#62](https://github.com/muelley86/zaehler/issues/62)) ([dfe3c0e](https://github.com/muelley86/zaehler/commit/dfe3c0e9db97f9ebcc3f926d16c6d1818b4b4fd2))

## [2.12.1](https://github.com/muelley86/zaehler/compare/v2.12.0...v2.12.1) (2026-05-27)


### Fehlerbehebungen

* **readings:** reading_at/delivery_at als UTC-ISO senden ([#60](https://github.com/muelley86/zaehler/issues/60)) ([54d66ad](https://github.com/muelley86/zaehler/commit/54d66adc8f33e40943d1a642e92cb0fcf68eb7eb))

## [2.12.0](https://github.com/muelley86/zaehler/compare/v2.11.3...v2.12.0) (2026-05-27)


### Funktionen

* **users:** Rolle aendern + Benutzer loeschen in der Admin-UI ([#56](https://github.com/muelley86/zaehler/issues/56)) ([4f8b7aa](https://github.com/muelley86/zaehler/commit/4f8b7aaa4bc35e38cbeaa22d315a39ecd0329a3d))


### Fehlerbehebungen

* **readings:** Foto-Upload 422 auf iOS Safari ([#58](https://github.com/muelley86/zaehler/issues/58)) ([0967e9f](https://github.com/muelley86/zaehler/commit/0967e9fee7b5ade76299416850b5e6a99e85063c))

## [2.11.3](https://github.com/muelley86/zaehler/compare/v2.11.2...v2.11.3) (2026-05-15)


### Fehlerbehebungen

* **security:** Timing-Attack, Future-Date, SW-Cache fuer Auth ([#54](https://github.com/muelley86/zaehler/issues/54)) ([28b879b](https://github.com/muelley86/zaehler/commit/28b879b19866792bb87c01891c4bd6ce2a1b6bc8))


### Refactoring

* **frontend:** Zentrale Admin-Verwaltung unter /admin/* ([#50](https://github.com/muelley86/zaehler/issues/50)) ([ed962bd](https://github.com/muelley86/zaehler/commit/ed962bdefde01b07ca7005cde0645c238055bcec))

## [2.11.2](https://github.com/muelley86/zaehler/compare/v2.11.1...v2.11.2) (2026-05-07)


### Performance

* **dashboard:** Atomares Card-Cutover, fixe Card-Hoehe gegen Inner-Shift ([6c831f8](https://github.com/muelley86/zaehler/commit/6c831f805e222809ac3ac6be1df0218317759bc0))
* **frontend:** [@fontsource](https://github.com/fontsource)-CSS-Imports streichen, fonts.css als alleinige Source ([bbd37c1](https://github.com/muelley86/zaehler/commit/bbd37c139b9ca31f66012e8acffc9bebc8f47188))

## [2.11.1](https://github.com/muelley86/zaehler/compare/v2.11.0...v2.11.1) (2026-05-07)


### Fehlerbehebungen

* **qr-druck:** Firefox rendert QR-Codes und loest Drucken-Button aus ([4f05184](https://github.com/muelley86/zaehler/commit/4f05184645e9518e17ff2d295094c6f9b850af60))
* **qr-druck:** Firefox-Kompatibilitaet ueber Inline-SVG-Embedding ([991d12a](https://github.com/muelley86/zaehler/commit/991d12af472127d3136c7f92b05857dea11d42cc))
* **qr-druck:** TS2322 unter noUncheckedIndexedAccess vermeiden ([29c2f1b](https://github.com/muelley86/zaehler/commit/29c2f1b33a0f1f810fe49624474502a76b625dec))
* **vite:** Font-Preload nur fuer woff2, nicht woff-Fallback ([8f4a8d5](https://github.com/muelley86/zaehler/commit/8f4a8d5acc850daf595d435f66c75bc19c7560e3))


### Performance

* **dashboard:** Skeleton statt Lade-Text fuer initialen Load ([168fda2](https://github.com/muelley86/zaehler/commit/168fda2b5345f1bc10e391ede0c0eacdd17071da))
* **frontend:** font-display: optional fuer alle Webfonts ([1fbb0e6](https://github.com/muelley86/zaehler/commit/1fbb0e6e4eb9e94161fb218a3fbe892d51552acf))
* **frontend:** Font-Preload-Plugin fuer Above-the-Fold-Weights ([05fb6fd](https://github.com/muelley86/zaehler/commit/05fb6fd17ca36712f9d1db6d114c21c39e5356fa))

## [2.11.0](https://github.com/muelley86/zaehler/compare/v2.10.0...v2.11.0) (2026-05-06)


### Funktionen

* **qr-druck:** /q/&lt;token&gt;-Shortpath + Druck-Buttons reanimiert ([0f879a4](https://github.com/muelley86/zaehler/commit/0f879a42601010ebced1fdeec1e9b7b0070de8e3))
* **qr-druck:** Avery-Etiketten ohne Beschriftung — nur QR ([4d08051](https://github.com/muelley86/zaehler/commit/4d0805101c5c365be18c3e1c36ef5fc5d0a84e97))
* **qr-druck:** Avery-Layouts + Bugfix weiße Seite beim Bulk-Druck ([b9f33fa](https://github.com/muelley86/zaehler/commit/b9f33fa887fe5a4bfa09f4c2ca58f8935d772d3c))


### Fehlerbehebungen

* **routing:** SPA-Fallback antwortet auf unbekannte /api/-Pfade mit 404 ([dba50e5](https://github.com/muelley86/zaehler/commit/dba50e5b5e324727b256ab22e04eb3a7938f23bf))

## [2.10.0](https://github.com/muelley86/zaehler/compare/v2.9.0...v2.10.0) (2026-05-06)


### Funktionen

* **backend:** Datenmodell für QR-Token-Verheiratung + can_assign-Flag ([332ca86](https://github.com/muelley86/zaehler/commit/332ca868f245098958339aeb6f5bbf368d8e56b7))
* **backend:** QR-Token-Endpoints + can_assign-Flag in User-API ([bfb30c6](https://github.com/muelley86/zaehler/commit/bfb30c6e55f543a8a0beb9956042f79625fe4499))
* **backend:** Service-Layer für QR-Tokens (Crockford-Base32, 8 Zeichen) ([49b14ab](https://github.com/muelley86/zaehler/commit/49b14ab21e1c8d808a87889c09e4883b147bdd02))
* **frontend:** Admin-Page /qr-codes mit Bulk-Create und Bulk-Druck ([4c8b957](https://github.com/muelley86/zaehler/commit/4c8b9573e5314b03fb0d4ecfb8d95124ef5adec3))
* **frontend:** QrCodeCard auf Token-Pfad umgebaut + can_assign-Switch ([cc229cd](https://github.com/muelley86/zaehler/commit/cc229cdb027a7efd5b172ffb9b3f80dfb8eedcd6))
* **frontend:** Scanner unterstützt Token-Pfad zusätzlich zu Legacy-MP ([e30436f](https://github.com/muelley86/zaehler/commit/e30436f9dc7b136a95118ffa1734287fe6836899))


### Fehlerbehebungen

* **migration:** can_assign_qr_tokens ohne batch_alter_table erzeugen ([8658f14](https://github.com/muelley86/zaehler/commit/8658f1439f0d5fd6ac51fa50904332b72c94eb27))


### Dokumentation

* QR-Token-Verheiratung und can_assign-Flag in CLAUDE.md ([2f14c47](https://github.com/muelley86/zaehler/commit/2f14c478ca67ec4e138543d7c42040525098673b))

## [2.9.0](https://github.com/muelley86/zaehler/compare/v2.8.3...v2.9.0) (2026-05-06)


### Funktionen

* **backend:** Datenmodell und Migration für Per-Recorder-MP-Zugriff ([a099796](https://github.com/muelley86/zaehler/commit/a099796a288c6385fd72aaee8bb0943775786567))
* **backend:** Read-Endpoints filtern + dump.json admin-only ([78f79fe](https://github.com/muelley86/zaehler/commit/78f79fec4369495d7ac2ac023e3e8207f74f0d63))
* **backend:** Service-Layer für MP-Zugriff (accessible_mp_ids, restrict_mp_query) ([336836a](https://github.com/muelley86/zaehler/commit/336836a9693209dc77d7643f758d3ba66364a6db))
* **backend:** Verwaltungs-Endpoints für MP-Zugriff ([8e286fc](https://github.com/muelley86/zaehler/commit/8e286fc8852f6abce89afd6cf1a342ef60f3d4af))
* **frontend:** MpAccessCard zeigt User mit MP-Zugriff (read-only) ([f4f81c6](https://github.com/muelley86/zaehler/commit/f4f81c6e0c8a33aa94027057f30b3e879a4afec7))
* **frontend:** UserAccessSheet für MP-Zugriffsverwaltung ([3964585](https://github.com/muelley86/zaehler/commit/396458545274d922cab1a400d58e11b90f6d241e))


### Dokumentation

* Per-Recorder MP-Zugriff in CLAUDE.md beschreiben ([b0cf81e](https://github.com/muelley86/zaehler/commit/b0cf81ef25195088e0bbd90c0309fd9f71737d6c))

## [2.8.3](https://github.com/muelley86/zaehler/compare/v2.8.2...v2.8.3) (2026-05-06)


### Fehlerbehebungen

* **scanner:** Permission-Spam, Scan-Navigation und Stream-Lifecycle ([68421ee](https://github.com/muelley86/zaehler/commit/68421eec8e1a2d846e904c6ade95c627b427f5ee))

## [2.8.2](https://github.com/muelley86/zaehler/compare/v2.8.1...v2.8.2) (2026-05-06)


### Fehlerbehebungen

* **test:** TS-Narrowing im QrScanSheet-Test umgehen ([ab84152](https://github.com/muelley86/zaehler/commit/ab84152bbdf408bbeeca6bedc733386fe1350592))

## [2.8.1](https://github.com/muelley86/zaehler/compare/v2.8.0...v2.8.1) (2026-05-06)


### Fehlerbehebungen

* **frontend:** pnpm-lock.yaml für html5-qrcode aktualisieren ([edd533c](https://github.com/muelley86/zaehler/commit/edd533c4278a40776c5b1b7cd33b0f9db5ba555f))

## [2.8.0](https://github.com/muelley86/zaehler/compare/v2.7.1...v2.8.0) (2026-05-06)


### Funktionen

* **backend:** QR-Code-Endpoint und Service für Messstellen ([217b625](https://github.com/muelley86/zaehler/commit/217b625c37195b27b71c9551c8f52e79f7cab239))
* **frontend:** QR-Code-Karte mit Druck auf Messstellen-Detail ([bab2113](https://github.com/muelley86/zaehler/commit/bab2113b654ce9ff82cb6c98b7bed26046723979))
* **frontend:** QR-Scan-Workflow in Erfassungsmaske ([8d5c16a](https://github.com/muelley86/zaehler/commit/8d5c16a048369946f9947b49c3c35c67945b843b))


### Fehlerbehebungen

* **format:** durchgehend deutsches Datumsformat DD.MM.YYYY ([1e19e86](https://github.com/muelley86/zaehler/commit/1e19e86ab88e7c86ff600f3ad5fbf00972c04423))


### Dokumentation

* optionalen QR-Scan-Workflow in CLAUDE.md beschreiben ([1f90fd7](https://github.com/muelley86/zaehler/commit/1f90fd7e02dcc61ead53c5f62ba1f66d8a8494be))

## [2.7.1](https://github.com/muelley86/zaehler/compare/v2.7.0...v2.7.1) (2026-05-06)


### Performance

* iOS-Layout, Eingabe-Performance, Asset-Compression & -Caching ([2d67d6e](https://github.com/muelley86/zaehler/commit/2d67d6e3bf8b64b713c95cf121ecd040ba28bbf3))
* Memo-Layer, Search-Debounce, Vendor-Chunks, Latin-Fonts, Slow-Query-Log ([797e850](https://github.com/muelley86/zaehler/commit/797e850cde010f92727b15676ad0defb006be46d))

## [2.7.0](https://github.com/muelley86/zaehler/compare/v2.6.3...v2.7.0) (2026-05-06)


### Funktionen

* **measuring-point:** Namen direkt auf der Detail-Seite umbenennen ([1ca1c45](https://github.com/muelley86/zaehler/commit/1ca1c45a30987b46943bd984a2c7d6a6a08fdf91))

## [2.6.3](https://github.com/muelley86/zaehler/compare/v2.6.2...v2.6.3) (2026-05-06)


### Fehlerbehebungen

* **audit:** UTC-Marker für Server-Zeitstempel + Lokalzeit-Anzeige ([9376786](https://github.com/muelley86/zaehler/commit/937678610d05297c6f8956e2aa65d29e3d8d9d18))

## [2.6.2](https://github.com/muelley86/zaehler/compare/v2.6.1...v2.6.2) (2026-05-05)


### Fehlerbehebungen

* **audit-1:** hohe Befunde aus AUDIT.md beheben (5/42) ([#28](https://github.com/muelley86/zaehler/issues/28)) ([65dd710](https://github.com/muelley86/zaehler/commit/65dd710846ea95ce386ed3ea21f8cad15da30f97))
* **audit-2:** mittlere Sicherheitsbefunde aus AUDIT.md beheben ([#30](https://github.com/muelley86/zaehler/issues/30)) ([df62fcf](https://github.com/muelley86/zaehler/commit/df62fcf1edc9f52b0c9d6666711794a61346601e))
* **audit-3:** Datenmodell-Befunde aus AUDIT.md beheben ([#31](https://github.com/muelley86/zaehler/issues/31)) ([d862c26](https://github.com/muelley86/zaehler/commit/d862c26814258cdea2d501b74cd21723f35f8ffb))
* **audit-4:** Performance-Befunde aus AUDIT.md beheben ([#32](https://github.com/muelley86/zaehler/issues/32)) ([e383781](https://github.com/muelley86/zaehler/commit/e38378195a596d7b9db28f52dca12424d7057a6b))
* **audit-5:** Polish-Befunde + Tests-Ausbau aus AUDIT.md ([#33](https://github.com/muelley86/zaehler/issues/33)) ([256dfe3](https://github.com/muelley86/zaehler/commit/256dfe337584e85960710fbc90228cc61194f72d))

## [2.6.1](https://github.com/muelley86/zaehler/compare/v2.6.0...v2.6.1) (2026-05-05)


### Fehlerbehebungen

* **heating:** Migration 0011 hat Uppercase-Werte nicht migriert ([#26](https://github.com/muelley86/zaehler/issues/26)) ([0ff70cb](https://github.com/muelley86/zaehler/commit/0ff70cb557e667265e4cf9291fc165d9834899a9))

## [2.6.0](https://github.com/muelley86/zaehler/compare/v2.5.1...v2.6.0) (2026-05-05)


### Funktionen

* **lxc:** CLI-Symlink + READMEs Anfänger-tauglich machen ([#24](https://github.com/muelley86/zaehler/issues/24)) ([a294608](https://github.com/muelley86/zaehler/commit/a294608bce64a6a4e1b6dfbd7326fa569b5d16a6))

## [2.5.1](https://github.com/muelley86/zaehler/compare/v2.5.0...v2.5.1) (2026-05-05)


### Dokumentation

* **lxc:** Bootstrap-Anleitung für Container vor v2.3.0 ([#22](https://github.com/muelley86/zaehler/issues/22)) ([a1a54ad](https://github.com/muelley86/zaehler/commit/a1a54adb8d2d6f9978fcbc572725beea48467f88))

## [2.5.0](https://github.com/muelley86/zaehler/compare/v2.4.0...v2.5.0) (2026-05-05)


### Funktionen

* **heating:** modulare Wärme-Messstellen mit Energieträger und freier Register-Liste ([#18](https://github.com/muelley86/zaehler/issues/18)) ([e4e1eb3](https://github.com/muelley86/zaehler/commit/e4e1eb3de2fdf8fe9f5fdb7b314a8dbd99de5bd4))
* **heating:** TypePicker-Wizard und Register-Editor für Wärme-Messstellen ([#20](https://github.com/muelley86/zaehler/issues/20)) ([2548c63](https://github.com/muelley86/zaehler/commit/2548c63023cbf7917acba74eff0323e33c208c64))
* **record:** Erfassen-Page MP-zentriert mit allen Registern gleichzeitig ([#21](https://github.com/muelley86/zaehler/issues/21)) ([9fc56d9](https://github.com/muelley86/zaehler/commit/9fc56d97e05c2467d9aca7b2bdf917c0fb86a36f))

## [2.4.0](https://github.com/muelley86/zaehler/compare/v2.3.1...v2.4.0) (2026-05-05)


### Funktionen

* **deliveries:** Zeitstempel statt nur Datum ([#16](https://github.com/muelley86/zaehler/issues/16)) ([7c4c156](https://github.com/muelley86/zaehler/commit/7c4c156dd8af29e2fe96340ef1b8c9949e9ccb8b))

## [2.3.1](https://github.com/muelley86/zaehler/compare/v2.3.0...v2.3.1) (2026-05-04)


### Fehlerbehebungen

* **csp:** Esri-Tile-Server in img-src/connect-src whitelisten ([#14](https://github.com/muelley86/zaehler/issues/14)) ([a33d224](https://github.com/muelley86/zaehler/commit/a33d224a342b90de1d684228a3953f779a158eb5))

## [2.3.0](https://github.com/muelley86/zaehler/compare/v2.2.0...v2.3.0) (2026-05-04)


### Funktionen

* **dashboard:** Wandlerfaktor in MP-Card sichtbar machen ([#10](https://github.com/muelley86/zaehler/issues/10)) ([bc40330](https://github.com/muelley86/zaehler/commit/bc40330f81e185bc8583e7ba22a3d8db0be9026f))
* **locations:** Kartendienst beim Öffnen auswählbar ([#12](https://github.com/muelley86/zaehler/issues/12)) ([8f22e83](https://github.com/muelley86/zaehler/commit/8f22e83c346fd2976e4c91e84bed58f425c60aae))
* **map:** Layer-Switcher Karte / Satellit / Hybrid ([#13](https://github.com/muelley86/zaehler/issues/13)) ([ed9eae8](https://github.com/muelley86/zaehler/commit/ed9eae85d709e7fd02e48e233b42e272eb25b0b2))

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
