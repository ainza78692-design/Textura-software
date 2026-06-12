param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) { throw "Backup file not found: $BackupFile" }
if (-not $DatabaseUrl) { throw "DATABASE_URL is required for restore." }

Write-Host "About to restore $BackupFile"
Write-Host "Target database: $DatabaseUrl"
Write-Host "Stop TexturaBackend before restore to prevent writes."

$args = @("--dbname=$DatabaseUrl", "--verbose")
if ($Clean) { $args += "--clean"; $args += "--if-exists" }
$args += $BackupFile

pg_restore @args
Write-Host "Restore completed."
