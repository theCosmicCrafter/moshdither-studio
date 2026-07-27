#!/usr/bin/env pwsh
# Secret-scanning pre-commit hook for MoshDither Studio (Windows).
#
# Invoked by .git/hooks/pre-commit. Scans the files staged for commit with
# TruffleHog and blocks the commit if a *verified* live credential is found.
#
# "Verified" is TruffleHog's distinguishing feature: rather than only pattern
# matching, it calls the issuing provider to check whether a candidate
# credential actually works. --only-verified therefore reports real leaks and
# almost no noise, which is what makes it safe to block a commit on.
#
# Design notes, all of which were bugs in the previous version of this file:
#
#   1. The binary is found in more than one place. It lives in the shared
#      CascadeProjects\tools directory, not in this repo, so a hardcoded
#      "$repoRoot\tools" never resolved and the hook skipped on every commit.
#   2. This fails CLOSED. A security gate that passes silently when its scanner
#      is missing is worse than no gate at all: it produces a green signal that
#      nobody checks. If TruffleHog cannot be found the commit is blocked and
#      the message says exactly how to proceed.
#   3. It scans the STAGED FILES, not the whole repository. A filesystem scan of
#      this repo would traverse node_modules, references and sam3_env -- roughly
#      6.5 GB -- on every commit. Scanning the staged set takes seconds.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "Running TruffleHog secret scan..." -ForegroundColor Cyan

# Deliberate, visible opt-out. Unlike a silent skip, using this is a choice the
# developer makes and sees.
if ($env:MOSHDITHER_SKIP_SECRET_SCAN -eq "1") {
    Write-Host "MOSHDITHER_SKIP_SECRET_SCAN=1 -- secret scan deliberately skipped." -ForegroundColor Yellow
    exit 0
}

# Resolve the binary: repo-local first, then the shared tools directory beside
# the repo, then anything already on PATH.
$candidates = @(
    (Join-Path $repoRoot "tools\trufflehog.exe"),
    (Join-Path (Split-Path -Parent $repoRoot) "tools\trufflehog.exe")
)
$trufflehog = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $trufflehog) {
    $onPath = Get-Command trufflehog -ErrorAction SilentlyContinue
    if ($onPath) { $trufflehog = $onPath.Source }
}

if (-not $trufflehog) {
    Write-Host ""
    Write-Host "COMMIT BLOCKED -- TruffleHog not found." -ForegroundColor Red
    Write-Host "Looked in:" -ForegroundColor Red
    foreach ($c in $candidates) { Write-Host "  $c" -ForegroundColor Red }
    Write-Host "  (and PATH)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fix it:      winget install trufflesecurity.trufflehog" -ForegroundColor Yellow
    Write-Host "             ...or drop trufflehog.exe into $repoRoot\tools\" -ForegroundColor Yellow
    Write-Host "Bypass once: git commit --no-verify" -ForegroundColor Yellow
    Write-Host "Bypass all:  `$env:MOSHDITHER_SKIP_SECRET_SCAN=1" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This blocks rather than skips on purpose. A gate that passes when" -ForegroundColor Yellow
    Write-Host "its scanner is missing is a gate nobody notices is broken." -ForegroundColor Yellow
    exit 1
}

# Only files being committed. Excludes deletions -- there is nothing to scan in a
# file that is going away.
$staged = @(git diff --cached --name-only --diff-filter=ACM)
if ($staged.Count -eq 0) {
    Write-Host "No staged files to scan." -ForegroundColor Green
    exit 0
}

$paths = @()
foreach ($f in $staged) {
    $full = Join-Path $repoRoot $f
    if (Test-Path $full -PathType Leaf) { $paths += $full }
}
if ($paths.Count -eq 0) {
    Write-Host "No staged files to scan." -ForegroundColor Green
    exit 0
}

Write-Host "Scanning $($paths.Count) staged file(s)..." -ForegroundColor Cyan

# --no-update stops the binary reaching out for a version check on every commit.
#
# stderr is deliberately not redirected. TruffleHog writes its banner and progress
# there, and piping it into PowerShell turns ordinary output into NativeCommandError
# records that look like the hook itself failed.
& $trufflehog filesystem @paths --only-verified --fail --no-update

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SECRET DETECTED -- commit blocked." -ForegroundColor Red
    Write-Host "TruffleHog verified this credential against its provider, so it is" -ForegroundColor Red
    Write-Host "live rather than a pattern match. Rotate it before doing anything else:" -ForegroundColor Red
    Write-Host "removing it from the file does not revoke it, and it is already in" -ForegroundColor Red
    Write-Host "your local history." -ForegroundColor Red
    Write-Host ""
    Write-Host "If it is genuinely a false positive: git commit --no-verify" -ForegroundColor Yellow
    exit 1
}

Write-Host "No verified secrets found." -ForegroundColor Green
exit 0
