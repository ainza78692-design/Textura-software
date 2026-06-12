param(
  [string]$AppDir = $env:TEXTURA_APP_DIR,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$EnvFile = $env:TEXTURA_BACKEND_ENV,
  [switch]$BaselineExistingSchema
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $AppDir) {
  $AppDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

if (-not $DatabaseUrl) {
  $BackendEnv = if ($EnvFile) { $EnvFile } else { Join-Path $AppDir "backend\.env" }
  if (-not (Test-Path $BackendEnv)) { throw "Missing backend .env and DATABASE_URL." }

  $vars = @{}
  Get-Content $BackendEnv | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
      $vars[$matches[1].Trim()] = $matches[2].Trim()
    }
  }

  $dbUser = [Uri]::EscapeDataString($vars.DB_USER)
  $dbPassword = [Uri]::EscapeDataString($vars.DB_PASSWORD)
  $DatabaseUrl = "postgresql://${dbUser}:${dbPassword}@$($vars.DB_HOST):$($vars.DB_PORT)/$($vars.DB_NAME)"
}

$MigrationDir = Join-Path $AppDir "database\migrations"
if (-not (Test-Path $MigrationDir)) { throw "Migration directory not found: $MigrationDir" }

function Invoke-Psql([string[]]$Arguments) {
  & psql @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE."
  }
}

function Invoke-PsqlCapture([string[]]$Arguments) {
  $output = & psql @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE."
  }
  return ($output | Out-String).Trim()
}

Invoke-Psql @(
  $DatabaseUrl,
  "-v", "ON_ERROR_STOP=1",
  "-c", "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now());"
)

$existingAppSchema = Invoke-PsqlCapture @(
  $DatabaseUrl,
  "-t", "-A",
  "-c", "select to_regclass('public.app_users') is not null;"
)
$migrationCount = Invoke-PsqlCapture @(
  $DatabaseUrl,
  "-t", "-A",
  "-c", "select count(*) from schema_migrations;"
)
if ($existingAppSchema.Trim() -eq "t" -and $migrationCount.Trim() -eq "0") {
  if (-not $BaselineExistingSchema) {
    throw "Existing schema has no migration history. Run once with -BaselineExistingSchema after verifying the schema matches all current migrations."
  }

  Write-Host "Existing Textura schema detected. Baselining current migration files."
  Get-ChildItem $MigrationDir -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    $escaped = $_.Name.Replace("'", "''")
    Invoke-Psql @(
      $DatabaseUrl,
      "-v", "ON_ERROR_STOP=1",
      "-c", "insert into schema_migrations(filename) values ('$escaped') on conflict do nothing;"
    )
  }
  return
}

Get-ChildItem $MigrationDir -Filter "*.sql" | Sort-Object Name | ForEach-Object {
  $file = $_.Name
  $escaped = $file.Replace("'", "''")
  $alreadyApplied = Invoke-PsqlCapture @(
    $DatabaseUrl,
    "-t", "-A",
    "-c", "select 1 from schema_migrations where filename = '$escaped';"
  )
  if ($alreadyApplied.Trim() -eq "1") {
    Write-Host "Skipping migration $file"
    return
  }

  Write-Host "Applying migration $file"
  Invoke-Psql @($DatabaseUrl, "-v", "ON_ERROR_STOP=1", "-f", $_.FullName)
  Invoke-Psql @(
    $DatabaseUrl,
    "-v", "ON_ERROR_STOP=1",
    "-c", "insert into schema_migrations(filename) values ('$escaped');"
  )
}
