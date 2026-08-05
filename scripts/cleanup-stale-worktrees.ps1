# MoshDither Studio — Cleanup Stale Worktrees
# Removes Git worktrees older than 7 days with no uncommitted changes.
# Usage: pwsh -File scripts/cleanup-stale-worktrees.ps1 [-DryRun]

param(
    [int]$MaxAgeDays = 7,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Cleanup Stale Worktrees ===" -ForegroundColor Cyan
Write-Host "Max age: $MaxAgeDays days"
if ($DryRun) { Write-Host "(DRY RUN — no deletions)" -ForegroundColor Yellow }

$cutoff = (Get-Date).AddDays(-$MaxAgeDays)
$worktrees = git worktree list --porcelain 2>&1

$currentPath = $null
$currentBranch = $null
$removed = 0

foreach ($line in $worktrees) {
    if ($line -match "^worktree (.+)$") {
        $currentPath = $Matches[1]
        $currentBranch = $null
    }
    elseif ($line -match "^branch refs/heads/(.+)$") {
        $currentBranch = $Matches[1]
    }
    elseif ($line -eq "" -and $currentPath -and $currentBranch) {
        # Skip main worktree
        if ($currentBranch -notmatch "^session/") {
            $currentPath = $null
            $currentBranch = $null
            continue
        }

        # Check age
        if (Test-Path $currentPath) {
            $lastWrite = (Get-Item $currentPath).LastWriteTime
            if ($lastWrite -lt $cutoff) {
                # Check for uncommitted changes
                $status = git -C $currentPath status --porcelain 2>&1
                if ([string]::IsNullOrWhiteSpace($status)) {
                    Write-Host "  Removing: $currentPath (branch: $currentBranch, age: $([math]::Round(((Get-Date) - $lastWrite).TotalDays, 1))d)" -ForegroundColor Yellow
                    if (-not $DryRun) {
                        git worktree remove $currentPath --force 2>&1 | Out-Null
                        git branch -D $currentBranch 2>&1 | Out-Null
                        $removed++
                    }
                } else {
                    Write-Host "  Skipping: $currentPath (has uncommitted changes)" -ForegroundColor DarkYellow
                }
            }
        }
        $currentPath = $null
        $currentBranch = $null
    }
}

# Prune any orphaned worktree references
if (-not $DryRun) {
    git worktree prune 2>&1 | Out-Null
}

Write-Host "`nRemoved $removed stale worktree(s)" -ForegroundColor Green
