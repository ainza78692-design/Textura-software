param(
  [string]$HealthUrl = $env:TEXTURA_HEALTH_URL,
  [string]$LogRoot = $env:TEXTURA_LOG_ROOT
)

$ErrorActionPreference = "Stop"

if (-not $HealthUrl) { $HealthUrl = "http://127.0.0.1:4000/health" }
if (-not $LogRoot) { $LogRoot = "D:\Textura\logs" }

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogRoot "health-$Stamp.json"

$result = [ordered]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString("o")
  url = $HealthUrl
  host = $env:COMPUTERNAME
  ok = $false
}

try {
  $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 10
  $result.ok = $response.status -eq "ok"
  $result.response = $response
} catch {
  $result.error = $_.Exception.Message
}

$result | ConvertTo-Json -Depth 5 | Set-Content -Path $LogFile -Encoding UTF8
if (-not $result.ok) { exit 1 }
