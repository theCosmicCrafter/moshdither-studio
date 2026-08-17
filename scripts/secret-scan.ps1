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
    # Pinned rather than tracking `releases/latest`, and pinned by HASH as well
    # as by version.
    #
    # Following "latest" meant an upstream release silently changed which binary
    # ran the commit gate, and re-downloaded ~170 MB whenever it moved. Worse,
    # fetching the expected hash from the same release that serves the asset
    # only proves the download matches what that release currently claims: an
    # attacker who could replace the tarball could replace checksums.txt with
    # it, and verification would pass.
    #
    # Keeping the expected digest here instead means the trusted value lives in
    # this repository's history, where changing it is a reviewable commit rather
    # than a server-side edit. That is most of what signature verification
    # (cosign against TruffleHog's Sigstore identity) would buy, without adding
    # cosign as a second tool that would itself need bootstrapping.
    #
    # To bump: set both constants together, from the release's own checksums.txt
    # (`trufflehog_<version>_checksums.txt`), and verify the new value in the PR.
    $version = "3.97.0"
    $expected = "2A8208E6E5BE8D6CD855322480EDA4790A437F805DBD6538AD7495C27F40D4E5"

    $base = "https://github.com/trufflesecurity/trufflehog/releases/download/v$version"
    # The git tag carries a leading "v" but the asset filename does not, so the
    # two halves are built separately; interpolating the tag into both produced
    # a 404 and left the gate unable to run at all.
    $asset = "trufflehog_${version}_windows_amd64.tar.gz"
    $tmp = [System.IO.Path]::GetTempFileName() + ".tar.gz"
    Write-Host "Fetching TruffleHog $version..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "$base/$asset" -OutFile $tmp

    # Report before cleaning up, and use Write-Host rather than Write-Error:
    # $ErrorActionPreference is "Stop" at the top of this script, so Write-Error
    # would terminate immediately, making the `exit 1` unreachable and surfacing
    # the refusal as an unhandled error rather than a clean abort. The
    # Remove-Item is best-effort so a locked temp file cannot swallow the
    # message explaining why the install was refused.
    $abort = {
        param($Reason)
        Write-Host $Reason -ForegroundColor Red
        try { Remove-Item $tmp -ErrorAction SilentlyContinue } catch { }
        exit 1
    }
    $actual = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash
    if ($actual -ne $expected) {
        & $abort @"
Checksum mismatch for $asset.
  expected $expected  (pinned in scripts/secret-scan.ps1)
  actual   $actual
Refusing to install. Either the download was corrupted, or the release no
longer matches the pinned digest -- do not "fix" this by pasting in the new
hash without establishing where it came from.
"@
    }
    Write-Host "Verified against pinned digest for $version." -ForegroundColor Green

    # Resolve tar explicitly rather than trusting PATH. When this script is
    # invoked through `npm run` from a Git Bash shell, PATH puts GNU tar
    # (/usr/bin/tar) ahead of the Windows one, and GNU tar reads the leading
    # "C:" of an absolute Windows path as a remote host spec -- it fails with
    # "Cannot connect to C: resolve failed" and leaves no binary behind, so the
    # scan then dies on a missing executable.
    $sysTar = Join-Path $env:SystemRoot "System32\tar.exe"
    $tarExe = if (Test-Path $sysTar) { $sysTar } else { "tar" }
    & $tarExe -xzf $tmp -C (Split-Path $trufflehog)
    Remove-Item $tmp
    Write-Host "TruffleHog installed: $trufflehog" -ForegroundColor Green
}

if ($History) {
    # No --since-commit by default. Deleting a key from a file does not remove
    # it from the commit that introduced it, so a bounded scan can call a
    # repository clean while the credential is still readable in history. If you
    # are checking whether you ever leaked something, you want all of it.
    Write-Host "Scanning full git history..." -ForegroundColor Cyan
    # Forward slashes are required. A Windows path with backslashes in a file://
    # URI is parsed as ssh://file/... and the scan dies trying to resolve a
    # hostname called "file".
    $uri = "file://" + ($repoRoot -replace '\\', '/')
    $scanArgs = @("git", $uri, "--no-update")
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
# TruffleHog uses 183 for "findings present" and other non-zero codes for real
# failures. Treating every non-zero exit as a detection reports a scan that could
# not run as a leak, which sends you looking for a secret that was never found.
if ($LASTEXITCODE -eq 183) {
    Write-Host ""
    Write-Host "SECRETS FOUND -- review the findings above." -ForegroundColor Red
    Write-Host "Rotate anything real before removing it from the code: deleting a" -ForegroundColor Red
    Write-Host "key does not revoke it, and it stays readable in git history." -ForegroundColor Red
    exit 1
}
elseif ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SCAN FAILED (exit $LASTEXITCODE) -- this is an error, not a detection." -ForegroundColor Red
    Write-Host "Nothing was verified. Fix the error above and run it again." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "No verified secrets found." -ForegroundColor Green
Write-Host ""
Write-Host "Note: TruffleHog reports 'unverified' findings separately -- candidates" -ForegroundColor DarkGray
Write-Host "it could not confirm with the issuing provider. Those do not fail this" -ForegroundColor DarkGray
Write-Host "scan and are usually placeholders in vendored code, but a revoked or" -ForegroundColor DarkGray
Write-Host "unreachable real key would land there too. Read the output above rather" -ForegroundColor DarkGray
Write-Host "than trusting this line alone." -ForegroundColor DarkGray
