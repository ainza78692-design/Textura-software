param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactPath,
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[A-Za-z0-9._-]+$")]
  [string]$ReleaseId,
  [string]$InstallRoot = $env:TEXTURA_INSTALL_ROOT,
  [string]$PublicHealthUrl = $env:TEXTURA_PUBLIC_HEALTH_URL,
  [string]$NssmExe = $env:TEXTURA_NSSM_EXE,
  [string]$CaddyExe = $env:TEXTURA_CADDY_EXE,
  [int]$BluePort = 4101,
  [int]$GreenPort = 4102,
  [int]$HealthAttempts = 20,
  [int]$HealthDelaySeconds = 3,
  [int]$DrainSeconds = 15,
  [int]$RetainReleases = 5
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $InstallRoot) { $InstallRoot = "D:\Textura" }
if (-not $PublicHealthUrl) { $PublicHealthUrl = "http://127.0.0.1:4000/health/ready" }
if (-not $NssmExe) { $NssmExe = "C:\Program Files\nssm\win64\nssm.exe" }
if (-not $CaddyExe) { $CaddyExe = "C:\Program Files\Caddy\caddy.exe" }

$ArtifactPath = [System.IO.Path]::GetFullPath($ArtifactPath)
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$ReleaseRoot = Join-Path $InstallRoot "releases"
$ReleasePath = Join-Path $ReleaseRoot $ReleaseId
$ConfigDir = Join-Path $InstallRoot "config"
$BackendEnv = Join-Path $ConfigDir "backend.env"
$ProxyDir = Join-Path $InstallRoot "proxy"
$CaddyConfig = Join-Path $ProxyDir "Caddyfile"
$ActiveUpstreamFile = Join-Path $ProxyDir "active-backend.caddy"
$StateDir = Join-Path $InstallRoot "state"
$StateFile = Join-Path $StateDir "deployment.json"
$LogDir = Join-Path $InstallRoot "logs\deploy"
$BackendLogDir = Join-Path $InstallRoot "logs\backend"
$BackupRoot = Join-Path $InstallRoot "backups"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "deploy-$Stamp-$ReleaseId.log"
$ResultFile = Join-Path $LogDir "deploy-$Stamp-$ReleaseId.json"
$NodeExe = (Get-Command node -ErrorAction Stop).Source
$NpmExe = (Get-Command npm.cmd -ErrorAction Stop).Source

$Slots = @{
  blue = @{
    Name = "blue"
    Port = $BluePort
    Service = "TexturaBackendBlue"
  }
  green = @{
    Name = "green"
    Port = $GreenPort
    Service = "TexturaBackendGreen"
  }
}

New-Item -ItemType Directory -Force -Path `
  $ReleaseRoot, $ConfigDir, $ProxyDir, $StateDir, $LogDir, $BackendLogDir, $BackupRoot | Out-Null

function Invoke-NativeCommand(
  [string]$FilePath,
  [string[]]$Arguments
) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

function Assert-DeploymentPrerequisites {
  if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
    throw "Release artifact not found: $ArtifactPath"
  }
  if (-not (Test-Path -LiteralPath $BackendEnv -PathType Leaf)) {
    throw "Production environment file not found: $BackendEnv"
  }
  if (-not (Test-Path -LiteralPath $NssmExe -PathType Leaf)) {
    throw "NSSM executable not found: $NssmExe"
  }
  if (-not (Test-Path -LiteralPath $CaddyExe -PathType Leaf)) {
    throw "Caddy executable not found: $CaddyExe"
  }
  if (-not (Test-Path -LiteralPath $CaddyConfig -PathType Leaf)) {
    throw "Caddy configuration not found: $CaddyConfig"
  }
  if (Test-Path -LiteralPath $ReleasePath) {
    throw "Release already exists and will not be overwritten: $ReleasePath"
  }
}

function Get-DeploymentState {
  if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
  return Get-Content -Raw -LiteralPath $StateFile | ConvertFrom-Json
}

function Save-DeploymentState([hashtable]$State) {
  $temp = "$StateFile.tmp"
  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $StateFile -Force
}

function Wait-ForHealthyEndpoint(
  [string]$Url,
  [string]$ExpectedRelease = "",
  [string]$ExpectedSlot = ""
) {
  $lastError = "No response received."

  for ($attempt = 1; $attempt -le $HealthAttempts; $attempt += 1) {
    try {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec 10
      $healthy = $response.status -eq "ok"
      $releaseMatches = -not $ExpectedRelease -or $response.release -eq $ExpectedRelease
      $slotMatches = -not $ExpectedSlot -or $response.slot -eq $ExpectedSlot

      if ($healthy -and $releaseMatches -and $slotMatches) {
        return $response
      }

      $lastError = "Unexpected response: $($response | ConvertTo-Json -Compress)"
    } catch {
      $lastError = $_.Exception.Message
    }

    Write-Host "Health attempt $attempt/$HealthAttempts failed for ${Url}: $lastError"
    Start-Sleep -Seconds $HealthDelaySeconds
  }

  throw "Health check failed for $Url. Last error: $lastError"
}

function Set-BackendService(
  [hashtable]$Slot,
  [string]$BackendPath
) {
  $serviceName = $Slot.Service
  $stdout = Join-Path $BackendLogDir "$($Slot.Name)-stdout.log"
  $stderr = Join-Path $BackendLogDir "$($Slot.Name)-stderr.log"
  $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

  if (-not $service) {
    throw "Backend service $serviceName is not installed. Run install-blue-green.ps1 as Administrator."
  }
  if ($service.Status -ne "Stopped") {
    Invoke-NativeCommand $NssmExe @("stop", $serviceName)
  }

  Invoke-NativeCommand $NssmExe @("set", $serviceName, "Application", $NodeExe)
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppParameters", "dist\server.js")
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppDirectory", $BackendPath)
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppStdout", $stdout)
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppStderr", $stderr)
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppRotateFiles", "1")
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppRotateOnline", "1")
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppRotateBytes", "10485760")
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "AppExit", "Default", "Restart")
  Invoke-NativeCommand $NssmExe @("set", $serviceName, "Start", "SERVICE_DEMAND_START")
  Invoke-NativeCommand $NssmExe @(
    "set",
    $serviceName,
    "AppEnvironmentExtra",
    "NODE_ENV=production",
    "PORT=$($Slot.Port)",
    "RELEASE_VERSION=$ReleaseId",
    "DEPLOYMENT_SLOT=$($Slot.Name)"
  )

  Invoke-NativeCommand $NssmExe @("start", $serviceName)
}

function Stop-BackendService([hashtable]$Slot) {
  $service = Get-Service -Name $Slot.Service -ErrorAction SilentlyContinue
  if ($service -and $service.Status -ne "Stopped") {
    Invoke-NativeCommand $NssmExe @("stop", [string]$Slot.Service)
  }
}

function Switch-Proxy([hashtable]$Slot) {
  $temp = "$ActiveUpstreamFile.tmp"
  "reverse_proxy 127.0.0.1:$($Slot.Port)" | Set-Content -LiteralPath $temp -Encoding ASCII
  Move-Item -LiteralPath $temp -Destination $ActiveUpstreamFile -Force

  Invoke-NativeCommand $CaddyExe @("validate", "--config", $CaddyConfig, "--adapter", "caddyfile")
  Invoke-NativeCommand $CaddyExe @("reload", "--config", $CaddyConfig, "--adapter", "caddyfile")
}

function Remove-ExpiredReleases([string[]]$ProtectedReleaseIds) {
  $releases = Get-ChildItem -LiteralPath $ReleaseRoot -Directory |
    Sort-Object LastWriteTimeUtc -Descending
  $kept = 0

  foreach ($release in $releases) {
    if ($ProtectedReleaseIds -contains $release.Name) { continue }
    $kept += 1
    if ($kept -le $RetainReleases) { continue }

    $resolved = [System.IO.Path]::GetFullPath($release.FullName)
    if (-not $resolved.StartsWith("$ReleaseRoot\", [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove release outside release root: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}

$result = [ordered]@{
  releaseId = $ReleaseId
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  status = "running"
  activeSlotBefore = $null
  targetSlot = $null
  rollback = $false
}

$transcriptStarted = $false
$proxySwitched = $false
$state = $null
$currentSlot = $null
$targetSlot = $null

try {
  Start-Transcript -Path $LogFile -Append | Out-Null
  $transcriptStarted = $true
  Assert-DeploymentPrerequisites

  $state = Get-DeploymentState
  $currentSlotName = if ($state -and $Slots.ContainsKey([string]$state.activeSlot)) {
    [string]$state.activeSlot
  } else {
    $null
  }
  $targetSlotName = if ($currentSlotName -eq "blue") { "green" } else { "blue" }
  $currentSlot = if ($currentSlotName) { $Slots[$currentSlotName] } else { $null }
  $targetSlot = $Slots[$targetSlotName]
  $result.activeSlotBefore = $currentSlotName
  $result.targetSlot = $targetSlotName

  Write-Host "Deploying release $ReleaseId to $targetSlotName on port $($targetSlot.Port)"
  Expand-Archive -LiteralPath $ArtifactPath -DestinationPath $ReleasePath

  $ReleaseBackend = Join-Path $ReleasePath "backend"
  if (-not (Test-Path -LiteralPath (Join-Path $ReleaseBackend "dist\server.js"))) {
    throw "Release does not contain backend\dist\server.js"
  }

  Copy-Item -LiteralPath $BackendEnv -Destination (Join-Path $ReleaseBackend ".env")

  Push-Location $ReleaseBackend
  try {
    Invoke-NativeCommand $NpmExe @("ci", "--omit=dev", "--ignore-scripts")
  } finally {
    Pop-Location
  }

  & "$PSScriptRoot\backup-textura.ps1" `
    -AppDir $ReleasePath `
    -BackupRoot $BackupRoot `
    -Mode "predeploy"

  & "$PSScriptRoot\run-migrations.ps1" -AppDir $ReleasePath

  Set-BackendService -Slot $targetSlot -BackendPath $ReleaseBackend
  $targetHealthUrl = "http://127.0.0.1:$($targetSlot.Port)/health/ready"
  Wait-ForHealthyEndpoint `
    -Url $targetHealthUrl `
    -ExpectedRelease $ReleaseId `
    -ExpectedSlot $targetSlotName | Out-Null

  Switch-Proxy -Slot $targetSlot
  $proxySwitched = $true
  Wait-ForHealthyEndpoint `
    -Url $PublicHealthUrl `
    -ExpectedRelease $ReleaseId `
    -ExpectedSlot $targetSlotName | Out-Null

  Invoke-NativeCommand $NssmExe @("set", [string]$targetSlot.Service, "Start", "SERVICE_AUTO_START")

  Save-DeploymentState @{
    activeSlot = $targetSlotName
    releaseId = $ReleaseId
    previousSlot = $currentSlotName
    previousReleaseId = if ($state) { [string]$state.releaseId } else { $null }
    deployedAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  if ($currentSlot) {
    Write-Host "Draining $currentSlotName for $DrainSeconds seconds."
    Start-Sleep -Seconds $DrainSeconds
    Stop-BackendService -Slot $currentSlot
    Invoke-NativeCommand $NssmExe @("set", [string]$currentSlot.Service, "Start", "SERVICE_DEMAND_START")
  }

  $protected = @($ReleaseId)
  if ($state -and $state.releaseId) { $protected += [string]$state.releaseId }
  Remove-ExpiredReleases -ProtectedReleaseIds $protected

  $result.status = "succeeded"
  $result.completedAt = (Get-Date).ToUniversalTime().ToString("o")
  Write-Host "Production deployment succeeded: $ReleaseId ($targetSlotName)"
} catch {
  $result.status = "failed"
  $result.error = $_.Exception.Message
  $result.rollback = $proxySwitched -and $null -ne $currentSlot

  Write-Warning "Deployment failed: $($_.Exception.Message)"

  if ($proxySwitched -and $currentSlot) {
    Write-Warning "Rolling Caddy back to $($currentSlot.Name)."
    try {
      Invoke-NativeCommand $NssmExe @("start", [string]$currentSlot.Service)
      Wait-ForHealthyEndpoint `
        -Url "http://127.0.0.1:$($currentSlot.Port)/health/ready" | Out-Null
      Switch-Proxy -Slot $currentSlot
      Wait-ForHealthyEndpoint -Url $PublicHealthUrl | Out-Null
    } catch {
      $result.rollbackError = $_.Exception.Message
      Write-Warning "Automatic rollback also failed: $($_.Exception.Message)"
    }
  }

  if ($targetSlot) {
    Stop-BackendService -Slot $targetSlot
  }

  throw
} finally {
  $result.finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultFile -Encoding UTF8
  if ($transcriptStarted) { Stop-Transcript | Out-Null }
}
