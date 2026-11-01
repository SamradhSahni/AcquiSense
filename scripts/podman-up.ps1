<#
.SYNOPSIS
  AcquiSense — Podman Deployment & Startup Script for Windows (PowerShell)
.DESCRIPTION
  Checks for Podman installation, validates Podman Machine state,
  and orchestrates all AcquiSense microservices using podman-compose.
#>

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       AcquiSense - Podman Platform Orchestrator          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check if podman command is available
$podmanCmd = Get-Command "podman" -ErrorAction SilentlyContinue
if (-not $podmanCmd) {
    Write-Host "`n[ERROR] Podman is not found in your system PATH." -ForegroundColor Red
    Write-Host "`nTo install Podman on Windows, choose one of the following:" -ForegroundColor Yellow
    Write-Host "  1. Winget (Podman Desktop - Recommended):" -ForegroundColor White
    Write-Host "     winget install RedHat.Podman-Desktop" -ForegroundColor Gray
    Write-Host "  2. Winget (Podman CLI only):" -ForegroundColor White
    Write-Host "     winget install RedHat.Podman" -ForegroundColor Gray
    Write-Host "  3. Chocolatey:" -ForegroundColor White
    Write-Host "     choco install podman-desktop" -ForegroundColor Gray
    Write-Host "`nAfter installing, restart your terminal and re-run this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Podman CLI detected: $(podman --version)" -ForegroundColor Green

# 2. Check Podman Machine status (WSL2 VM on Windows)
Write-Host "`nChecking Podman Machine state..." -ForegroundColor Cyan
try {
    $machineList = podman machine list --format "{{.Name}} {{.Running}}" 2>$null
    if ($machineList) {
        if ($machineList -notmatch "true") {
            Write-Host "Podman machine is currently stopped. Starting default machine..." -ForegroundColor Yellow
            podman machine start
        } else {
            Write-Host "[OK] Podman machine is running." -ForegroundColor Green
        }
    } else {
        Write-Host "No Podman machine found. Initializing new podman machine..." -ForegroundColor Yellow
        podman machine init
        podman machine start
    }
} catch {
    Write-Host "[WARNING] Could not verify podman machine. Assuming native/WSL environment." -ForegroundColor DarkYellow
}

# 3. Check for .env file
$envPath = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "[WARNING] .env file not found at $envPath. Copying from sample or creating default..." -ForegroundColor Yellow
}

# 4. Determine Compose Command (podman compose vs podman-compose)
$composeCmd = ""
try {
    podman compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $composeCmd = "podman compose"
    }
} catch {}

if (-not $composeCmd) {
    $podmanComposeTool = Get-Command "podman-compose" -ErrorAction SilentlyContinue
    if ($podmanComposeTool) {
        $composeCmd = "podman-compose"
    } else {
        Write-Host "[INFO] Standard podman compose provider not detected. Attempting 'podman compose'..." -ForegroundColor Gray
        $composeCmd = "podman compose"
    }
}

Write-Host "`nUsing Compose Engine: $composeCmd" -ForegroundColor Cyan

# 5. Launch containers using podman-compose.yml
$composeFile = Join-Path $PSScriptRoot "..\podman-compose.yml"
Write-Host "Launching AcquiSense microservices with $composeFile..." -ForegroundColor Cyan

Set-Location (Join-Path $PSScriptRoot "..")
if ($composeCmd -eq "podman compose") {
    podman compose -f podman-compose.yml up -d --build
} else {
    podman-compose -f podman-compose.yml up -d --build
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Podman build or container launch failed with exit code $LASTEXITCODE." -ForegroundColor Red
    Write-Host "Please review the container build logs above." -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "       AcquiSense Microservices Started via Podman!       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Web Dashboard:      http://localhost:5173" -ForegroundColor White
Write-Host "  Node.js API:        http://localhost:4100" -ForegroundColor White
Write-Host "  Python AI Engine:   http://localhost:8100/docs" -ForegroundColor White
Write-Host "  Grafana Telemetry:  http://localhost:3200 (admin / grafanapassword)" -ForegroundColor White
Write-Host "  Prometheus Metrics: http://localhost:9190" -ForegroundColor White
Write-Host "  MongoDB Port:       localhost:27117" -ForegroundColor White
Write-Host "  Redis Port:         localhost:6479" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
