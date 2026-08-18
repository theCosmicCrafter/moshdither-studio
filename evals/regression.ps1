# MoshDither Studio — Regression Gate
#
# Runs every local gate and exits non-zero if any fail. These gates are the
# only real signal on this project: GitHub Actions never runs (free plan, no
# billing), so a green PR page means nothing.
#
# Usage: pwsh -File evals/regression.ps1 [-Quick] [-Verbose]
#          -Quick  skip the slow Rust release build
#
# Design notes, both learned the hard way:
#
#   * Failing output is ALWAYS printed. The previous version captured each
#     step's output into a variable and only surfaced it under -Verbose, so a
#     failure read "FAIL: exited with code 1" with no diagnostic attached and
#     you had to re-run the command by hand to learn anything.
#
#   * The Rust side is gated here. Every bug found in the 2026-08-17 audit --
#     a total video-export regression, a filename sanitizer that emitted
#     illegal Windows paths, and a sweep harness feeding effects degenerate
#     parameters -- was in Rust, which this script did not touch at all.

param(
    [switch]$Quick,
    [switch]$Verbose
)

$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot

$manifest = "src-tauri/Cargo.toml"

# Ordered cheapest-first so a broken tree fails in seconds, not minutes.
$gates = @(
    @{ Name = "tsc";           Desc = "TypeScript type-check";      Run = { & npx tsc --noEmit 2>&1 } }
    @{ Name = "lint";          Desc = "ESLint";                     Run = { & npm run lint 2>&1 } }
    @{ Name = "cargo-fmt";     Desc = "Rust formatting";            Run = { & cargo fmt --manifest-path $manifest --check 2>&1 } }
    @{ Name = "vitest";        Desc = "Front-end unit tests";       Run = { & npx vitest run 2>&1 } }
    @{ Name = "cargo-clippy";  Desc = "Rust lints (-D warnings)";   Run = { & cargo clippy --manifest-path $manifest --all-targets -- -D warnings 2>&1 } }
    @{ Name = "cargo-test";    Desc = "Rust tests";                 Run = { & cargo test --manifest-path $manifest 2>&1 } }
    @{ Name = "build";         Desc = "Front-end production build"; Run = { & npm run build 2>&1 } }
)

if (-not $Quick) {
    # Builds the binary the real-backend E2E suite runs against. That suite now
    # refuses to run if this binary is older than the newest .rs, so a skipped
    # or silently-failed build here surfaces there instead of passing green.
    $gates += @{ Name = "cargo-build"; Desc = "mosh-verify release binary"; Run = { & cargo build --release --bin mosh-verify --manifest-path $manifest 2>&1 } }
}

Write-Host ""
Write-Host "=== MoshDither Studio — Regression Gate ===" -ForegroundColor Cyan
Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  |  $($gates.Count) gates$(if ($Quick) { '  (quick: release build skipped)' })"
Write-Host ""

$failures = @()
$i = 0
foreach ($gate in $gates) {
    $i++
    $label = "[{0}/{1}] {2}" -f $i, $gates.Count, $gate.Desc
    Write-Host ("{0,-46}" -f $label) -NoNewline -ForegroundColor Yellow

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $output = & $gate.Run
    $code = $LASTEXITCODE
    $sw.Stop()
    $secs = "{0,5:N1}s" -f $sw.Elapsed.TotalSeconds

    if ($code -ne 0) {
        Write-Host "FAIL  $secs" -ForegroundColor Red
        $failures += [pscustomobject]@{ Name = $gate.Name; Code = $code; Output = $output }
    } else {
        Write-Host "pass  $secs" -ForegroundColor Green
        if ($Verbose) { $output | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
    }
}

Write-Host ""
if ($failures.Count -eq 0) {
    Write-Host "=========================================================" -ForegroundColor Green
    Write-Host "  ALL $($gates.Count) GATES PASSED" -ForegroundColor Green
    Write-Host "=========================================================" -ForegroundColor Green
    Pop-Location
    exit 0
}

# Loud, unmissable, and carrying the actual diagnosis -- not just an exit code.
Write-Host "#########################################################" -ForegroundColor Red
Write-Host "#                                                       #" -ForegroundColor Red
Write-Host "#   GATE FAILED  --  DO NOT COMMIT                      #" -ForegroundColor Red
Write-Host "#                                                       #" -ForegroundColor Red
Write-Host "#########################################################" -ForegroundColor Red
Write-Host ""
Write-Host "Failed: $($failures.Name -join ', ')" -ForegroundColor Red

foreach ($f in $failures) {
    Write-Host ""
    Write-Host ("--- {0} (exit {1}) {2}" -f $f.Name, $f.Code, ("-" * 28)) -ForegroundColor Red
    $lines = @($f.Output)
    $tail = if ($lines.Count -gt 40) { $lines[-40..-1] } else { $lines }
    if ($lines.Count -gt 40) {
        Write-Host "  ... $($lines.Count - 40) earlier lines omitted; re-run with -Verbose for all" -ForegroundColor DarkGray
    }
    $tail | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "#########################################################" -ForegroundColor Red
Write-Host "#   $($failures.Count) GATE(S) FAILED                                  #" -ForegroundColor Red
Write-Host "#########################################################" -ForegroundColor Red
Pop-Location
exit 1
