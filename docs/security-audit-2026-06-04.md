# Security-Audit — Zählerstand-App (2026-06-04)

**Datum:** 2026-06-04 · **Branch:** `main` (HEAD `6998395`) · **Methode:** tool-gestützt, rein berichtend
**Schweregrad-Filter dieses Berichts:** nur **High** und **Critical** (nach Konsolidierung & Dedup)

> Dieser Bericht entstand als rein berichtender, tool-gestützter Audit. Die
> Tool-Auswahl, die Tool-für-Tool-Befunde und die Roh-Ausgaben lagen in einem
> lokalen `audit/`-Workspace (nicht im Repo). Die Befunde und die anschließende
> Behebung sind hier selbst-enthaltend dokumentiert.

---

## 0. Remediation-Status (Nachtrag 2026-06-05)

**Alle Befunde abgearbeitet.** `osv-scanner` meldet auf **beiden** Lockfiles
(`backend/uv.lock` und `frontend/pnpm-lock.yaml`) **„No issues found"**; zizmor
und checkov auf den Workflows ebenfalls **0**.

| Befund | Maßnahme | PR | Release |
|---|---|---|---|
| **H-1** CI-Supply-Chain (ungepinnte Actions, fehlende `permissions:`) | SHA-Pinning aller Actions, `permissions: contents: read`, `persist-credentials: false` | #239 | 2.54.1 |
| **Prod-Medium** `starlette` 1.0.0 → 1.0.1, `idna` 3.13 → 3.18 | `uv lock`-Pin | #240 | 2.54.1 |
| **Prod-Medium** `react-router` 6.30.3 → 6.30.4 (Open-Redirect, im SPA) | `react-router-dom`-Bump in `package.json` | #241 → #242 | 2.54.2 |
| **H-2** dev-Transitive `@babel/...systemjs`, `fast-uri` (+ `ws`, `brace-expansion`) | Lockfile-Regen (natürliche within-range-Auflösung, **ohne** Overrides) | #242 | 2.54.2 |
| **C-1** `vitest` 2.1.9 → 4.1.8 + `vite` → 6, `esbuild` → 0.25.x | vite-6/vitest-4-Tooling-Migration | #244 | — (`build:`) |

**Lehre aus der Abarbeitung:** Der erste Frontend-Fix (#241) patchte die
Transitiven per `overrides` in `pnpm-workspace.yaml`. Das **brach den LXC-Deploy**
von 2.54.1 (`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`), weil die LXC pnpm **global**
installiert (nicht via corepack) und die Workspace-Overrides versions-abhängig
anders liest als die Lockfile-erzeugende pnpm. Behoben in #242 durch Entfernen
der Overrides. **Konsequenz: Frontend-CVEs künftig per `package.json`-Bump +
Lockfile-Regen patchen, nicht per Overrides auf dem Deploy-Pfad.**

---

## 1. Zusammenfassung (Stand Audit-Zeitpunkt)

Neun quelloffene Detektiv-Tools (SAST, Dependency-CVE, Secret-Scanning, CI- und
IaC-Audit) liefen vollständig gegen das Repo.

**Kernaussage: Der Produktions-Laufzeitpfad ist sauber.** Es gab **keine
produktionsrelevante High-/Critical-Schwachstelle** — weder im Backend-Code
(SAST: alle Treffer benign oder False-Positive), noch bei Secrets (keine echten
Leaks, `data/`-At-Rest unauffällig), noch in den Produktions-Dependencies (die
einzigen prod-relevanten CVEs waren **Medium**).

Die High-/Critical-Treffer der Tools verteilten sich auf **zwei Cluster**, die
beide **nicht den laufenden LXC-Dienst** betrafen:

1. **CI-Supply-Chain-Härtung** (High, effektiv Medium–High) — ungepinnte
   GitHub-Actions + fehlende `permissions:`-Blöcke. **Einziger praktisch
   handlungsrelevanter Befund.**
2. **Dev-/Build-/Test-only-Dependencies** (1 Critical, 2 High nach CVSS,
   effektiv Low) — `vitest`, `@babel/...systemjs`, `fast-uri`. Werden **nie auf
   die LXC ausgeliefert** (Produktion serviert ein vorgebautes statisches Bundle
   + Python-Backend).

| | Critical | High | (zur Einordnung) prod-relevante Medium |
|---|---|---|---|
| **Anzahl (konsolidiert)** | 1 | 2 | 3 |
| **Produktionspfad LXC betroffen?** | nein | nein | ja (alle Medium) |

---

## 2. Methodik & Scope

**Tools (alle OSI-lizenzierte lokale CLIs):** Semgrep 1.165.0, Bandit 1.9.4,
osv-scanner 2.3.8, pip-audit 2.10.0, zizmor 1.25.2, ShellCheck 0.11.0,
checkov 3.2.533, gitleaks 8.30.1, trufflehog 3.95.5.

**Ausschlüsse:** `node_modules .venv dist build backend/src/meters/static
__pycache__ .pytest_cache .mypy_cache .ruff_cache data .git` (Code-Scanner);
`data/` gezielt nur für TruffleHog (At-Rest).

**Einschränkungen:** pip-audit per Venv-Workaround (Funde decken sich mit
osv-scanner, Cross-Check bestanden); zizmor `--offline` ohne GitHub-Token
(token-gebundene Online-Audits übersprungen); checkov auf `deploy/` ohne
parsebares Framework (Bash/systemd → durch ShellCheck bzw. manuelle Recon
abgedeckt). **Keine dynamischen/DAST-Tools ausgewählt** → kein Wegwerf-Ziel
nötig, keiner gestartet.

**Filterung:** Duplikate nach Grundursache zusammengeführt (z. B. die 8 zizmor-
`unpinned-uses` + 2 `excessive-permissions` + 2 checkov-`CKV2_GHA_1` → ein
Cluster). Low-Confidence-Rauschen entfernt: 3 Semgrep-„XSS"-Treffer im Quelltext
als False-Positive verifiziert; gitleaks-Treffer als Test-Fixtures verifiziert.

---

## 3. High- & Critical-Befunde

### H-1 — CI-Supply-Chain: ungepinnte Actions + zu breite Token-Rechte  ·  **High** (effektiv Medium–High)

**Tools:** zizmor (`unpinned-uses` ×8 = error/High; `excessive-permissions` ×2 =
warning/Medium), checkov (`CKV2_GHA_1` ×2 — dieselbe Ursache wie
excessive-permissions). **Eine Grundursache, hier zusammengeführt.**

**Belege:**
- Ungepinnte Actions (nur Major-Tag, kein Commit-SHA):
  `backend.yml:22,25,47,51` (`actions/checkout@v4`, `astral-sh/setup-uv@v3`,
  `pnpm/action-setup@v4`, `actions/setup-node@v4`),
  `frontend.yml:22,24,28`, `release-please.yml:24`
  (`googleapis/release-please-action@v4`).
- Kein `permissions:`-Block in `backend.yml` und `frontend.yml` → Jobs erben den
  Default-`GITHUB_TOKEN`-Scope.

**Risiko:** Beide Schwächen **kompoundieren**: Wird ein Action-Tag durch eine
Upstream-Kompromittierung umgehängt, läuft fremder Code mit einem
`GITHUB_TOKEN`, dessen Scope mangels `permissions:`-Block breiter ist als nötig.
Blast-Radius im schlimmsten Fall: Schreibzugriff aufs Repo / Release-Erzeugung.
Eintrittswahrscheinlichkeit niedrig (durchweg renommierte First-Party-Actions),
Schadenpotenzial aber hoch → einziger Befund mit klarer Handlungsempfehlung.

**Behoben in #239** (Release 2.54.1): alle `uses:` auf 40-stelligen Commit-SHA
gepinnt (Versions-Kommentar dahinter), `permissions: contents: read` in
`backend.yml`/`frontend.yml`, zusätzlich `persist-credentials: false` an den
Checkout-Schritten. zizmor 12 Befunde → 0, checkov `CKV2_GHA_1` 2 failed → 0.

> **Architektur-Kontext (gleiches Supply-Chain-Thema, manuell, nicht tool-belegt):**
> Der Auto-Update-Pfad `git reset --hard origin/$branch` (`deploy/lxc/zaehler.sh`)
> und die `curl … | sh`-Installer (uv, NodeSource) ziehen ungepinnt/ohne
> Signaturprüfung. Gleiche Vertrauensannahme wie H-1, gleicher Tenor: für
> Einzelhaushalt akzeptabel, beim Firmen-Rollout härten. (Offen, nicht Teil
> dieser Abarbeitung.)

---

### C-1 — `vitest` 2.1.9: RCE-Klasse, **Critical** (CVSS 9.8) · effektiv **Low** (dev/test-only)

**Tool:** osv-scanner + pnpm audit (übereinstimmend). **GHSA-5xrq-8626-4rwp**,
CVSS 9.8. Fix: `vitest` ≥ 4.1.0 (Major-Sprung).

**Einordnung:** `vitest` ist eine **devDependency** (Test-Runner). Sie wird
**nicht** auf die LXC ausgeliefert — Produktion serviert ein vorgebautes Bundle
und führt nur das Python-Backend aus. **Reales Risiko: nur Entwickler-Maschine /
CI-Runner**, nicht der betriebene Dienst. Daher CVSS Critical, effektiv Low.

**Behoben in #244**: vite-6/vitest-4-Tooling-Migration (vitest 4.1.8, vite 6.4.3,
esbuild 0.25.x, @vitejs/plugin-react 4.7.0). Config lief unverändert; einzige
Code-Anpassung `global.navigator` → `globalThis.navigator` in einem Test.

---

### H-2 — Build-/Dev-Toolchain-CVEs: `@babel/...systemjs` 8.2 + `fast-uri` 7.5, **High (CVSS)** · effektiv **Low**

**Tool:** osv-scanner + pnpm audit.
- `@babel/plugin-transform-modules-systemjs` 7.29.0 — **GHSA-fv7c-fp4j-7gwp**,
  CVSS 8.2, Fix 7.29.4 (transitiv via `vite-plugin-pwa` → `workbox-build`).
- `fast-uri` 3.1.1 — **GHSA-v39h-62p7-jpjc**, CVSS 7.5, Fix 3.1.2 (dev-Tooling).

**Einordnung:** beide **Build-/Dev-only**, nicht im ausgelieferten Laufzeit-Bundle
wirksam (Babel transformiert zur Build-Zeit; `fast-uri` hängt am Dev-Tooling).
CVSS High, effektiv Low für den LXC-Dienst.

**Behoben in #242** (Release 2.54.2): über einen Lockfile-Regen auf gepatchte
within-range-Versionen (@babel 7.29.7, fast-uri 3.1.2, dazu `ws` 8.21.0 und
`brace-expansion` 5.0.6) — bewusst **ohne** `overrides` (deploy-sicher).

---

## 4. Risk-Register

| ID | Befund | Kategorie | Tool / Beleg | Severity (Tool/CVSS) | Effektives Risiko | Status |
|----|--------|-----------|--------------|----------------------|-------------------|--------|
| **H-1** | Ungepinnte GitHub-Actions + fehlende `permissions:` | CI / Supply-Chain | zizmor `unpinned-uses`×8, `excessive-permissions`×2; checkov `CKV2_GHA_1`×2 | High | **Medium–High** | ✅ behoben (#239, 2.54.1) |
| **C-1** | `vitest` 2.1.9 RCE-Klasse | Dependency (npm, **dev/test-only**) | osv-scanner / pnpm audit · GHSA-5xrq-8626-4rwp | **Critical** (9.8) | **Low** (nicht ausgeliefert) | ✅ behoben (#244) |
| **H-2** | `@babel/...systemjs` 8.2 + `fast-uri` 7.5 | Dependency (npm, **build/dev-only**) | osv-scanner / pnpm audit · GHSA-fv7c-fp4j-7gwp, GHSA-v39h-62p7-jpjc | **High** (8.2 / 7.5) | **Low** (nicht ausgeliefert) | ✅ behoben (#242, 2.54.2) |

**Bottom line (Audit-Zeitpunkt):** Das einzige Item mit produktivem
Handlungsdruck war **H-1** (CI-Härtung). C-1/H-2 waren reine Dev-/Build-Hygiene.
**Stand 2026-06-05: alle drei behoben.**

---

## 5. Bewusst NICHT als High/Critical gewertet (Transparenz)

**Produktionsrelevante CVEs — alle Medium (unter Schwelle, aber für den realen
Betrieb relevanter als die dev-only-Criticals oben):**

| Paket | Advisory | CVSS | Tragweite | Status |
|---|---|---|---|---|
| `starlette` 1.0.0 | PYSEC-2026-161 / GHSA-86qp-5c8j-p5mr | 6.5 | Host-Header → `request.url.path`-Inkonsistenz; **Auth-Bypass nur wenn** Middleware Pfad-basiert autorisiert. Diese App autorisiert über DI/`register_id`-Pre-Checks → praktisch nicht ausnutzbar. | ✅ → 1.0.1 (#240) |
| `react-router` 6.30.3 | GHSA-2j2x-hqr9-3h42 | 6.6 | Open-Redirect; **einzige** verwundbare Prod-`dependency` (im SPA-Bundle). | ✅ → 6.30.4 (#241/#242) |
| `idna` 3.13 | CVE-2026-45409 (GHSA-65pc-fj4g-8rjx) | 6.9 | DoS in `idna.encode()` bei pathologischen Eingaben; Prod-Laufzeit via `email-validator`. Eingaben durch Pydantic längenbegrenzt → geringe Praxisrelevanz. | ✅ → 3.18 (#240) |

**Sauber bestätigt (kein Befund):**
- **SAST-Backend/Frontend:** 7 Semgrep-Treffer = 1 benign (Anti-Timing-bcrypt-
  Dummy `auth.py:34`), 3 Mockup-only (`handoff/mockup/`), 3 verifizierte
  False-Positives (QR-URL-f-Strings + maskiertes Token-Logging — Flask-XSS-
  Heuristik auf FastAPI-JSON). Bandit: nur B104 (dokumentierter `0.0.0.0`-LAN-Default).
- **Secrets:** keine echten Leaks. gitleaks-Treffer = Test-Passwörter in
  `backend/tests/`; `backend/.env` untracked + gitignored; `data/media/` und
  `data/*.db` (TruffleHog At-Rest) ohne erkennbare Credentials.
- **Deploy-Skripte:** ShellCheck nur 2× SC2155 (Rückgabewert-Maskierung) in
  `zaehler.sh` — Low.
- **Bekannte/akzeptierte Items** (bereits in `AUDIT.md` dokumentiert): Plaintext-
  TOTP-Secret at rest, Default-`secret_key` (Boot-Assertion-geschützt),
  `cookie_secure`-Soft-Fail im LAN-Modus. Kein neuer Handlungsbedarf aus diesem Lauf.

---

*Audit rein berichtend; die anschließende Behebung erfolgte in den oben
referenzierten PRs (#239–#244). Endergebnis: `osv-scanner` auf beiden Lockfiles
„No issues found".*
