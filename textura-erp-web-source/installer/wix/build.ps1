$ErrorActionPreference = "Stop"

# Navigate to the root of the project to read package.json
$rootDir = (Resolve-Path "..\..").Path
$packageJsonPath = Join-Path $rootDir "package.json"

if (!(Test-Path $packageJsonPath)) {
    Write-Error "Cannot find package.json at $packageJsonPath"
}

# Extract the version from package.json
$packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
$version = $packageJson.version

Write-Host "Building MSI for Textura ERP version $version..." -ForegroundColor Cyan

# Check if win-unpacked exists
$unpackedDir = Join-Path $rootDir "release\electron\win-unpacked"
if (!(Test-Path $unpackedDir)) {
    Write-Error "The directory $unpackedDir does not exist. Please run 'npm run desktop:build' first."
}

# Ensure WiX is installed
if (!(Get-Command wix -ErrorAction SilentlyContinue)) {
    Write-Host "WiX Toolset v4/v5 is not installed." -ForegroundColor Yellow
    Write-Host "Installing WiX globally via dotnet..." -ForegroundColor Cyan
    dotnet tool install --global wix
}

$outputFile = "Textura-ERP-Setup-$version.msi"

# Execute the modern WiX build command
Write-Host "Executing wix build..." -ForegroundColor Cyan
wix build -d Version="$version" Package.wxs -o $outputFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! MSI generated at: $PWD\$outputFile" -ForegroundColor Green
} else {
    Write-Error "WiX build failed."
}
