#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Secret scanner for MoshDither Studio using TruffleHog.

.DESCRIPTION
    Scans the repository for leaked secrets, API keys, passwords,
    and other sensitive data before commits or during CI.

.EXAMPLE
    .\scripts\secret-scan.ps1
    .\scripts\secret-scan.ps1 --history   # scan full git history
#>
param(
    [switch]$History,
    [switch]$OnlyVerified,
    [string]$SinceCommit = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

# Resolve the binary before offering to download one. It normally lives in the
# shared CascadeProjects\tools directory rather than in this repo -- assuming
# repo-local only is what made the pre-commit hook silently skip on every commit.
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
    $trufflehog = $candidates[0]
    New-Item -ItemType Directory -Force -Path (Split-Path $trufflehog) | Out-Null
    Write-Host "TruffleHog not found in tools directories or on PATH." -ForegroundColor Yellow
    Write-Host "Downloading (~170 MB)..." -ForegroundColor Yellow
    $latest = (Invoke-RestMethod "https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest").tag_name
    $url = "https://github.com/trufflesecurity/trufflehog/releases/download/$latest/trufflehog_${latest}_windows_amd64.tar.gz"
    $tmp = [System.IO.Path]::GetTempFileName() + ".tar.gz"
    Invoke-WebRequest -Uri $url -OutFile $tmp
    tar -xzf $tmp -C (Split-Path $trufflehog)
    Remove-Item $tmp
    Write-Host "TruffleHog installed: $trufflehog" -ForegroundColor Green
}

if ($History) {
    # No --since-commit by default. Deleting a key from a file does not remove
    # it from the commit that introduced it, so a bounded scan can call a
    # repository clean while the credential is still readable in history. If you
    # are checking whether you ever leaked something, you want all of it.
    Write-Host "Scanning full git history..." -ForegroundColor Cyan
    $scanArgs = @("git", "file://$repoRoot", "--no-update")
    if ($OnlyVerified) { $scanArgs += "--only-verified" }
    if ($SinceCommit) { $scanArgs += "--since-commit=$SinceCommit" }
    & $trufflehog @scanArgs
}
else {
    # Vendored and generated trees are excluded deliberately: references/ is
    # ~1 GB of third-party repositories and sam3_env ~5 GB of Python packages.
    # Anything found in them is someone else's test fixture, and including them
    # turns a short scan into a very long one.
    $exclude = @("node_modules", "references", "sam3_env", "audit_venv", "sam3_repo",
                 "target", "dist", "test-results", "playwright-report", "recycling",
                 "models", "outputs")
    $excludeFile = Join-Path ([System.IO.Path]::GetTempPath()) "moshdither-secret-scan-exclude.txt"
    $exclude | ForEach-Object { "$_/" } | Set-Content -Path $excludeFile -Encoding UTF8

    Write-Host "Scanning working tree (excluding vendored and build directories)..." -ForegroundColor Cyan
    $scanArgs = @("filesystem", "$repoRoot", "--only-verified", "--no-update",
                  "--exclude-paths", $excludeFile)
    & $trufflehog @scanArgs
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nSECRET DETECTED! Commit blocked." -ForegroundColor Red
    Write-Host "Review the findings above. If it's a false positive, contact a maintainer." -ForegroundColor Red
    exit 1
}

Write-Host "`nNo secrets detected. Clean!" -ForegroundColor Green
