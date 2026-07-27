# Automated Local & Remote Branch Pruner
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "🔍 Fetching latest branch status and pruning deleted remotes..." -ForegroundColor Cyan
git fetch --prune

$mergedBranches = git branch --merged master | Where-Object { $_ -notmatch '\* master' -and $_ -notmatch 'master' } | ForEach-Object { $_.Trim() }

if ($mergedBranches) {
    Write-Host "🧹 Deleting local branches merged into master:" -ForegroundColor Yellow
    foreach ($branch in $mergedBranches) {
        if ($branch) {
            Write-Host "  - Deleting $branch" -ForegroundColor Gray
            git branch -d $branch
        }
    }
} else {
    Write-Host "✅ No merged local branches to delete." -ForegroundColor Green
}

Write-Host "✨ Repository branch state is clean and up to date!" -ForegroundColor Green
