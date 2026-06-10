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
$trufflehog = Join-Path (Join-Path $repoRoot "tools") "trufflehog.exe"

if (-not (Test-Path $trufflehog)) {
    Write-Host "TruffleHog not found. Downloading..." -ForegroundColor Yellow
    $latest = (Invoke-RestMethod "https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest").tag_name
    $url = "https://github.com/trufflesecurity/trufflehog/releases/download/$latest/trufflehog_${latest}_windows_amd64.tar.gz"
    $tmp = [System.IO.Path]::GetTempFileName() + ".tar.gz"
    Invoke-WebRequest -Uri $url -OutFile $tmp
    tar -xzf $tmp -C (Split-Path $trufflehog)
    Remove-Item $tmp
    Write-Host "TruffleHog installed: $trufflehog" -ForegroundColor Green
}

if ($History) {
    Write-Host "Scanning full git history..." -ForegroundColor Cyan
    $args = @("git", "file://$repoRoot")
    if ($OnlyVerified) { $args += "--only-verified" }
    if ($SinceCommit) { $args += "--since-commit=$SinceCommit" }
    else { $args += "--since-commit=HEAD~50" }
    & $trufflehog @args
}
else {
    Write-Host "Scanning working directory..." -ForegroundColor Cyan
    $args = @("filesystem", "$repoRoot", "--only-verified")
    & $trufflehog @args
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nSECRET DETECTED! Commit blocked." -ForegroundColor Red
    Write-Host "Review the findings above. If it's a false positive, contact a maintainer." -ForegroundColor Red
    exit 1
}

Write-Host "`nNo secrets detected. Clean!" -ForegroundColor Green
