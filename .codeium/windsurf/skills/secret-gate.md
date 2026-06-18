# secret-gate

Run before any commit. Detect secrets in staged files using gitleaks + detect-secrets. Halt if new patterns found.

## Steps

```bash
git diff --staged --name-only
gitleaks protect --staged --exit-code 1
detect-secrets scan --baseline .secrets.baseline
```

## On Finding

```
!! SECRET DETECTED
  File:    [path]
  Line:    [N]
  Pattern: [detector name]
  Value:   [first 4 chars]***[last 4 chars]
  Action:  Remove from code -> use env var
           git filter-repo to purge from history if already committed
```

## Emergency: Secret Already Committed?

1. Rotate the credential IMMEDIATELY
2. Remove from history: `git filter-repo --path <file> --invert-paths`
3. Force push (coordinate with team)
4. Update `.secrets.baseline`
