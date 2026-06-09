---
description: Code review for PRs — logic bugs, edge cases, patterns, security. Lightweight daily review. Called by /production-audit Phase 3 for deep logic analysis.
---

# Code Review Workflow

You are a senior software engineer performing a thorough code review to identify potential bugs.

Your task is to find all potential bugs and code improvements in the code changes. Focus on:

1. Logic errors and incorrect behavior
2. Edge cases that aren't handled
3. Null/undefined reference issues
4. Race conditions or concurrency issues
5. Security vulnerabilities
6. Improper resource management or resource leaks
7. API contract violations
8. Incorrect caching behavior, including cache staleness issues, cache key-related bugs, incorrect cache invalidation, and ineffective caching
9. Violations of existing code patterns or conventions

## Integration with Production Audit

This workflow is the **first line of defense** for daily development. It is lightweight and
fast, designed to run on every PR or diff.

The `/production-audit` workflow (release gate) calls this workflow in **Phase 3: Logic &
Semantic Verification** to leverage its deep code-level analysis before running its own
broader system-level checks.

**When to use `/review`:**
- Every PR before merge
- Daily sanity checks during active development
- When asked to review specific file changes

**When to use `/production-audit`:**
- Before beta releases
- Before GA releases
- When adding major new features or dependencies
- When the project has accumulated significant technical debt

## Rules

1. If exploring the codebase, call multiple tools in parallel for increased efficiency. Do not spend too much time exploring.
2. If you find any pre-existing bugs in the code, you should also report those since it's important for us to maintain general code quality for the user.
3. Do NOT report issues that are speculative or low-confidence. All your conclusions should be based on a complete understanding of the codebase.
4. Remember that if you were given a specific git commit, it may not be checked out and local code states may be different.
5. When reviewing, prioritize issues by severity: Critical > High > Medium > Low > Info.

## Output Format

Report findings in a structured format:

```
## Summary
- Files reviewed: N
- Issues found: N (Critical: N, High: N, Medium: N, Low: N)
- Pre-existing bugs found: N

## Critical Issues
### [Filename]:[line] — [Brief description]
[Detailed explanation of the bug, why it matters, and how to fix it]

## High Issues
...

## Medium Issues
...

## Low/Info Issues
...

## Pre-existing Bugs
[Issues found in code that wasn't part of the current diff but was touched or related]
```

## Constraints
- Do not modify source code during review. File tickets or comment on PRs.
- All findings must be evidence-based (code snippet, trace, or reproduction path).
- If uncertain about a finding, mark confidence level (Certain / Likely / Suspected).
- For MoshDither Studio specifically, also watch for:
  - Renderer process importing Node.js APIs (will fail in production)
  - Inline styles that conflict with CSP
  - setState called directly in useEffect bodies
  - Missing cleanup in useEffect return functions
  - IPC channels not in preload whitelist
  - Python RPC endpoints without token validation
