param(
  [string]$BackupRoot = $env:TEXTURA_BACKUP_ROOT,
  [int]$DailyKeepDays = 14,
  [int]$WeeklyKeepDays = 90,
  [int]$ArchiveAfterDays = 365,
  [int]$ArchiveKeepDays = 2555
)

$ErrorActionPreference = "Stop"

if (-not $BackupRoot) { $BackupRoot = "D:\Textura\backups" }

$ArchiveRoot = Join-Path $BackupRoot "archive"
$LogDir = Join-Path $BackupRoot "logs"
New-Item -ItemType Directory -Force -Path $ArchiveRoot, $LogDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "retention-$Stamp.log"

Start-Transcript -Path $LogFile -Append | Out-Null
try {
  $now = Get-Date

  foreach ($entry in @(
    @{ Path = (Join-Path $BackupRoot "daily"); Days = $DailyKeepDays },
    @{ Path = (Join-Path $BackupRoot "weekly"); Days = $WeeklyKeepDays },
    @{ Path = (Join-Path $BackupRoot "predeploy"); Days = 30 }
  )) {
    if (Test-Path $entry.Path) {
      Get-ChildItem $entry.Path -File | Where-Object {
        $_.LastWriteTime -lt $now.AddDays(-[int]$entry.Days)
      } | Remove-Item -Force
    }
  }

  foreach ($source in @("daily", "weekly")) {
    $sourcePath = Join-Path $BackupRoot $source
    if (-not (Test-Path $sourcePath)) { continue }

    Get-ChildItem $sourcePath -File -Filter "*.dump" | Where-Object {
      $_.LastWriteTime -lt $now.AddDays(-$ArchiveAfterDays)
    } | ForEach-Object {
      $archivePath = Join-Path $ArchiveRoot $_.Name
      Move-Item -LiteralPath $_.FullName -Destination $archivePath -Force
      Write-Host "Archived $($_.Name)"
    }
  }

  Get-ChildItem $ArchiveRoot -File | Where-Object {
    $_.LastWriteTime -lt $now.AddDays(-$ArchiveKeepDays)
  } | Remove-Item -Force
}
finally {
  Stop-Transcript | Out-Null
}
