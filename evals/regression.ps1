# MoshDither Studio — Eval Regression Gate
# Runs all eval suite tests and exits non-zero if any fail.
# Usage: pwsh -File evals/regression.ps1

param(
    [string]$SuiteDir = (Join-Path $PSScriptRoot "suite"),
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== MoshDither Studio — Eval Regression Gate ===" -ForegroundColor Cyan
Write-Host "Suite directory: $SuiteDir"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"

# ------------------------------------------------------------------
# 1. Unit tests (Vitest)
# ------------------------------------------------------------------
Write-Host "[1/3] Running Vitest unit tests..." -ForegroundColor Yellow
$vitestResult = & npx vitest run --reporter=verbose 2>&1
$vitestExit = $LASTEXITCODE
if ($vitestExit -ne 0) {
    Write-Host "  FAIL: Vitest exited with code $vitestExit" -ForegroundColor Red
} else {
    Write-Host "  PASS: All Vitest tests passed" -ForegroundColor Green
}

# ------------------------------------------------------------------
# 2. TypeScript type-check
# ------------------------------------------------------------------
Write-Host "`n[2/3] Running TypeScript type-check..." -ForegroundColor Yellow
$tscResult = & npx tsc --noEmit 2>&1
$tscExit = $LASTEXITCODE
if ($tscExit -ne 0) {
    Write-Host "  FAIL: tsc --noEmit exited with code $tscExit" -ForegroundColor Red
    if ($Verbose) { $tscResult | ForEach-Object { Write-Host "    $_" } }
} else {
    Write-Host "  PASS: No type errors" -ForegroundColor Green
}

# ------------------------------------------------------------------
# 3. Production build
# ------------------------------------------------------------------
Write-Host "`n[3/3] Running production build..." -ForegroundColor Yellow
$buildResult = & npm run build 2>&1
$buildExit = $LASTEXITCODE
if ($buildExit -ne 0) {
    Write-Host "  FAIL: npm run build exited with code $buildExit" -ForegroundColor Red
    if ($Verbose) { $buildResult | ForEach-Object { Write-Host "    $_" } }
} else {
    Write-Host "  PASS: Production build succeeded" -ForegroundColor Green
}

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
$failures = @()
if ($vitestExit -ne 0) { $failures += "vitest" }
if ($tscExit -ne 0) { $failures += "tsc" }
if ($buildExit -ne 0) { $failures += "build" }

Write-Host "`n=== Results ===" -ForegroundColor Cyan
if ($failures.Count -gt 0) {
    Write-Host "FAILED gates: $($failures -join ', ')" -ForegroundColor Red
    exit 1
} else {
    Write-Host "ALL GATES PASSED" -ForegroundColor Green
    exit 0
}
