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
    # The git tag carries a leading "v" (v3.97.0) but the release asset filename
    # does not (trufflehog_3.97.0_windows_amd64.tar.gz). Interpolating the tag
    # into both halves produced a 404, so the download always failed, the binary
    # was never installed, and the pre-commit secret gate could not run at all.
    $version = $latest -replace '^v', ''
    $base = "https://github.com/trufflesecurity/trufflehog/releases/download/$latest"
    $asset = "trufflehog_${version}_windows_amd64.tar.gz"
    $tmp = [System.IO.Path]::GetTempFileName() + ".tar.gz"
    Invoke-WebRequest -Uri "$base/$asset" -OutFile $tmp

    # This archive is unpacked and then executed on every commit, so verify it
    # against the checksums the release publishes before trusting it. Without
    # this a substituted or tampered asset would run with the developer's
    # privileges, and the extracted binary is gitignored so it never gets
    # reviewed. Note this authenticates the download against GitHub's release
    # metadata only; it is not a signature check against TruffleHog's signing
    # key (the .sig/.pem cosign bundle beside it would be needed for that).
    # -UseBasicParsing hands back a Byte[] for text/plain here, not a string, so
    # decode before splitting or the line match silently finds nothing.
    $raw = (Invoke-WebRequest -Uri "$base/trufflehog_${version}_checksums.txt" -UseBasicParsing).Content
    $sums = if ($raw -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($raw) } else { $raw }
    $expected = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($asset) } |
        Select-Object -First 1) -split '\s+' | Select-Object -First 1
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
    if (-not $expected) {
        & $abort "No checksum published for $asset -- refusing to install."
    }
    $actual = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash
    if ($actual -ne $expected.ToUpper()) {
        & $abort "Checksum mismatch for $asset. Expected $expected, got $actual. Refusing to install."
    }
    Write-Host "Checksum verified ($expected)." -ForegroundColor Green

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
