# CLAUDE.md — MoshDither Studio (IDE-Specific Agent Rules)

# This file mirrors AGENTS.md for Claude Code / Windsurf / IDE agents.
# For the full governance rulebook, see AGENTS.md.

## Project

Desktop creative tool combining image/video processing with AI-powered
segmentation (SAM3). Rust + Tauri v2 backend, React + Vite frontend,
Python SAM3 bridge, FFmpeg/FFglitch sidecars.

## Quick Reference

| Task | Command |
|------|---------|
| Dev server | `npm run tauri:dev` |
| Build | `npm run build` |
| Type-check | `npx tsc --noEmit` |
| Unit tests | `npm run test` |
| E2E tests | `npm run test:e2e` |
| Lint | `npm run lint` |
| Secret scan | `npm run secret-scan` |
| Checkpoint | `pwsh scripts/checkpoint.ps1` |
| Regression | `pwsh evals/regression.ps1` |

## Before Coding

1. Read `AGENTS.md` for full governance rules
2. Read `docs/structure.md` for naming conventions
3. Read `docs/ARCHITECTURE.md` for stack overview
4. Check `SECURITY.md` for active security toolchain

## Security — Always Active

Before writing code touching: user input, file paths, subprocess calls,
or crypto — apply `/security-scan` patterns mentally.

Before commit: run `/secret-gate`.

Never suppress scanner findings without explicit comment and user sign-off.

### Security Stack

- **Pre-commit**: `.pre-commit-config.yaml` — gitleaks, detect-secrets, semgrep, bandit
- **CI/CD**: `.github/workflows/security.yml` — Semgrep, CodeQL, TruffleHog, Snyk
- **Local gate**: `../tools/scan-gate.ps1`

## Key Rules

- Never commit `.env` files or hardcoded secrets
- Feature branches only — never push to main directly
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Create checkpoint before modifying Rust code
- If build/test fails 3 times, stop and escalate
- Instruction budget: AGENTS.md stays under 300 lines
