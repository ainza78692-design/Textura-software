param(
  [string]$AppDir = $env:TEXTURA_APP_DIR,
  [string]$BackupRoot = $env:TEXTURA_BACKUP_ROOT
)

$ErrorActionPreference = "Stop"

if (-not $AppDir) {
  $AppDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}
if (-not $BackupRoot) { $BackupRoot = "D:\Textura\backups" }

$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$dailyAction = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\backup-textura.ps1`" -AppDir `"$AppDir`" -BackupRoot `"$BackupRoot`" -Mode daily"
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At 2:00am
Register-ScheduledTask -TaskName "Textura Daily Backup" -Action $dailyAction -Trigger $dailyTrigger -Description "Daily Textura PostgreSQL backup" -RunLevel Highest -Force

$weeklyAction = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\backup-textura.ps1`" -AppDir `"$AppDir`" -BackupRoot `"$BackupRoot`" -Mode weekly"
$weeklyTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3:00am
Register-ScheduledTask -TaskName "Textura Weekly Backup" -Action $weeklyAction -Trigger $weeklyTrigger -Description "Weekly Textura PostgreSQL backup" -RunLevel Highest -Force

$retentionAction = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\apply-retention.ps1`" -BackupRoot `"$BackupRoot`""
$retentionTrigger = New-ScheduledTaskTrigger -Daily -At 4:00am
Register-ScheduledTask -TaskName "Textura Backup Retention" -Action $retentionAction -Trigger $retentionTrigger -Description "Textura backup cleanup and archive policy" -RunLevel Highest -Force

Write-Host "Scheduled tasks installed."
