#Requires -RunAsAdministrator

param(
  [string]$InstallRoot = "D:\Textura",
  [string]$NssmExe = "C:\Program Files\nssm\win64\nssm.exe",
  [string]$CaddyExe = "C:\Program Files\Caddy\caddy.exe",
  [string]$ProxyServiceName = "TexturaProxy",
  [string]$LegacyBackendServiceName = "TexturaBackend",
  [int]$PublicPort = 4000,
  [int]$InitialBackendPort = 4101,
  [switch]$StopLegacyBackend
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$ConfigDir = Join-Path $InstallRoot "config"
$ProxyDir = Join-Path $InstallRoot "proxy"
$LogDir = Join-Path $InstallRoot "logs"
$CaddyLogDir = Join-Path $LogDir "caddy"
$CaddyConfig = Join-Path $ProxyDir "Caddyfile"
$ActiveUpstream = Join-Path $ProxyDir "active-backend.caddy"
$BackendEnv = Join-Path $ConfigDir "backend.env"
$NodeExe = (Get-Command node -ErrorAction Stop).Source

function Invoke-NativeCommand(
  [string]$FilePath,
  [string[]]$Arguments
) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

foreach ($required in @($NssmExe, $CaddyExe)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required executable not found: $required"
  }
}

foreach ($command in @("node", "npm.cmd", "psql", "pg_dump", "pg_restore")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required command is not available in PATH: $command"
  }
}

New-Item -ItemType Directory -Force -Path `
  $ConfigDir,
  $ProxyDir,
  (Join-Path $InstallRoot "releases"),
  (Join-Path $InstallRoot "state"),
  (Join-Path $InstallRoot "rollback"),
  (Join-Path $InstallRoot "backups"),
  (Join-Path $LogDir "backend"),
  (Join-Path $LogDir "deploy"),
  $CaddyLogDir | Out-Null

if (-not (Test-Path -LiteralPath $BackendEnv)) {
  @"
NODE_ENV=production
API_PREFIX=/api
CORS_ORIGIN=https://textura.company.internal
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=invoice_app
DB_PASSWORD=REPLACE_ME
DB_NAME=textile_invoice
DB_SSL=false
JWT_SECRET=REPLACE_WITH_AT_LEAST_64_RANDOM_CHARACTERS
JWT_EXPIRES_IN=8h
BOOTSTRAP_ADMIN_ENABLED=false
"@ | Set-Content -LiteralPath $BackendEnv -Encoding ASCII

  Write-Warning "Created $BackendEnv. Replace all placeholder values before the first deployment."
}

"reverse_proxy 127.0.0.1:$InitialBackendPort" |
  Set-Content -LiteralPath $ActiveUpstream -Encoding ASCII

@"
{
  admin 127.0.0.1:2019
}

:$PublicPort {
  encode zstd gzip

  header {
    -Server
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
  }

  import "$ActiveUpstream"

  log {
    output file "$CaddyLogDir\access.json" {
      roll_size 50MiB
      roll_keep 10
      roll_keep_for 720h
    }
    format json
  }
}
"@ | Set-Content -LiteralPath $CaddyConfig -Encoding ASCII

Invoke-NativeCommand $CaddyExe @("validate", "--config", $CaddyConfig, "--adapter", "caddyfile")

$legacyService = Get-Service -Name $LegacyBackendServiceName -ErrorAction SilentlyContinue
if ($legacyService -and $legacyService.Status -ne "Stopped") {
  if (-not $StopLegacyBackend) {
    throw "Legacy service $LegacyBackendServiceName is running on the public port. Re-run with -StopLegacyBackend during the one-time cutover."
  }
  Stop-Service -Name $LegacyBackendServiceName -Force
  Set-Service -Name $LegacyBackendServiceName -StartupType Disabled
}

$proxyService = Get-Service -Name $ProxyServiceName -ErrorAction SilentlyContinue
if (-not $proxyService) {
  Invoke-NativeCommand $NssmExe @(
    "install",
    $ProxyServiceName,
    $CaddyExe,
    "run",
    "--config",
    $CaddyConfig,
    "--adapter",
    "caddyfile"
  )
}

foreach ($backendService in @("TexturaBackendBlue", "TexturaBackendGreen")) {
  $service = Get-Service -Name $backendService -ErrorAction SilentlyContinue
  if (-not $service) {
    Invoke-NativeCommand $NssmExe @(
      "install",
      $backendService,
      $NodeExe,
      "dist\server.js"
    )
  }
  Invoke-NativeCommand $NssmExe @("set", $backendService, "Start", "SERVICE_DEMAND_START")
  Invoke-NativeCommand $NssmExe @("set", $backendService, "AppExit", "Default", "Restart")
}

Invoke-NativeCommand $NssmExe @("set", $ProxyServiceName, "Application", $CaddyExe)
Invoke-NativeCommand $NssmExe @(
  "set",
  $ProxyServiceName,
  "AppParameters",
  "run",
  "--config",
  $CaddyConfig,
  "--adapter",
  "caddyfile"
)
Invoke-NativeCommand $NssmExe @("set", $ProxyServiceName, "AppDirectory", $ProxyDir)
Invoke-NativeCommand $NssmExe @(
  "set",
  $ProxyServiceName,
  "AppStdout",
  (Join-Path $CaddyLogDir "service-stdout.log")
)
Invoke-NativeCommand $NssmExe @(
  "set",
  $ProxyServiceName,
  "AppStderr",
  (Join-Path $CaddyLogDir "service-stderr.log")
)
Invoke-NativeCommand $NssmExe @("set", $ProxyServiceName, "AppRotateFiles", "1")
Invoke-NativeCommand $NssmExe @("set", $ProxyServiceName, "AppRotateOnline", "1")
Invoke-NativeCommand $NssmExe @("set", $ProxyServiceName, "AppExit", "Default", "Restart")
Invoke-NativeCommand $NssmExe @("set", $ProxyServiceName, "Start", "SERVICE_AUTO_START")

$proxyService = Get-Service -Name $ProxyServiceName
if ($proxyService.Status -eq "Running") {
  Invoke-NativeCommand $NssmExe @("restart", $ProxyServiceName)
} else {
  Invoke-NativeCommand $NssmExe @("start", $ProxyServiceName)
}

Write-Host "Blue-green server layout installed under $InstallRoot"
Write-Host "Production environment file: $BackendEnv"
Write-Host "Caddy public endpoint: http://127.0.0.1:$PublicPort"
Write-Host "Run the production workflow after replacing environment placeholders."
