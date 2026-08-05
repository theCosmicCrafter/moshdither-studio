# MoshDither Studio — Milestone Spec Template

## Purpose

Each milestone gets a dedicated spec file in this directory, loaded just-in-time
when the milestone becomes active. This keeps the root `AGENTS.md` under 300 lines.

## Naming Convention

```
m<N>-<short-name>.md
```

Examples:
- `m1-effect-engine-hardening.md`
- `m2-video-export-pipeline.md`
- `m3-ui-polish.md`

## Template

```markdown
# M<N>: <Milestone Title>

## Deliverable
<!-- Clear, measurable output -->

## Context
<!-- Which docs to re-read before starting -->
- docs/PRD.md sections: ...
- docs/API_SPEC.md sections: ...
- docs/ARCHITECTURE.md

## Scope

### In Scope
- ...

### Out of Scope
- ...

## Data Entities & API Changes
<!-- New or modified Tauri IPC commands, Rust structs, store actions -->

## File-Level Implementation Plan
| File | Change Type | Description |
|------|------------|-------------|
| `src/...` | MODIFY | ... |

## Edge Cases & Error Handling
- ...

## Acceptance Criteria
1. [ ] ...
2. [ ] ...

## Test Strategy
- Unit: ...
- E2E: ...

## Eval Gate
- `evals/suite/<test-name>.spec.ts`

## Token Budget
- Input: ...K / Output: ...K

## Rollback Checkpoint
- Tag: `checkpoint/m<N>-baseline`
```
