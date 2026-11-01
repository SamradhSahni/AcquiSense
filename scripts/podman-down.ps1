<#
.SYNOPSIS
  AcquiSense - Podman Teardown Script for Windows (PowerShell)
.DESCRIPTION
  Stops and cleans up all AcquiSense containers, networks, and pods.
#>

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping AcquiSense Podman services..." -ForegroundColor Cyan

Set-Location (Join-Path $PSScriptRoot "..")

# Check if podman compose works
try {
    podman compose -f podman-compose.yml down
} catch {
    podman-compose -f podman-compose.yml down
}

Write-Host "[OK] All AcquiSense Podman containers stopped." -ForegroundColor Green
