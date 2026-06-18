# scan-gate.ps1
# Run from project root before any commit
# Exits 0 = clean, nonzero = findings -> blocked

param(
  [string]$Path = ".",
  [switch]$SkipSecrets,
  [switch]$SkipDeps,
  [switch]$JsonReport
)

$ErrorCount = 0
$Report = @{
  timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  project = "moshdither-studio"
}

Write-Host "[SCAN-GATE] Starting security scan..." -ForegroundColor Cyan

# ── SEMGREP ──────────────────────────────────────────────────────
Write-Host "[1/5] Semgrep multi-lang SAST..." -ForegroundColor Yellow
$semgrepOut = semgrep scan `
    --config=p/owasp-top-ten `
    --config=p/secrets `
    --severity=ERROR `
    --json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  X Semgrep: findings detected" -ForegroundColor Red
    $ErrorCount++
    $Report["semgrep"] = "FAIL"
} else {
    Write-Host "  + Semgrep: clean" -ForegroundColor Green
    $Report["semgrep"] = "PASS"
}

# ── GITLEAKS ─────────────────────────────────────────────────────
if (-not $SkipSecrets) {
    Write-Host "[2/5] Gitleaks secret scan..." -ForegroundColor Yellow
    gitleaks detect --source $Path --exit-code 1 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  X Gitleaks: secrets detected" -ForegroundColor Red
        $ErrorCount++
        $Report["gitleaks"] = "FAIL"
    } else {
        Write-Host "  + Gitleaks: no secrets" -ForegroundColor Green
        $Report["gitleaks"] = "PASS"
    }
}

# ── BANDIT (Python) ───────────────────────────────────────────────
if (Test-Path "requirements.txt" -or Test-Path "pyproject.toml") {
    Write-Host "[3/5] Bandit Python SAST..." -ForegroundColor Yellow
    python -m bandit -r $Path -ll -x tests/,venv/,sam3_env/,audit_venv/ -f json -o bandit-report.json 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  X Bandit: HIGH+ findings" -ForegroundColor Red
        $ErrorCount++
        $Report["bandit"] = "FAIL"
    } else {
        Write-Host "  + Bandit: clean" -ForegroundColor Green
        $Report["bandit"] = "PASS"
    }
}

# ── njsscan (JS/TS) ───────────────────────────────────────────────
if (Test-Path "package.json") {
    Write-Host "[4/5] njsscan Node/JS SAST..." -ForegroundColor Yellow
    njsscan --exit-warning $Path 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  X njsscan: findings" -ForegroundColor Red
        $ErrorCount++
        $Report["njsscan"] = "FAIL"
    } else {
        Write-Host "  + njsscan: clean" -ForegroundColor Green
        $Report["njsscan"] = "PASS"
    }
}

# ── SCA DEPS ─────────────────────────────────────────────────────
if (-not $SkipDeps) {
    Write-Host "[5/5] Dependency CVE check..." -ForegroundColor Yellow
    if (Test-Path "requirements.txt") {
        pip-audit --desc --progress-spinner=off 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ! pip-audit: vulnerable deps" -ForegroundColor Yellow
        }
    }
    if (Test-Path "package.json") {
        npm audit --audit-level=high 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ! npm audit: HIGH+ CVEs" -ForegroundColor Yellow
        }
    }
}

# ── SUMMARY ──────────────────────────────────────────────────────
Write-Host ""
if ($ErrorCount -eq 0) {
    Write-Host "O SCAN-GATE: CLEAN - $ErrorCount issues" -ForegroundColor Green
    if ($JsonReport) {
        $Report | ConvertTo-Json -Depth 3 | Out-File -FilePath "scan-report.json"
    }
    exit 0
} else {
    Write-Host "X SCAN-GATE: BLOCKED - $ErrorCount scanner(s) flagged findings" -ForegroundColor Red
    Write-Host "   Fix findings or add documented suppressions before committing." -ForegroundColor Red
    if ($JsonReport) {
        $Report | ConvertTo-Json -Depth 3 | Out-File -FilePath "scan-report.json"
    }
    exit 1
}
