# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please email the maintainers directly
instead of opening a public issue.

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Scope

This project is a desktop creative tool. Security concerns primarily involve:

- File system access (image/video I/O)
- Network access (only for downloading SAM3 models on user request)
- FFmpeg sidecar execution

## Security Toolchain

This project implements a comprehensive security stack with multi-layer scanning:

### Pre-Commit Hooks (.pre-commit-config.yaml)

- **gitleaks** - Secret detection in staged files
- **detect-secrets** - Baseline-aware secret scanning
- **semgrep** - Multi-language SAST (OWASP Top 10, secrets, security audit)
- **bandit** - Python-specific SAST
- **njsscan** - Node.js/JavaScript SAST
- **pip-audit** - Python dependency CVE scanning

Install: `pip install pre-commit && pre-commit install`

### CI/CD Pipeline (.github/workflows/security.yml)

- **Semgrep** - Full SAST with SARIF upload
- **CodeQL** - Semantic analysis for Python and JavaScript
- **TruffleHog** - Full git history secret scanning
- **Snyk Code** - AI-powered SAST
- **Bandit** - Python SAST with SARIF output
- **Trivy** - Dependency and container scanning

### Local Tools (tools/)

- **scan-gate.ps1** - Pre-push security gate (Semgrep + Gitleaks + Bandit + njsscan)
- **sarif-digest.py** - Multi-tool SARIF aggregator
- **mcp-security.py** - MCP server exposing scanners as tools (localhost:9991)

### Agent Skills (.codeium/windsurf/skills/security/)

- **security-scan** - Multi-tool scan pipeline execution
- **vuln-triage** - Finding classification (CONFIRMED/FALSE-POSITIVE/NEEDS-CONTEXT)
- **sast-fix** - Minimal secure fix generation
- **secret-gate** - Pre-commit secret detection
- **best-skill** - Security-aware code generation guidelines

### IDE Extensions (.vscode/extensions.json)

- Semgrep, Snyk Security, SonarLint (inline SAST)
- GitLens, Error Lens, SARIF Explorer
- GitHub Advanced Security, DotENV

### Secrets Management

- **.secrets.baseline** - detect-secrets baseline
- **.gitleaks.toml** - Custom gitleaks rules (if needed)
- GitHub Secret Scanning enabled on repository

## Secure Development Guidelines

### Code Generation

Before writing code that touches user input, DB queries, file paths, subprocess, or crypto:

1. Check taint flow from untrusted input to dangerous sinks
2. Never hardcode secrets - use environment variables
3. Use parameterized queries - never string concat for SQL
4. Use `subprocess.run(list, shell=False)` - never shell=True with user data
5. Canonicalize paths with `realpath + starts_with` check before open()
6. Use argon2id for password hashing - never MD5/SHA1
7. Use AES-256-GCM with random IV for encryption - never ECB mode

### After Generation

Emit audit comment: `# SECURITY: [CLEAN | REVIEW: <concern>] - [vuln type if flagged]`

### Commit Workflow

1. Stage changes: `git add .`
2. Run local gate: `.\tools\scan-gate.ps1`
3. If clean, commit: `git commit -m "..."`
4. Pre-commit hooks run automatically
5. Push triggers CI security pipeline
