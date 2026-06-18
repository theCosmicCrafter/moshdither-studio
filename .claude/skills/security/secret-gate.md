---
name: secret-gate
description: Run before any commit. Detect secrets in staged files using gitleaks + detect-secrets. Halt if new patterns found. Do not bypass without user confirmation and documented reason.
---

# /secret-gate

## Purpose
Zero-tolerance gate: no verified secret reaches the remote.
Runs gitleaks on staged diff + detect-secrets against baseline.

## Steps
```
1. git diff --staged --name-only -> get changed file list
2. gitleaks protect --staged --exit-code 1
3. detect-secrets scan --baseline .secrets.baseline
4. If either exits nonzero: HALT
```

## On finding
Report:
```
!! SECRET DETECTED
  File:    [path]
  Line:    [N]
  Pattern: [detector name, e.g. "AWS Access Key"]
  Value:   [first 4 chars]***[last 4 chars]
  Action:  Remove from code -> use env var: ${SUGGESTED_ENV_NAME}
           git filter-repo to purge from history if already committed
```

## Emergency: secret already committed?
```bash
# 1. Rotate the credential IMMEDIATELY (before history cleanup)
# 2. Remove from history:
git filter-repo --path <file> --invert-paths
# 3. Force push (coordinate with team)
# 4. Update .secrets.baseline
```
