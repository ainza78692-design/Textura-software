param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$UpdateDir = $env:TEXTURA_UPDATE_DIR,
  [string]$ReleaseNotes = "",
  [switch]$Mandatory,
  [string]$MinSupportedVersion = "",
  [string]$PreviousVersion = "",
  [string]$PreviousInstallerUrl = "",
  [string]$PreviousInstallerPath = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $InstallerPath)) { throw "Installer not found: $InstallerPath" }
if (-not $UpdateDir) { $UpdateDir = "D:\Textura\updates" }

New-Item -ItemType Directory -Force -Path $UpdateDir | Out-Null

$installerName = Split-Path $InstallerPath -Leaf
$target = Join-Path $UpdateDir $installerName
Copy-Item -LiteralPath $InstallerPath -Destination $target -Force

$hash = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLower()
$manifest = [ordered]@{
  version = $Version
  mandatory = [bool]$Mandatory
  minSupportedVersion = $MinSupportedVersion
  installerUrl = "/updates/downloads/$installerName"
  sha256 = $hash
  previousVersion = $PreviousVersion
  previousInstallerUrl = $PreviousInstallerUrl
  previousSha256 = ""
  releaseNotes = $ReleaseNotes
  publishedAt = (Get-Date).ToUniversalTime().ToString("o")
}

if ($PreviousInstallerPath) {
  if (-not (Test-Path $PreviousInstallerPath)) { throw "Previous installer not found: $PreviousInstallerPath" }
  $previousInstallerName = Split-Path $PreviousInstallerPath -Leaf
  $previousTarget = Join-Path $UpdateDir $previousInstallerName
  Copy-Item -LiteralPath $PreviousInstallerPath -Destination $previousTarget -Force
  $manifest.previousInstallerUrl = "/updates/downloads/$previousInstallerName"
  $manifest.previousSha256 = (Get-FileHash -Algorithm SHA256 $previousTarget).Hash.ToLower()
}

$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $UpdateDir "latest.json") -Encoding UTF8
Write-Host "Update manifest generated: $(Join-Path $UpdateDir "latest.json")"
