# AGENTS.md — MoshDither Studio Repository Governance Rulebook

# WHAT: Mandatory operational rules for all autonomous agents in this repo.
# WHY: Prevents context rot, instruction drift, and ungoverned modifications.
# HOW: Read this file before every session. Re-read docs/ARCHITECTURE.md and
#      docs/structure.md before editing code. Mount milestone specs JIT.

## Project

Desktop creative tool combining image/video processing with AI-powered
segmentation (SAM3). Rust + Tauri v2 backend, React + Vite frontend,
Python SAM3 bridge, FFmpeg/FFglitch sidecars.

## BUILD & VERIFY

| Gate | Command | Threshold |
|------|---------|-----------|
| Build | `npm run build` | Clean exit |
| Lint | `npm run lint` | 0 warnings |
| Type-check | `npx tsc --noEmit` | 0 errors |
| Unit Tests | `npm run test` (Vitest) | All pass |
| E2E Tests | `npm run test:e2e` (Playwright) | Critical paths pass |
| Rust Build | `cd src-tauri && cargo build` | Clean exit |
| Rust Tests | `cd src-tauri && cargo test` | All pass |
| Secret Scan | `npm run secret-scan` | 0 findings |
| Regression | `pwsh evals/regression.ps1` | All gates pass |

## SECURITY — ALWAYS ACTIVE

Before writing any code that touches: user input, file paths, subprocess
calls, or crypto operations — run `/security-scan` mentally and apply
patterns from `/sast-fix`.

Before any commit: run `/secret-gate`.

When reviewing CI scanner output: use `/vuln-triage` to classify findings
before proposing fixes. Never suppress a finding without explicit comment
and user sign-off.

### Security Stack

- **Pre-commit**: `.pre-commit-config.yaml` — gitleaks, detect-secrets, semgrep, bandit, njsscan, pip-audit
- **CI/CD**: `.github/workflows/security.yml` — Semgrep, CodeQL, TruffleHog, Snyk, Bandit, Trivy
- **Local gate**: `../tools/scan-gate.ps1` — PowerShell pre-push security gate
- **SARIF digest**: `../tools/sarif-digest.py` — Multi-tool SARIF aggregator
- **MCP bridge**: `../tools/mcp-security.py` — Scanner tools on localhost:9991

### Skills Registry

| Skill | Purpose |
|-------|---------|
| /security-scan | Multi-tool SAST pipeline |
| /vuln-triage | Classify findings |
| /sast-fix | Generate secure fixes |
| /secret-gate | Pre-commit secrets check |
| /best-skill | Secure code generation guidelines |

## SAFETY GUARDRAILS

- Never commit plaintext API keys, `.env` files, or hardcoded credentials.
- Always verify `.env.example` is updated when new secrets are introduced.
- Run secret-scan before staging files.
- Create a feature branch for every change. Never push directly to main.
- If build, test, or lint fails, perform a step-by-step reflection trace
  before re-editing. Do not retry blindly.

## INSTRUCTION BUDGET

- This file must remain under 300 lines. Do not append rules here.
- File-specific rules belong in subdirectory `**/AGENTS.md` files.
- Milestone-specific rules belong in `docs/milestones/*.md` (JIT loaded).

## DOCUMENTATION HIERARCHY

Before coding, read these docs in order:
1. `AGENTS.md` (this file) — governance rules
2. `docs/ARCHITECTURE.md` — stack and IPC flow
3. `docs/structure.md` — naming, patterns, conventions
4. `docs/PRD.md` — product requirements (as needed)
5. `docs/API_SPEC.md` — Tauri IPC contracts (as needed)
6. `docs/milestones/m<N>-*.md` — active milestone spec (JIT)

## WORKTREE POLICY

- Use `pwsh scripts/new-task.ps1 -TaskName "<name>"` to create worktrees.
- Each worktree gets a deterministic dev-server port (3100-9999).
- Per-worktree `.env` files are mandatory; never share `.env` across worktrees.
- Clean up with `pwsh scripts/cleanup-stale-worktrees.ps1` weekly.

## CHECKPOINT & ROLLBACK

- Create checkpoint before every external API call or sidecar invocation.
- Create checkpoint before modifying Rust code in `src-tauri/`.
- Log compensating actions for all external side effects.
- Command: `pwsh scripts/checkpoint.ps1 -Message "<description>"`
- If a milestone fails after 3 retries, HALT and escalate to human.

## COST CEILING

- Max 500K input + 150K output tokens per milestone.
- Max 200 MCP tool invocations per session.
- Alert at 80% consumption; circuit-break at 100%.

## HUMAN ESCALATION TRIGGERS

- Ambiguous or conflicting requirements in `/docs`.
- Missing IPC commands or unmapped Rust effect implementations.
- Continuous test/build failures after 3 self-correction retries.
- Unexpected sidecar errors (FFmpeg, SAM3, FFglitch).
- Token budget exceeded or tool-call frequency limit reached.
- Any HIGH/CRITICAL security finding from CI scanners.

## TRACE REQUIREMENT

Every agent run must log:
- `spec_version` — commit SHA of approved docs
- `plan_version` — milestone ID being executed
- `instruction_version` — SHA of this AGENTS.md
- `eval_gate` — which evals were run
- `eval_result` — pass/fail summary

## SESSION START CHECKLIST

1. Read this file (`AGENTS.md`)
2. Read `SECURITY.md` for current toolchain status
3. If modifying Python/Rust/JS: consider running `../tools/scan-gate.ps1`
4. If adding dependencies: check for CVEs with `pip-audit` / `npm audit`
5. Never commit `.env` files, secret keys, or hardcoded credentials
