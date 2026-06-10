#!/usr/bin/env pwsh
# Secret scanner pre-commit hook for MoshDither Studio (Windows)
# Copy this to .git/hooks/pre-commit.ps1 and update .git/hooks/pre-commit to call it.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$trufflehog = Join-Path (Join-Path $repoRoot "tools") "trufflehog.exe"

Write-Host ""
Write-Host "Running TruffleHog secret scan..." -ForegroundColor Cyan

if (-not (Test-Path $trufflehog)) {
    Write-Host "TruffleHog not found at $trufflehog" -ForegroundColor Yellow
    Write-Host "Skipping secret scan. Run 'npm run secret-scan' manually." -ForegroundColor Yellow
    exit 0
}

& $trufflehog filesystem "$repoRoot" --only-verified --fail
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SECRET DETECTED! Commit blocked." -ForegroundColor Red
    Write-Host "Review the findings above. If it's a false positive, use --no-verify to bypass." -ForegroundColor Red
    exit 1
}

Write-Host "No secrets found. Proceeding with commit." -ForegroundColor Green
