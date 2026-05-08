#Requires -Version 5.1
<#
.SYNOPSIS
  One-Shot-Setup fuer lokales Testen der Zaehlerstand-App auf Windows.

.DESCRIPTION
  Idempotent - beim ersten Aufruf wird alles eingerichtet, bei jedem
  weiteren Aufruf werden nur Backend + Frontend neu gestartet.

  Was passiert (in Reihenfolge):
   1. Pre-Flight: Node.js + Python muessen vorhanden sein.
   2. pnpm wird via "npm install -g" geholt, falls fehlt.
   3. uv wird via offiziellem Astral-Installer geholt, falls fehlt.
   4. Frontend-Deps via "pnpm install".
   5. Backend-Deps via "uv sync" + Alembic-Migration "upgrade head".
   6. Admin-User "admin" / "admin12345678" wird angelegt
      (idempotent - bestehende Admins werden nicht angefasst).
   7. Backend startet in eigenem PowerShell-Fenster (Port 8000).
   8. Skript wartet, bis das Backend antwortet.
   9. Frontend-Dev startet in eigenem PowerShell-Fenster (Port 5173).
  10. Browser oeffnet sich auf http://localhost:5173.

  Stop: einfach die zwei oeffnenden Fenster mit Strg+C oder dem
  X-Symbol schliessen - die Server gehen mit ihnen aus.

.PARAMETER SkipBrowser
  Browser nicht automatisch oeffnen.

.PARAMETER AdminPassword
  Initiales Admin-Passwort (>= 12 Zeichen). Default "admin12345678".
  Wirkt nur beim allerersten Lauf, wenn der admin-User noch nicht
  existiert; spaetere Aufrufe lassen den Account unangetastet.

.EXAMPLE
  PS> .\scripts\dev-test.ps1
  Vollstaendiges Setup + beide Server starten + Browser oeffnen.

.EXAMPLE
  PS> .\scripts\dev-test.ps1 -SkipBrowser
  Wie oben, aber ohne Browser-Auto-Open.

.NOTES
  Falls PowerShell ExecutionPolicy "Restricted" meldet, einmalig:
    PS> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  oder das Skript so starten:
    PS> powershell -ExecutionPolicy Bypass -File .\scripts\dev-test.ps1
#>

[CmdletBinding()]
param(
  [switch]$SkipBrowser,
  [string]$AdminPassword = 'admin12345678'
)

$ErrorActionPreference = 'Stop'

# Repo-Root = Eltern-Verzeichnis dieses Skripts (scripts/ -> ..)
$RepoRoot    = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'

# Verhindert dass das Fenster bei Doppelklick / Fehler unbemerkt zugeht.
# Wir merken uns, ob wir aus einer interaktiven Shell heraus gestartet
# wurden - wenn nein, halten wir am Ende auf jeden Fall an.
$IsDoubleClicked = -not [Environment]::UserInteractive -or `
                   ($Host.Name -eq 'ConsoleHost' -and -not $psISE -and `
                    [Environment]::GetCommandLineArgs() -match 'dev-test\.ps1')

function Wait-ForKey {
  param([string]$Message = 'Druecke Enter zum Schliessen ...')
  Write-Host ''
  Write-Host $Message -ForegroundColor Yellow
  try { [void][Console]::ReadKey($true) } catch { Read-Host | Out-Null }
}

# Wrapper fuer native exe-Aufrufe. PowerShell 5.1 wickelt stderr-Zeilen in
# ErrorRecords ein, sobald 2>&1 im Spiel ist - uv schreibt z.B. den
# Python-Download-Fortschritt auf stderr, was dann faelschlicherweise als
# Fehler hochgeworfen wird. Wir schalten ErrorActionPreference fuer den
# Aufruf temporaer aus und lesen stattdessen $LASTEXITCODE.
function Invoke-Native {
  param(
    [Parameter(Mandatory)] [string]$Description,
    [Parameter(Mandatory)] [scriptblock]$Block
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Block
    if ($LASTEXITCODE -ne 0) {
      throw "$Description fehlgeschlagen (Exit-Code $LASTEXITCODE)"
    }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Write-Step($n, $text) {
  Write-Host ''
  Write-Host "[$n/11] $text" -ForegroundColor Cyan
}
function Write-Ok($text)   { Write-Host "      OK $text" -ForegroundColor Green }
function Write-Warn2($t)   { Write-Host "      !! $t"    -ForegroundColor Yellow }
function Write-Fail($t)    { Write-Host "      FAIL: $t" -ForegroundColor Red }

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Refresh-PathFromUser {
  # Pfad-Aenderungen aus User-/Machine-Env in die laufende Session ziehen.
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

Write-Host ''
Write-Host '=== Zaehlerstand-App: lokaler Dev-Setup ===' -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

try {

# ---- 1. Pre-Flight ---------------------------------------------------------
Write-Step 1 'Pre-Flight: Node.js + Python pruefen'
if (-not (Test-Command node)) {
  Write-Fail 'Node.js fehlt. Installation von https://nodejs.org/ (LTS) und neue PowerShell-Session.'
  exit 1
}
$nodeV = (node --version) -replace 'v',''
Write-Ok "Node.js $nodeV"
if (-not (Test-Command python)) {
  Write-Fail 'Python fehlt. Installation von https://www.python.org/downloads/ und neue PowerShell-Session.'
  exit 1
}
$pyV = (python --version 2>&1) -replace 'Python ',''
Write-Ok "Python $pyV"

# ---- 2. pnpm ---------------------------------------------------------------
Write-Step 2 'pnpm bereitstellen'
if (-not (Test-Command pnpm)) {
  Write-Host '      installiere pnpm via "npm install -g pnpm" ...'
  Invoke-Native 'npm install -g pnpm' { npm install -g pnpm }
  Refresh-PathFromUser
  if (-not (Test-Command pnpm)) {
    Write-Fail 'pnpm konnte nicht installiert werden. Versuche manuell: npm install -g pnpm'
    exit 1
  }
}
Write-Ok "pnpm $(pnpm --version)"

# ---- 3. uv -----------------------------------------------------------------
Write-Step 3 'uv bereitstellen'
if (-not (Test-Command uv)) {
  Write-Host '      installiere uv via offiziellem Astral-Installer ...'
  try {
    Invoke-RestMethod 'https://astral.sh/uv/install.ps1' | Invoke-Expression
  } catch {
    Write-Warn2 "uv-Installer fehlgeschlagen: $($_.Exception.Message)"
    Write-Warn2 'Fallback: python -m pip install --user uv'
    Invoke-Native 'pip install uv' { python -m pip install --user uv }
  }
  # Astral-Installer schreibt in %USERPROFILE%\.local\bin - ggf. PATH ergaenzen.
  $localBin = Join-Path $env:USERPROFILE '.local\bin'
  if ((Test-Path $localBin) -and ($env:Path -notlike "*$localBin*")) {
    $env:Path = "$localBin;$env:Path"
  }
  Refresh-PathFromUser
  if (-not (Test-Command uv)) {
    Write-Fail 'uv ist nach Installation nicht im PATH. PowerShell-Session schliessen und Skript erneut starten.'
    exit 1
  }
}
Write-Ok "uv $((uv --version) -replace 'uv ', '')"

# ---- 4. Frontend-Deps ------------------------------------------------------
Write-Step 4 'Frontend-Dependencies (pnpm install)'
Push-Location $FrontendDir
try {
  Invoke-Native 'pnpm install' { pnpm install --silent }
  Write-Ok 'Frontend-Module bereit'
} finally {
  Pop-Location
}

# ---- 5. Backend-Deps + DB --------------------------------------------------
Write-Step 5 'Backend-Dependencies (uv sync) + DB-Migration'
Write-Host '      uv laedt beim ersten Lauf evtl. Python 3.12 nach (~ 20 MiB) - ein paar Sekunden Geduld.'
Push-Location $BackendDir
try {
  Invoke-Native 'uv sync'             { uv sync }
  Invoke-Native 'alembic upgrade head' { uv run alembic upgrade head }
  Write-Ok 'Backend-Module + DB-Schema auf head'
} finally {
  Pop-Location
}

# ---- 6. .env mit Secret-Key ------------------------------------------------
Write-Step 6 'Backend-.env mit METERS_SECRET_KEY sicherstellen'
$envPath = Join-Path $BackendDir '.env'
if (-not (Test-Path $envPath)) {
  # Zufaelligen Key generieren - Python ist bereits da (Schritt 1).
  $secret = (python -c "import secrets; print(secrets.token_urlsafe(48))").Trim()
  if ([string]::IsNullOrWhiteSpace($secret)) {
    Write-Fail 'Konnte keinen Secret-Key generieren.'
    exit 1
  }
  $envContent = @"
# Lokale Dev-Konfiguration (von scripts/dev-test.ps1 angelegt).
# Diese Datei ist gitignoriert (.env). Die Container-Konfig liegt in
# /opt/zaehler/data/meters.env und ist davon getrennt.
METERS_SECRET_KEY=$secret
METERS_DEBUG=true
METERS_COOKIE_SECURE=false
"@
  Set-Content -Path $envPath -Value $envContent -Encoding utf8
  Write-Ok ".env angelegt mit zufaelligem Secret-Key (gitignoriert)"
} else {
  if (Select-String -Path $envPath -Pattern '^METERS_SECRET_KEY=' -Quiet) {
    Write-Ok ".env existiert bereits mit METERS_SECRET_KEY - unveraendert"
  } else {
    $secret = (python -c "import secrets; print(secrets.token_urlsafe(48))").Trim()
    Add-Content -Path $envPath -Value "METERS_SECRET_KEY=$secret"
    Write-Ok 'METERS_SECRET_KEY in bestehende .env ergaenzt'
  }
}

# ---- 7. Admin-User ---------------------------------------------------------
Write-Step 7 "Admin-User 'admin' anlegen (falls noch nicht vorhanden)"
Push-Location $BackendDir
try {
  # stdout in Variable, stderr direkt zur Console - kein 2>&1 (siehe
  # Invoke-Native-Kommentar). $LASTEXITCODE statt ErrorRecord pruefen.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $createOut = & uv run python -m meters.cli create-admin --username admin --password $AdminPassword
  $createExit = $LASTEXITCODE
  $ErrorActionPreference = $prev

  if ($createExit -eq 0) {
    Write-Ok "Admin angelegt: admin / $AdminPassword (beim ersten Login Passwort-Wechsel erzwungen)"
  } elseif ($createOut -match 'already exists|UNIQUE constraint|existiert bereits') {
    Write-Ok 'Admin existiert bereits - unveraendert gelassen'
  } else {
    Write-Warn2 "create-admin Exit $createExit - Output:"
    if ($createOut) { $createOut | ForEach-Object { Write-Host "      $_" } }
    Write-Warn2 'Login-Daten musst du manuell pruefen.'
  }
} finally {
  Pop-Location
}

# ---- 8. Backend starten ----------------------------------------------------
Write-Step 8 'Backend starten (Port 8000) - eigenes Fenster'
# Cmd-String mit Pause am Ende: wenn der Server crashed oder beendet wird,
# bleibt das Fenster offen damit du den Fehler lesen kannst.
$backendCmd = @"
Set-Location '$BackendDir'
Write-Host '== Zaehler Backend (Strg+C zum Beenden) ==' -ForegroundColor Cyan
try { uv run uvicorn meters.main:app --reload } catch { Write-Host `$_.Exception.Message -ForegroundColor Red }
Write-Host ''
Write-Host 'Backend-Prozess beendet. Druecke Enter um dieses Fenster zu schliessen.' -ForegroundColor Yellow
[void][Console]::ReadKey(`$true)
"@
$backendProc = Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $backendCmd -PassThru
Write-Ok "Backend-Fenster gestartet (PID $($backendProc.Id))"

# ---- 9. Auf Backend warten -------------------------------------------------
Write-Step 9 'Auf Backend warten (max 60s)'
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    # /api/v1/auth/me ohne Cookie -> 401, das reicht als "lebt"-Signal
    $r = Invoke-WebRequest 'http://127.0.0.1:8000/api/v1/auth/me' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    $ready = $true; break
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
      $ready = $true; break
    }
    Start-Sleep -Milliseconds 500
  }
}
if ($ready) {
  Write-Ok 'Backend antwortet auf http://localhost:8000'
} else {
  Write-Warn2 'Backend hat innerhalb 60s nicht geantwortet. Skript laeuft trotzdem weiter.'
  Write-Warn2 'Pruefe das Backend-Fenster - moeglicherweise ein Port-Konflikt oder Migrationsfehler.'
}

# ---- 10. Frontend starten --------------------------------------------------
Write-Step 10 'Frontend-Dev starten (Port 5173) - eigenes Fenster'
$frontendCmd = @"
Set-Location '$FrontendDir'
Write-Host '== Zaehler Frontend (Strg+C zum Beenden) ==' -ForegroundColor Cyan
try { pnpm dev } catch { Write-Host `$_.Exception.Message -ForegroundColor Red }
Write-Host ''
Write-Host 'Frontend-Prozess beendet. Druecke Enter um dieses Fenster zu schliessen.' -ForegroundColor Yellow
[void][Console]::ReadKey(`$true)
"@
$frontendProc = Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $frontendCmd -PassThru
Write-Ok "Frontend-Fenster gestartet (PID $($frontendProc.Id))"

# Auf Vite warten (kommt schneller als das Backend)
for ($i = 0; $i -lt 30; $i++) {
  try {
    $null = Invoke-WebRequest 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    Write-Ok 'Frontend antwortet auf http://localhost:5173'
    break
  } catch {
    Start-Sleep -Milliseconds 400
  }
}

# ---- 11. Browser -----------------------------------------------------------
if ($SkipBrowser) {
  Write-Step 11 'Browser-Auto-Open uebersprungen (-SkipBrowser)'
} else {
  Write-Step 11 'Browser oeffnen'
  Start-Process 'http://localhost:5173'
  Write-Ok 'Browser auf http://localhost:5173 gestartet'
}

# ---- Abschluss -------------------------------------------------------------
Write-Host ''
Write-Host '=== Bereit ===' -ForegroundColor Green
Write-Host ''
Write-Host 'Login:    admin / ' -NoNewline
Write-Host $AdminPassword -ForegroundColor Yellow
Write-Host '          (beim ersten Login wirst du zur Passwort-Aenderung gezwungen)'
Write-Host ''
Write-Host 'Stoppen:  die beiden oeffnenden PowerShell-Fenster mit Strg+C oder X schliessen'
Write-Host '          (Backend-PID ' -NoNewline
Write-Host $backendProc.Id -ForegroundColor Yellow -NoNewline
Write-Host ', Frontend-PID ' -NoNewline
Write-Host $frontendProc.Id -ForegroundColor Yellow -NoNewline
Write-Host ')'
Write-Host ''
Write-Host 'Klick-Pfade fuer den Admin-Refactor:' -ForegroundColor Cyan
Write-Host '  - Linke Sidebar zeigt nur einen Admin-Eintrag "Verwaltung"'
Write-Host '  - /admin -> Card-Grid mit 8 Sektionen + Counter'
Write-Host '  - URL /messstellen direkt eingeben -> Auto-Redirect auf /admin/messstellen'
Write-Host '  - F12 + Strg+Shift+M -> Mobile-Ansicht: Mehr -> Verwaltung -> Hub'
Write-Host ''

} catch {
  Write-Host ''
  Write-Host '=== FEHLER ===' -ForegroundColor Red
  Write-Host "Schritt: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
  Write-Host "Meldung: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ScriptStackTrace) {
    Write-Host ''
    Write-Host 'Stack-Trace:' -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
  }
  Wait-ForKey 'Druecke Enter um dieses Fenster zu schliessen ...'
  exit 1
}

# Skript hat erfolgreich durchgelaufen. Wenn das Fenster per Doppelklick
# oder ohne offene Shell gestartet wurde, halten wir auf jeden Fall an -
# sonst sehen wir die Erfolgsmeldung nie.
if ($IsDoubleClicked) {
  Wait-ForKey 'Setup fertig. Backend + Frontend laufen in den anderen Fenstern. Enter um dieses hier zu schliessen.'
}
