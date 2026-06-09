---
description: Continuous audit monitoring workflow for MoshDither Studio
---

# Audit Monitoring Workflow

## Purpose
Track the status of AUD tickets and agent assignments in real time by reading `IMPLEMENTATION_STATUS.md` (Section 14) on every interaction cycle.

## Trigger
This workflow activates whenever:
- A user or agent reports completing a feature/fix
- A commit is made to the codebase
- The PSA (Production System Auditor) is asked for a status update

## Steps

### 1. Read Section 14 of IMPLEMENTATION_STATUS.md
```bash
cd docs && cat IMPLEMENTATION_STATUS.md | sed -n '/## 14. Production System Auditor/,$p'
```

### 2. Identify Changes Since Last Check
Compare current agent task matrix against last known state:
- Any **PENDING** → **DONE** transitions?
- Any new blockers introduced?
- Any AUD tickets resolved by recent commits?

### 3. Update Section 14.5 (Updated Status)
If new features were implemented since last check, add them to the table with:
- Item name
- New Status (Done / Partial / Stub / Missing)
- Evidence (file path + line numbers)
- Agent who completed it

### 4. Update Section 14.6 (Agent Task Assignment Matrix)
- Strike through completed tasks
- Add **Status** column entry: **DONE** or **PENDING**
- Update remaining effort totals

### 5. Re-Evaluate Verdict
Run the verification commands from Section 14.7:
```bash
cd packages/desktop-gui && npx tsc --noEmit
cd packages/desktop-gui && npx eslint .
cd packages/desktop-gui && npx vitest run
cd packages/desktop-gui && npm run build
```

If all pass → note that project is closer to **Pass**  
If failures found → file new AUD tickets and assign to appropriate agent

### 6. Re-Assign or Spawn Sub-Agents
If Agent 1 or Agent 2 finishes all tasks:
- Re-assign remaining work across agents
- Spawn new sub-agents for uncovered domains (performance, E2E, plugin security)

## Checklist (Copy-Paste for Each Cycle)

- [ ] Read IMPLEMENTATION_STATUS.md Section 14
- [ ] Compare against last known state
- [ ] Update Section 14.5 with newly Done items
- [ ] Update Section 14.6 agent matrices
- [ ] Run verification commands (tsc, eslint, vitest, build)
- [ ] Update verdict status (Conditional Pass → Pass progress)
- [ ] File new AUD tickets if new issues found
- [ ] Re-assign work if agents become idle

## Notes

- I cannot run a literal background timer. This workflow is triggered on every chat interaction.
- Agents should ping the PSA by saying "check status" or "audit update" to trigger this workflow.
- The canonical source of truth is always `docs/IMPLEMENTATION_STATUS.md`.
