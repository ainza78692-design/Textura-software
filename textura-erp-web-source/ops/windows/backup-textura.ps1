param(
  [string]$AppDir = $env:TEXTURA_APP_DIR,
  [string]$BackupRoot = $env:TEXTURA_BACKUP_ROOT,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [ValidateSet("daily", "weekly", "predeploy")]
  [string]$Mode = "daily"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $AppDir) {
  $AppDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}
if (-not $BackupRoot) { $BackupRoot = "D:\Textura\backups" }

if (-not $DatabaseUrl) {
  $BackendEnv = Join-Path $AppDir "backend\.env"
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

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TargetDir = Join-Path $BackupRoot $Mode
$LogDir = Join-Path $BackupRoot "logs"
New-Item -ItemType Directory -Force -Path $TargetDir, $LogDir | Out-Null

$DbBackup = Join-Path $TargetDir "textura-db-$Stamp.dump"
$MetaFile = Join-Path $TargetDir "textura-backup-$Stamp.json"
$LogFile = Join-Path $LogDir "backup-$Mode-$Stamp.log"

Start-Transcript -Path $LogFile -Append | Out-Null
try {
  Write-Host "Backup started: $Mode"
  & pg_dump --format=custom --compress=9 --file=$DbBackup $DatabaseUrl
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }

  & pg_restore --list $DbBackup | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pg_restore validation failed with exit code $LASTEXITCODE." }

  $metadata = [ordered]@{
    mode = $Mode
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    databaseBackup = $DbBackup
    databaseBackupSha256 = (Get-FileHash -Algorithm SHA256 $DbBackup).Hash.ToLower()
    appDir = $AppDir
    host = $env:COMPUTERNAME
  }

  $metadata | ConvertTo-Json | Set-Content -Path $MetaFile -Encoding UTF8
  Write-Host "Backup completed: $DbBackup"
}
finally {
  Stop-Transcript | Out-Null
}
