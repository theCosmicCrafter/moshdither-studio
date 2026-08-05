# MoshDither Studio — Checkpoint
# Tags current commit, snapshots eval results, logs compensating actions.
# Usage: pwsh -File scripts/checkpoint.ps1 [-Message "before SAM3 refactor"]

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$branch = (git rev-parse --abbrev-ref HEAD 2>&1).Trim()
$safeBranch = $branch -replace '[/\\]', '-'
$tagName = "checkpoint/$timestamp-$safeBranch"

Write-Host "`n=== MoshDither Studio — Checkpoint ===" -ForegroundColor Cyan
Write-Host "Branch:    $branch"
Write-Host "Tag:       $tagName"
Write-Host "Timestamp: $timestamp"

# Stage and commit any pending changes
$status = git status --porcelain 2>&1
if (-not [string]::IsNullOrWhiteSpace($status)) {
    Write-Host "`nStaging uncommitted changes..." -ForegroundColor Yellow
    git add -A
    $commitMsg = if ($Message) { "checkpoint: $Message" } else { "checkpoint: $timestamp" }
    git commit -m $commitMsg 2>&1 | Out-Null
    Write-Host "  Committed: $commitMsg" -ForegroundColor Green
}

# Create the checkpoint tag
$tagMsg = if ($Message) { "Checkpoint: $Message" } else { "Checkpoint at $timestamp on $branch" }
git tag -a $tagName -m $tagMsg 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Tagged: $tagName" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Tag creation failed" -ForegroundColor Red
}

# Snapshot eval results if any exist
$evalsDir = Join-Path $PSScriptRoot ".." "evals"
$snapshotDir = Join-Path $evalsDir "snapshots"
if (-not (Test-Path $snapshotDir)) {
    New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
}

$snapshotFile = Join-Path $snapshotDir "$timestamp.json"
$snapshot = @{
    checkpoint = $tagName
    branch = $branch
    timestamp = $timestamp
    commit = (git rev-parse HEAD 2>&1).Trim()
    message = $Message
    tests = @{
        vitest = "pending"
        tsc = "pending"
        build = "pending"
    }
}
$snapshot | ConvertTo-Json -Depth 4 | Set-Content $snapshotFile -Encoding UTF8
Write-Host "  Snapshot: $snapshotFile" -ForegroundColor Green

# Log compensating actions placeholder
$compensatingLog = Join-Path $evalsDir "compensating-actions.log"
$logEntry = "[$timestamp] checkpoint=$tagName branch=$branch commit=$($snapshot.commit)"
if ($Message) { $logEntry += " msg=`"$Message`"" }
Add-Content $compensatingLog $logEntry -Encoding UTF8
Write-Host "  Log: $compensatingLog"

Write-Host "`n=== Checkpoint Complete ===" -ForegroundColor Green
Write-Host "  Restore with: git checkout $tagName`n"
