# Changelog

Alle nennenswerten Änderungen an der Zählerstand-App. Format folgt
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/) und
[Semantic Versioning](https://semver.org/lang/de/).

Ab v1.0.0 wird dieses File **automatisch** von
[release-please](https://github.com/googleapis/release-please) aus
[Conventional-Commits](https://www.conventionalcommits.org/de/v1.0.0/)
generiert. Manuelle Einträge bitte oberhalb der nächsten Tag-Zeile
ergänzen, sonst werden sie beim nächsten Lauf überschrieben.

## [2.62.1](https://github.com/muelley86/zaehler/compare/v2.62.0...v2.62.1) (2026-06-15)


### Refactoring

* **admin:** kompakte Stammdaten-Listen + Suche ([#276](https://github.com/muelley86/zaehler/issues/276)) ([4295312](https://github.com/muelley86/zaehler/commit/42953121eae60911309d9d11e01cdbbb397005e7))

## [2.62.0](https://github.com/muelley86/zaehler/compare/v2.61.0...v2.62.0) (2026-06-15)


### Funktionen

* **mieter:** Vorname/Nachname statt einem Namensfeld ([#273](https://github.com/muelley86/zaehler/issues/273)) ([7cd0f0d](https://github.com/muelley86/zaehler/commit/7cd0f0da40763c3d1c5a689bbdb80418da23210c))

## [2.61.0](https://github.com/muelley86/zaehler/compare/v2.60.1...v2.61.0) (2026-06-15)


### Funktionen

* **mieter:** Mieter-Stammdaten mit optionaler periodisierter MP-Zuordnung ([#271](https://github.com/muelley86/zaehler/issues/271)) ([b93fdcf](https://github.com/muelley86/zaehler/commit/b93fdcf00561354e265fb1c3eab68025e8a23503))

## [2.60.1](https://github.com/muelley86/zaehler/compare/v2.60.0...v2.60.1) (2026-06-12)


### Fehlerbehebungen

* **suppliers:** Handshake-Icon statt Lieferwagen und Lieferant-Filter immer sichtbar ([#269](https://github.com/muelley86/zaehler/issues/269)) ([af728b3](https://github.com/muelley86/zaehler/commit/af728b32184672f79f3a51cc974b64ca49956464))

## [2.60.0](https://github.com/muelley86/zaehler/compare/v2.59.1...v2.60.0) (2026-06-12)


### Funktionen

* **suppliers:** Lieferanten-Stammdaten, periodisierte MP-Zuordnung und neue Messstellen-Filter ([#267](https://github.com/muelley86/zaehler/issues/267)) ([5c709b5](https://github.com/muelley86/zaehler/commit/5c709b5d4e11e04650bd1dc23b876b2c76135585))

## [2.59.1](https://github.com/muelley86/zaehler/compare/v2.59.0...v2.59.1) (2026-06-12)


### Fehlerbehebungen

* **virtual-mps:** Zurueck-Link der Detail-Seite fuehrt zur Verrechnungs-Uebersicht ([#265](https://github.com/muelley86/zaehler/issues/265)) ([3bb35cf](https://github.com/muelley86/zaehler/commit/3bb35cffb60d5cb9c670ba4ac2e4c21a7608ab21))

## [2.59.0](https://github.com/muelley86/zaehler/compare/v2.58.1...v2.59.0) (2026-06-12)


### Funktionen

* **virtual-mps:** Detail-Seite mit Komponenten-Werten und Filter-Badge in den Auswertungen ([#263](https://github.com/muelley86/zaehler/issues/263)) ([04652ff](https://github.com/muelley86/zaehler/commit/04652ff1f3e2e63a4ceeca3a0ef049846363ae56))

## [2.58.1](https://github.com/muelley86/zaehler/compare/v2.58.0...v2.58.1) (2026-06-12)


### Fehlerbehebungen

* **virtual-mps:** Bezug-Label in der Komponenten-Liste und exklusiver Dashboard-Filter ([#261](https://github.com/muelley86/zaehler/issues/261)) ([8a2abc8](https://github.com/muelley86/zaehler/commit/8a2abc820b87124d24b683e3ccae12f69d77f785))

## [2.58.0](https://github.com/muelley86/zaehler/compare/v2.57.0...v2.58.0) (2026-06-11)


### Funktionen

* **virtual-mps:** Admin-UI, Dashboard-Kurve und Auswertungs-Zeilen für verrechnete Messstellen ([#259](https://github.com/muelley86/zaehler/issues/259)) ([5e2db79](https://github.com/muelley86/zaehler/commit/5e2db794ade35e83e710200d68cfd665b60cc9c5))
* **virtual-mps:** Backend für verrechnete Messstellen (+/− Komponenten) ([#258](https://github.com/muelley86/zaehler/issues/258)) ([8f97850](https://github.com/muelley86/zaehler/commit/8f9785067ef8eab97923218e9a0fd933bb182674))

## [2.57.0](https://github.com/muelley86/zaehler/compare/v2.56.1...v2.57.0) (2026-06-11)


### Funktionen

* **owners:** Eigentümer-Historie für Admins editierbar (Perioden anlegen/bearbeiten/löschen) ([#256](https://github.com/muelley86/zaehler/issues/256)) ([062aeb5](https://github.com/muelley86/zaehler/commit/062aeb53a0a5ed0f458e2c2cfb274c86ef14e725))

## [2.56.1](https://github.com/muelley86/zaehler/compare/v2.56.0...v2.56.1) (2026-06-11)


### Fehlerbehebungen

* **reports:** Richtung (Bezug/Einspeisung) bei bidirektionalen Zählern in jeder Zeile anzeigen ([#254](https://github.com/muelley86/zaehler/issues/254)) ([7be6c53](https://github.com/muelley86/zaehler/commit/7be6c53d975990c7b6a8a8bd8188b4f98b25e6c2))

## [2.56.0](https://github.com/muelley86/zaehler/compare/v2.55.2...v2.56.0) (2026-06-11)


### Funktionen

* **backup:** Voll-Backup als ZIP inkl. Fotos + GUI-Restore mit Rollback ([#252](https://github.com/muelley86/zaehler/issues/252)) ([66dcbd8](https://github.com/muelley86/zaehler/commit/66dcbd8bdb597c1e3f2e5e21ca0c5b9813994996))

## [2.55.2](https://github.com/muelley86/zaehler/compare/v2.55.1...v2.55.2) (2026-06-11)


### Fehlerbehebungen

* **reports:** importierte Historien in den Auswertungen sichtbar machen ([#250](https://github.com/muelley86/zaehler/issues/250)) ([f1c8d6d](https://github.com/muelley86/zaehler/commit/f1c8d6dc81f0233072a8125969a47021fce6512c))

## [2.55.1](https://github.com/muelley86/zaehler/compare/v2.55.0...v2.55.1) (2026-06-08)


### Fehlerbehebungen

* **reports:** Periode_von/bis im Gesamt-CSV aus gewähltem Zeitraum füllen ([#248](https://github.com/muelley86/zaehler/issues/248)) ([28f227e](https://github.com/muelley86/zaehler/commit/28f227e3d9605aff4079afb61ff73b08c87038c3))

## [2.55.0](https://github.com/muelley86/zaehler/compare/v2.54.2...v2.55.0) (2026-06-07)


### Funktionen

* **reports:** Messstellen-ID (group_key) in Auswertungen-CSV ([#247](https://github.com/muelley86/zaehler/issues/247)) ([4670554](https://github.com/muelley86/zaehler/commit/4670554e82d5569703fda6272a3021db0d8876b5))


### Dokumentation

* Security-Audit 2026-06-04 + Remediation-Nachtrag ([#245](https://github.com/muelley86/zaehler/issues/245)) ([99e070d](https://github.com/muelley86/zaehler/commit/99e070d57b29c145bb1d70dc1367213c40141722))

## [2.54.2](https://github.com/muelley86/zaehler/compare/v2.54.1...v2.54.2) (2026-06-04)


### Fehlerbehebungen

* **deps:** pnpm-Overrides entfernen, react-router-dom 6.30.4 (LXC-Deploy reparieren) ([#242](https://github.com/muelley86/zaehler/issues/242)) ([6c91a9a](https://github.com/muelley86/zaehler/commit/6c91a9a65bd9399ee8e7e13777fb77f9fc2e376d))

## [2.54.1](https://github.com/muelley86/zaehler/compare/v2.54.0...v2.54.1) (2026-06-04)


### Fehlerbehebungen

* **deps:** patchbare Frontend-CVEs via pnpm-Overrides (5 von 8) ([#241](https://github.com/muelley86/zaehler/issues/241)) ([a0236ee](https://github.com/muelley86/zaehler/commit/a0236eedbb48350e6d5a3c57cbc4f3864887ce94))
* **deps:** starlette 1.0.1 + idna 3.18 (Backend-CVEs) ([#240](https://github.com/muelley86/zaehler/issues/240)) ([a5d8dca](https://github.com/muelley86/zaehler/commit/a5d8dcaa0159754c5be19a495abccf60e7171881))


### Dokumentation

* **deploy:** relabel-register-unit-Aufruf im LXC-Runbook dokumentieren ([#237](https://github.com/muelley86/zaehler/issues/237)) ([6998395](https://github.com/muelley86/zaehler/commit/6998395302f4037656453079812494056f6046a5))

## [2.54.0](https://github.com/muelley86/zaehler/compare/v2.53.4...v2.54.0) (2026-06-04)


### Funktionen

* **dashboard:** Vergleichs-Chart statt Karten je Messstelle ([#235](https://github.com/muelley86/zaehler/issues/235)) ([ebf7b5c](https://github.com/muelley86/zaehler/commit/ebf7b5c147ac50b955ce98256f233f87881ce069))

## [2.53.4](https://github.com/muelley86/zaehler/compare/v2.53.3...v2.53.4) (2026-06-04)


### Fehlerbehebungen

* Messstellen-Detail - Datumsfilter wirkt auf Verbrauchskurve + Register-Zeile öffnet Messungen ([#233](https://github.com/muelley86/zaehler/issues/233)) ([5b4ab2d](https://github.com/muelley86/zaehler/commit/5b4ab2d1604386bd01c55430463d6c1f0dc60732))

## [2.53.3](https://github.com/muelley86/zaehler/compare/v2.53.2...v2.53.3) (2026-06-04)


### Fehlerbehebungen

* **filters:** Filter merken auch für Verwaltung ▸ Standorte & Benutzer ([#231](https://github.com/muelley86/zaehler/issues/231)) ([f5c9872](https://github.com/muelley86/zaehler/commit/f5c9872f4c5b5eda26144cffc4e7eae3c7041119))

## [2.53.2](https://github.com/muelley86/zaehler/compare/v2.53.1...v2.53.2) (2026-06-04)


### Fehlerbehebungen

* **filters:** Typ-Filter auf Verwaltung ▸ Messstellen merken ([#229](https://github.com/muelley86/zaehler/issues/229)) ([693069e](https://github.com/muelley86/zaehler/commit/693069ed416ef262d261978c96746d735fb0d11c))

## [2.53.1](https://github.com/muelley86/zaehler/compare/v2.53.0...v2.53.1) (2026-06-04)


### Fehlerbehebungen

* **filters:** kompakte Datums-Anzeige (immer Daten, YY) + Datum zurücksetzen ([#227](https://github.com/muelley86/zaehler/issues/227)) ([76eaf3a](https://github.com/muelley86/zaehler/commit/76eaf3a13dddaddfa40501fb773653aa7d970ac2))

## [2.53.0](https://github.com/muelley86/zaehler/compare/v2.52.0...v2.53.0) (2026-06-04)


### Funktionen

* **filters:** globaler Datumsbereich in der Navigation + Jahres-Schnellwechsel ([#225](https://github.com/muelley86/zaehler/issues/225)) ([7c38275](https://github.com/muelley86/zaehler/commit/7c3827563ccad31df6ac1645508635667a06e053))

## [2.52.0](https://github.com/muelley86/zaehler/compare/v2.51.0...v2.52.0) (2026-06-04)


### Funktionen

* **filters:** Filter-Memory pro Session + Reset-Button ([#221](https://github.com/muelley86/zaehler/issues/221)) ([ac17ec4](https://github.com/muelley86/zaehler/commit/ac17ec4b91cd0a2e4e6d85f45ad23abc6a3ee20f))
* **reports:** Auswertungs-Filter pro Session merken ([#224](https://github.com/muelley86/zaehler/issues/224)) ([0e60f98](https://github.com/muelley86/zaehler/commit/0e60f98879a158e1f0841d9cf18f34c2fa43edd6))

## [2.51.0](https://github.com/muelley86/zaehler/compare/v2.50.0...v2.51.0) (2026-06-03)


### Funktionen

* **export:** Voll-Backup der SQLite-DB als Download (admin-only) ([#218](https://github.com/muelley86/zaehler/issues/218)) ([6acee78](https://github.com/muelley86/zaehler/commit/6acee7873a1f9634da42e7e81d41dfc3653d3511))


### Performance

* **dashboard:** Sammel-Endpoint statt Per-MP-Fan-out (1 Request statt ~150) ([#220](https://github.com/muelley86/zaehler/issues/220)) ([d7840f9](https://github.com/muelley86/zaehler/commit/d7840f9587899e3a76c73cc3b7169124420d44a9))

## [2.50.0](https://github.com/muelley86/zaehler/compare/v2.49.0...v2.50.0) (2026-06-03)


### Funktionen

* **readings:** Erfassungen serverseitig paginiert/gefiltert über /entries ([#216](https://github.com/muelley86/zaehler/issues/216)) ([802e570](https://github.com/muelley86/zaehler/commit/802e570be152271205d93a61cdee5ef66aea4902))

## [2.49.0](https://github.com/muelley86/zaehler/compare/v2.48.0...v2.49.0) (2026-06-03)


### Funktionen

* **entries:** serverseitiger Entries-Endpoint für Erfassungs-Pagination ([#214](https://github.com/muelley86/zaehler/issues/214)) ([93b0159](https://github.com/muelley86/zaehler/commit/93b01595919b50d726b3ceb1ce17704fb316c1a3))

## [2.48.0](https://github.com/muelley86/zaehler/compare/v2.47.0...v2.48.0) (2026-06-03)


### Funktionen

* **cli:** relabel-register-unit zum Umbenennen der Register-Einheit ([#212](https://github.com/muelley86/zaehler/issues/212)) ([280a421](https://github.com/muelley86/zaehler/commit/280a421fe2d499d35120ef011abb11bf558083de))

## [2.47.0](https://github.com/muelley86/zaehler/compare/v2.46.0...v2.47.0) (2026-06-03)


### Funktionen

* **readings:** Erfassungen standardmäßig auf die letzten 50 begrenzen ([#210](https://github.com/muelley86/zaehler/issues/210)) ([5d4a25c](https://github.com/muelley86/zaehler/commit/5d4a25cae98cdd885aa0c22538c394adf8818da9))

## [2.46.0](https://github.com/muelley86/zaehler/compare/v2.45.0...v2.46.0) (2026-06-03)


### Funktionen

* **reports:** Auswertungen-Filter als einheitliche Dropdowns ([#208](https://github.com/muelley86/zaehler/issues/208)) ([4532ab2](https://github.com/muelley86/zaehler/commit/4532ab2dfeffd7c4eb6fab538289ed4ded7b4052))

## [2.45.0](https://github.com/muelley86/zaehler/compare/v2.44.0...v2.45.0) (2026-06-03)


### Funktionen

* **readings:** suchbare Messstellen-Auswahl beim Erfassen ([#206](https://github.com/muelley86/zaehler/issues/206)) ([6e5c0ee](https://github.com/muelley86/zaehler/commit/6e5c0eef3ef5f6c8d3f2a198eb6448f105d7c4d2))

## [2.44.0](https://github.com/muelley86/zaehler/compare/v2.43.1...v2.44.0) (2026-06-03)


### Funktionen

* **dashboard:** Filter als einheitliche Dropdowns statt Pill-Reihen ([#204](https://github.com/muelley86/zaehler/issues/204)) ([f8a7655](https://github.com/muelley86/zaehler/commit/f8a76556cb7d74d98b4114aec9e9cd476e0be823))

## [2.43.1](https://github.com/muelley86/zaehler/compare/v2.43.0...v2.43.1) (2026-06-03)


### Fehlerbehebungen

* **filters:** Dropdown-Panel per Portal rendern (nicht mehr abgeschnitten) ([#202](https://github.com/muelley86/zaehler/issues/202)) ([ebb4eb2](https://github.com/muelley86/zaehler/commit/ebb4eb2b5a435816a4ecff82af11504e6953942a))

## [2.43.0](https://github.com/muelley86/zaehler/compare/v2.42.0...v2.43.0) (2026-06-03)


### Funktionen

* **filters:** einheitliche, zugeklappte Filter-Dropdowns überall ([#200](https://github.com/muelley86/zaehler/issues/200)) ([8187353](https://github.com/muelley86/zaehler/commit/8187353e83a8873557794657faeb188568ff5295))

## [2.42.0](https://github.com/muelley86/zaehler/compare/v2.41.0...v2.42.0) (2026-06-03)


### Funktionen

* **locations:** Filter nach Hauptstandort in der Zählerstandorte-Liste ([#198](https://github.com/muelley86/zaehler/issues/198)) ([6e079a0](https://github.com/muelley86/zaehler/commit/6e079a0afb5ccce79e651eff0bdece247794de1a))

## [2.41.0](https://github.com/muelley86/zaehler/compare/v2.40.0...v2.41.0) (2026-06-03)


### Funktionen

* **measuring-points:** Filter nach Messstellen-Typ in der Admin-Liste ([#196](https://github.com/muelley86/zaehler/issues/196)) ([08d9682](https://github.com/muelley86/zaehler/commit/08d96826b791c259c01194fd9e12594c2c5eeb66))

## [2.40.0](https://github.com/muelley86/zaehler/compare/v2.39.1...v2.40.0) (2026-06-03)


### Funktionen

* **readings:** Mehrfach-Auswahl zum Sammel-Löschen von Erfassungen ([#195](https://github.com/muelley86/zaehler/issues/195)) ([3b46191](https://github.com/muelley86/zaehler/commit/3b46191ad78eebd071a509aa6cfba196052d920f))


### Dokumentation

* CLAUDE.md um Import, Mehrfach-Fotos, DE-CSV und Metering ergänzen ([#189](https://github.com/muelley86/zaehler/issues/189)) ([650f869](https://github.com/muelley86/zaehler/commit/650f869f8c417dfcedb7d36737af02b1f45e7830))

## [2.39.1](https://github.com/muelley86/zaehler/compare/v2.39.0...v2.39.1) (2026-06-02)


### Fehlerbehebungen

* **cli:** repair-midnight/-legacy-timestamps berechnen monthly_consumption neu ([#191](https://github.com/muelley86/zaehler/issues/191)) ([ff56ab5](https://github.com/muelley86/zaehler/commit/ff56ab5ef2766600c401ebc38121787ffdd5169c))
* **deploy:** monthly_consumption-Backfill in upgrade-app + recompute-monthly-Wrapper ([#192](https://github.com/muelley86/zaehler/issues/192)) ([25a5cd8](https://github.com/muelley86/zaehler/commit/25a5cd8a4c77ffd8774497aaa74b842f11c1dd52))
* **export:** dump.json serialisiert Standort als Name statt ORM-Objekt ([#190](https://github.com/muelley86/zaehler/issues/190)) ([3a209b5](https://github.com/muelley86/zaehler/commit/3a209b5a8882e3f63329efc9b3e9b065c9ae13ac))

## [2.39.0](https://github.com/muelley86/zaehler/compare/v2.38.0...v2.39.0) (2026-06-02)


### Funktionen

* **consumption:** Cache-Invalidierung für monthly_consumption (B2b) ([#186](https://github.com/muelley86/zaehler/issues/186)) ([ac4f12a](https://github.com/muelley86/zaehler/commit/ac4f12a8852383a8301c92a40694f3b1821dc24f))
* **consumption:** Monats-Lese-Pfade auf monthly_consumption umstellen (B2c) ([#188](https://github.com/muelley86/zaehler/issues/188)) ([c28a1fb](https://github.com/muelley86/zaehler/commit/c28a1fb39d26cd4dd0aa5a185f1514763e0132b9))

## [2.38.0](https://github.com/muelley86/zaehler/compare/v2.37.0...v2.38.0) (2026-06-02)


### Funktionen

* **consumption:** materialisierte monthly_consumption-Tabelle + Recompute ([#183](https://github.com/muelley86/zaehler/issues/183)) ([05bc914](https://github.com/muelley86/zaehler/commit/05bc9140be57c56007fc99c105b0b1e2a161067d))


### Fehlerbehebungen

* **readings:** historische Monatswerte auf Monatsende 23:59:59 statt 12:00 ([#184](https://github.com/muelley86/zaehler/issues/184)) ([8de9972](https://github.com/muelley86/zaehler/commit/8de9972a7ea9b88dc860fd6e29eb06ab4ccd37d0))

## [2.37.0](https://github.com/muelley86/zaehler/compare/v2.36.0...v2.37.0) (2026-06-02)


### Funktionen

* **consumption:** Verbrauch über Monatsgrenzen taggenau interpolieren ([#180](https://github.com/muelley86/zaehler/issues/180)) ([b447a40](https://github.com/muelley86/zaehler/commit/b447a40c6061c1e19ecf2c0cdf6ee893e19dda07))
* **readings:** Umschalter "Aktueller Stand" / "Historischer Monatswert" ([#182](https://github.com/muelley86/zaehler/issues/182)) ([f5aaa28](https://github.com/muelley86/zaehler/commit/f5aaa28c46f4c25ab3f378ac265106c9c597c750))

## [2.36.0](https://github.com/muelley86/zaehler/compare/v2.35.1...v2.36.0) (2026-06-02)


### Funktionen

* **import:** Zählerstand-Import aus Excel/CSV (Endpoints + Admin-UI) ([#177](https://github.com/muelley86/zaehler/issues/177)) ([3c03226](https://github.com/muelley86/zaehler/commit/3c03226020ee1789eeb6ee527fea27fd8bf9dc42))
* **readings:** bis zu 6 Fotos je Erfassung ([#179](https://github.com/muelley86/zaehler/issues/179)) ([7da5ab1](https://github.com/muelley86/zaehler/commit/7da5ab1c43c0190dd7ca0fd2ab178ba7a9a577b8))

## [2.35.1](https://github.com/muelley86/zaehler/compare/v2.35.0...v2.35.1) (2026-06-02)


### Fehlerbehebungen

* **measuring-points:** Tankvolumen/Nachfüllen bei Fernwärme ausblenden ([#175](https://github.com/muelley86/zaehler/issues/175)) ([232c4ab](https://github.com/muelley86/zaehler/commit/232c4ab83ce90a1d0203f2e6dd16be45f8c9922b))

## [2.35.0](https://github.com/muelley86/zaehler/compare/v2.34.4...v2.35.0) (2026-06-02)


### Funktionen

* **ui:** Wasser-/Heizung-Badge mit Tropfen- bzw. Thermometer-Icon ([#173](https://github.com/muelley86/zaehler/issues/173)) ([3605178](https://github.com/muelley86/zaehler/commit/36051784e823d9f295c8dd3d770305daa2887969))

## [2.34.4](https://github.com/muelley86/zaehler/compare/v2.34.3...v2.34.4) (2026-06-02)


### Fehlerbehebungen

* **export:** CSV-Formel-Injection in Backend-Exporten verhindern ([#171](https://github.com/muelley86/zaehler/issues/171)) ([cc511e8](https://github.com/muelley86/zaehler/commit/cc511e81706b35d28bb0e024d893e2ead04cb6ac))

## [2.34.3](https://github.com/muelley86/zaehler/compare/v2.34.2...v2.34.3) (2026-06-02)


### Fehlerbehebungen

* **export:** deutsches Excel-CSV (Semikolon, Komma-Dezimal, UTF-8-BOM) ([#169](https://github.com/muelley86/zaehler/issues/169)) ([ced670a](https://github.com/muelley86/zaehler/commit/ced670adebf87c9123a6b7d1170464760f4be5b2))

## [2.34.2](https://github.com/muelley86/zaehler/compare/v2.34.1...v2.34.2) (2026-06-02)


### Fehlerbehebungen

* **reports:** CSV-Export für Dimension "Messstelle" (fehlendes Label) ([#167](https://github.com/muelley86/zaehler/issues/167)) ([3a87158](https://github.com/muelley86/zaehler/commit/3a8715806009f69924b2f1cd8e8451a5b59e36a6))

## [2.34.1](https://github.com/muelley86/zaehler/compare/v2.34.0...v2.34.1) (2026-06-01)


### Fehlerbehebungen

* **deploy:** zaehler-Wrapper für repair-midnight-readings/-legacy-timestamps ([#165](https://github.com/muelley86/zaehler/issues/165)) ([6f26831](https://github.com/muelley86/zaehler/commit/6f26831f818797bfb8a42ed9a17eac4ba820d977))

## [2.34.0](https://github.com/muelley86/zaehler/compare/v2.33.1...v2.34.0) (2026-06-01)


### Funktionen

* **readings:** 00:00-Erfassungen an Periodengrenze auf Vortag 23:59:59 normalisieren ([#163](https://github.com/muelley86/zaehler/issues/163)) ([d23259e](https://github.com/muelley86/zaehler/commit/d23259e5d216fda66a6d141dfe21e6d0ffa0ef6f))

## [2.33.1](https://github.com/muelley86/zaehler/compare/v2.33.0...v2.33.1) (2026-06-01)


### Fehlerbehebungen

* **deploy:** Container-Zeitzone idempotent setzen (upgrade-app self-heal + set-timezone) ([#161](https://github.com/muelley86/zaehler/issues/161)) ([eb12544](https://github.com/muelley86/zaehler/commit/eb12544f1558ecb379e2d32e74ddea477b09cf23))

## [2.33.0](https://github.com/muelley86/zaehler/compare/v2.32.0...v2.33.0) (2026-06-01)


### Funktionen

* **reports:** Dimension "Messstelle" — Verbrauch je Zähler im Zeitraum ([#159](https://github.com/muelley86/zaehler/issues/159)) ([a7636d6](https://github.com/muelley86/zaehler/commit/a7636d69e3d93e384b3881e762a1334d0a29eca1))

## [2.32.0](https://github.com/muelley86/zaehler/compare/v2.31.0...v2.32.0) (2026-06-01)


### Funktionen

* **reports:** Auswertungen-Seite mit Vergleich und CSV-Export ([#156](https://github.com/muelley86/zaehler/issues/156)) ([5228906](https://github.com/muelley86/zaehler/commit/522890699d76e32f53b4e0af3a472ba4077156eb))
* **reports:** geteilte Auswertungs-Konfigurationen persistieren ([#158](https://github.com/muelley86/zaehler/issues/158)) ([8163730](https://github.com/muelley86/zaehler/commit/8163730c71f370e30f8400c3790f8f93c7f6284e))
* **reports:** messstellen-übergreifender Aggregations-Endpoint + CSV ([#154](https://github.com/muelley86/zaehler/issues/154)) ([bd71327](https://github.com/muelley86/zaehler/commit/bd71327e1d1505808992938f7f0b073bf05bc1f3))

## [2.31.0](https://github.com/muelley86/zaehler/compare/v2.30.2...v2.31.0) (2026-06-01)


### Funktionen

* **cli:** repair-legacy-timestamps — Altdaten-Korrektur (Dry-Run-Default) ([#152](https://github.com/muelley86/zaehler/issues/152)) ([a5cca1a](https://github.com/muelley86/zaehler/commit/a5cca1a91a2f0a009574df09ca021973bbd0cdaa))

## [2.30.2](https://github.com/muelley86/zaehler/compare/v2.30.1...v2.30.2) (2026-06-01)


### Fehlerbehebungen

* **timezone:** Datums-Gruppierung lokal in Liste, Charts und Verbrauchsperioden ([#150](https://github.com/muelley86/zaehler/issues/150)) ([5a9e37f](https://github.com/muelley86/zaehler/commit/5a9e37fdc7c3fe2af0f22e8c6de19334a50b1406))

## [2.30.1](https://github.com/muelley86/zaehler/compare/v2.30.0...v2.30.1) (2026-06-01)


### Fehlerbehebungen

* **dashboard:** Bestandskorrektur sendet reading_at als UTC ([#146](https://github.com/muelley86/zaehler/issues/146)) ([6ad0fe4](https://github.com/muelley86/zaehler/commit/6ad0fe40f942faa399348929b927f16706e4e6ab))
* **meters:** Datum-Erfassungen in lokaler Zeitzone speichern ([#148](https://github.com/muelley86/zaehler/issues/148)) ([2a03534](https://github.com/muelley86/zaehler/commit/2a035348273f737cacd769796062d6c142a18a8f))

## [2.30.0](https://github.com/muelley86/zaehler/compare/v2.29.0...v2.30.0) (2026-06-01)


### Funktionen

* **measuring-points:** Stammdatenfeld Kostenstelle (+ Export) ([#143](https://github.com/muelley86/zaehler/issues/143)) ([53c1974](https://github.com/muelley86/zaehler/commit/53c1974a6e1b824213616249665fcbd1febc351c))
* **nav:** Auswertungen-Menuepunkt + Platzhalterseite ([#144](https://github.com/muelley86/zaehler/issues/144)) ([88474b2](https://github.com/muelley86/zaehler/commit/88474b2b83fb73c6362b045f2a0ca1ad8e659088))

## [2.29.0](https://github.com/muelley86/zaehler/compare/v2.28.0...v2.29.0) (2026-06-01)


### Funktionen

* **dashboard:** Verbrauch/Produktion als prominente Kachel, Zaehlerstaende dezenter ([#141](https://github.com/muelley86/zaehler/issues/141)) ([40cdc67](https://github.com/muelley86/zaehler/commit/40cdc67dfd2ae4e1f931e21b6c54b18643689e37))

## [2.28.0](https://github.com/muelley86/zaehler/compare/v2.27.4...v2.28.0) (2026-06-01)


### Funktionen

* **dashboard:** Diagrammtyp-/Granularitaets-Auswahl + Backend-Aggregation ([#138](https://github.com/muelley86/zaehler/issues/138)) ([28de5f0](https://github.com/muelley86/zaehler/commit/28de5f0702a716f1f0b869b64469c99cc17a8f84))

## [2.27.4](https://github.com/muelley86/zaehler/compare/v2.27.3...v2.27.4) (2026-05-29)


### Fehlerbehebungen

* **deploy:** configure als kleine gruppierte Menues ([#136](https://github.com/muelley86/zaehler/issues/136)) ([23fd39a](https://github.com/muelley86/zaehler/commit/23fd39a46c20a6bf28437a8991561f88f2a7756b))

## [2.27.3](https://github.com/muelley86/zaehler/compare/v2.27.2...v2.27.3) (2026-05-29)


### Fehlerbehebungen

* **deploy:** configure-Menue zeigt jetzt die Eintraege (feste Groesse + Marge 12) ([#134](https://github.com/muelley86/zaehler/issues/134)) ([f4169ed](https://github.com/muelley86/zaehler/commit/f4169ed64ae3fb415e85cc15e5f889d6548192a0))

## [2.27.2](https://github.com/muelley86/zaehler/compare/v2.27.1...v2.27.2) (2026-05-29)


### Fehlerbehebungen

* **deploy:** configure-Menue erschien nicht (whiptail-Hoehe zu klein) ([#132](https://github.com/muelley86/zaehler/issues/132)) ([867a1a2](https://github.com/muelley86/zaehler/commit/867a1a26668738dc667ab957733b63c060c7554a))

## [2.27.1](https://github.com/muelley86/zaehler/compare/v2.27.0...v2.27.1) (2026-05-29)


### Fehlerbehebungen

* **deploy:** zaehler configure bricht unter set -euo pipefail still ab ([#130](https://github.com/muelley86/zaehler/issues/130)) ([3d0d30b](https://github.com/muelley86/zaehler/commit/3d0d30bcd1705e39a05dd0c7aa1c944ba0c72542))

## [2.27.0](https://github.com/muelley86/zaehler/compare/v2.26.0...v2.27.0) (2026-05-29)


### Funktionen

* **deploy:** gefuehrter meters.env-Editor (zaehler configure) ([#128](https://github.com/muelley86/zaehler/issues/128)) ([6262fc3](https://github.com/muelley86/zaehler/commit/6262fc3c3df0eb693aafe217f2c9f6a45d3627e7))

## [2.26.0](https://github.com/muelley86/zaehler/compare/v2.25.0...v2.26.0) (2026-05-29)


### Funktionen

* **deploy:** proxy-external-Modus + vollstaendige meters.env-Doku ([#126](https://github.com/muelley86/zaehler/issues/126)) ([5fb593b](https://github.com/muelley86/zaehler/commit/5fb593b612dbb2efdb92b8e740ce85a36624f295))

## [2.25.0](https://github.com/muelley86/zaehler/compare/v2.24.5...v2.25.0) (2026-05-29)


### Funktionen

* **security:** optionale Admin-2FA-Pflicht (METERS_REQUIRE_TOTP_FOR_ADMIN) ([#123](https://github.com/muelley86/zaehler/issues/123)) ([2037111](https://github.com/muelley86/zaehler/commit/20371114e8aee3087f6b01bc0863a85433f30559))
* **security:** Tier-3-Opt-ins — XFF-Pinning, QR-HTTPS-URL, Internet-Doku ([#122](https://github.com/muelley86/zaehler/issues/122)) ([23a2c6b](https://github.com/muelley86/zaehler/commit/23a2c6bbe7ae2b7404ed0025f1cf656ccc67449e))


### Fehlerbehebungen

* **security:** Tier-1-Haertung ohne Funktionseinschraenkung ([#120](https://github.com/muelley86/zaehler/issues/120)) ([a4c3cea](https://github.com/muelley86/zaehler/commit/a4c3cea854f6ea764591d41b3d02f82e560d617a))
* **security:** Tier-2-Haertung — sichere Deploy-Defaults + Online-Boot-Guard ([#121](https://github.com/muelley86/zaehler/issues/121)) ([8690568](https://github.com/muelley86/zaehler/commit/86905689304011393940abfc88ad66a79ed92ef0))


### Dokumentation

* METERS_REQUIRE_TOTP_FOR_ADMIN im Internet-Abschnitt ergaenzen ([#125](https://github.com/muelley86/zaehler/issues/125)) ([f9f0084](https://github.com/muelley86/zaehler/commit/f9f00848515a071610a3ae595993e94f6169f590))

## [2.24.5](https://github.com/muelley86/zaehler/compare/v2.24.4...v2.24.5) (2026-05-29)


### Dokumentation

* **audit:** Status-Nachtrag 2026-05-29 (34/42 Befunde behoben) ([#118](https://github.com/muelley86/zaehler/issues/118)) ([e4190d5](https://github.com/muelley86/zaehler/commit/e4190d57abad10f0c4586ad0e833acd8e51d8c2e))

## [2.24.4](https://github.com/muelley86/zaehler/compare/v2.24.3...v2.24.4) (2026-05-29)


### Performance

* Performance-Audit + Quick-Wins (N+1, mmap, audit-Index, Foto-Kompression) ([#116](https://github.com/muelley86/zaehler/issues/116)) ([0038f0d](https://github.com/muelley86/zaehler/commit/0038f0d82cebb5c90d66c115f13dd66e84a02764))

## [2.24.3](https://github.com/muelley86/zaehler/compare/v2.24.2...v2.24.3) (2026-05-29)


### Fehlerbehebungen

* **security:** Boot-Assertion zu Warning degradieren (Direkt-HTTP weiter moeglich) ([#114](https://github.com/muelley86/zaehler/issues/114)) ([5cc6fa3](https://github.com/muelley86/zaehler/commit/5cc6fa3af2fd43a896e192060c0312123cd00e41))

## [2.24.2](https://github.com/muelley86/zaehler/compare/v2.24.1...v2.24.2) (2026-05-28)


### Fehlerbehebungen

* **time:** TZ-naive Stellen haerten (Substring-Bypass + isoformat) ([#111](https://github.com/muelley86/zaehler/issues/111)) ([7dabc7b](https://github.com/muelley86/zaehler/commit/7dabc7b7e9dc7a6d278497585577aee963c2906a))

## [2.24.1](https://github.com/muelley86/zaehler/compare/v2.24.0...v2.24.1) (2026-05-28)


### Fehlerbehebungen

* **time:** UTC-Suffix in Reading/Delivery/State-Responses; feat(inputs): PLZ/MaLo/VAT/Email-Regex ([#109](https://github.com/muelley86/zaehler/issues/109)) ([a9b422d](https://github.com/muelley86/zaehler/commit/a9b422d134cbb5509834008f2d350881455acf0c))

## [2.24.0](https://github.com/muelley86/zaehler/compare/v2.23.0...v2.24.0) (2026-05-28)


### Funktionen

* **stammdaten:** Standort-Adresse + MP-Einbauort + Suche + CSV ([#107](https://github.com/muelley86/zaehler/issues/107)) ([0b45649](https://github.com/muelley86/zaehler/commit/0b45649c8e01c8d8675249e7f5d8030abf8134e6))

## [2.23.0](https://github.com/muelley86/zaehler/compare/v2.22.0...v2.23.0) (2026-05-28)


### Funktionen

* **owners:** Eigentuemer + periodisierte MP-Zuordnung mit Stichtag ([#105](https://github.com/muelley86/zaehler/issues/105)) ([9c4af9f](https://github.com/muelley86/zaehler/commit/9c4af9f6ea6d421672c4131776a7f15286316812))

## [2.22.0](https://github.com/muelley86/zaehler/compare/v2.21.0...v2.22.0) (2026-05-28)


### Funktionen

* **measuring-points:** Vertragsnummer + Marktlokation + Suche ([#103](https://github.com/muelley86/zaehler/issues/103)) ([71734e1](https://github.com/muelley86/zaehler/commit/71734e15548b3e851fb3f7452835fbcb17c59ee9))

## [2.21.0](https://github.com/muelley86/zaehler/compare/v2.20.0...v2.21.0) (2026-05-28)


### Funktionen

* **search:** globale Suche fuer Messstellen / Zaehlernummern / Standorte / Notizen ([#101](https://github.com/muelley86/zaehler/issues/101)) ([8da83d2](https://github.com/muelley86/zaehler/commit/8da83d2212551bfb0f5d656df63ff64d6ed1b49a))

## [2.20.0](https://github.com/muelley86/zaehler/compare/v2.19.0...v2.20.0) (2026-05-28)


### Funktionen

* **dashboard:** CSV-Export um Hauptstandort-Spalte ergaenzt + Zeitraum im Dateinamen ([#99](https://github.com/muelley86/zaehler/issues/99)) ([1142140](https://github.com/muelley86/zaehler/commit/1142140f6b83020b75bd3d7a9621a3e612e03902))

## [2.19.0](https://github.com/muelley86/zaehler/compare/v2.18.0...v2.19.0) (2026-05-28)


### Funktionen

* **locations:** Hauptstandort-Hierarchie ueber Zaehlerstandorten ([#97](https://github.com/muelley86/zaehler/issues/97)) ([63aa755](https://github.com/muelley86/zaehler/commit/63aa7550de9dd6f80064a122de0429a0754b8564))

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
