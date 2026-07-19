# CLAUDE.md — MoshDither Studio

## Project

Desktop creative tool combining image/video processing with AI-powered segmentation (SAM3). Rust + Tauri backend, React + Vite frontend, Python SAM3 bridge.

## Security — Always Active

Before writing any code that touches: user input, DB queries, file paths, subprocess calls, or crypto operations — run `/security-scan` mentally and apply the patterns from `/sast-fix`.

Before any commit: run `/secret-gate`.

When reviewing output from CI scanners: use `/vuln-triage` to classify findings before proposing fixes.

Never suppress a scanner finding without an explicit comment and user sign-off.

### Security Stack (this project)

- **Pre-commit**: `.pre-commit-config.yaml` — gitleaks, detect-secrets, semgrep, bandit, njsscan, pip-audit
- **CI/CD**: `.github/workflows/security.yml` — Semgrep, CodeQL, TruffleHog, Snyk, Bandit, Trivy
- **Local gate**: `../tools/scan-gate.ps1` — PowerShell pre-push security gate (shared)
- **SARIF digest**: `../tools/sarif-digest.py` — Multi-tool SARIF aggregator (shared)
- **MCP bridge**: `../tools/mcp-security.py` — Scanner tools exposed on localhost:9991 (shared)
- **Skills**: global `/.codeium/windsurf/skills/security/` — security-scan, vuln-triage, sast-fix, secret-gate, best-skill (shared)

## Skills Registry

| Skill          | Path                                                         | Purpose                           |
| -------------- | ------------------------------------------------------------ | --------------------------------- |
| /security-scan | global `/.codeium/windsurf/skills/security/security-scan/SKILL.md` | Multi-tool SAST pipeline          |
| /vuln-triage   | global `/.codeium/windsurf/skills/security/vuln-triage/SKILL.md`   | Classify findings                 |
| /sast-fix      | global `/.codeium/windsurf/skills/security/sast-fix/SKILL.md`      | Generate secure fixes             |
| /secret-gate   | global `/.codeium/windsurf/skills/security/secret-gate/SKILL.md`   | Pre-commit secrets check          |
| /best-skill    | global `/.codeium/windsurf/skills/security/best-skill/SKILL.md`    | Secure code generation guidelines |

## Session Start Checklist

1. Read `SECURITY.md` for current toolchain status
2. If modifying Python/Rust/JS: consider running `../tools/scan-gate.ps1`
3. If adding dependencies: check for CVEs with pip-audit / npm audit
4. Never commit `.env` files, secret keys, or hardcoded credentials
