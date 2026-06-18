---
name: security-scan
description: Run multi-tool SAST + secrets scan pipeline before committing or requesting review. Catches SQLi, XSS, RCE, path traversal, hardcoded secrets, and weak crypto. Trigger on "scan this", "check for vulns", "security review", before any commit touching auth / DB / file I/O / shell exec / crypto.
---

# /security-scan

## Purpose
Run the full scan pipeline and surface findings before code leaves the dev environment.
Pair Semgrep (multi-lang) with the language-specific scanner for the target stack.

## Trigger phrases
- "scan this", "security scan", "check for vulns"
- "before I commit", "is this safe?"
- Files touching: queries, exec(), subprocess, open(), crypto, jwt, auth

## Execution order

```
1. semgrep scan --config=p/owasp-top-ten --config=p/secrets --severity=ERROR
2. gitleaks detect --source . --exit-code 1
3. [Python] bandit -r . -ll
4. [JS/TS]  njsscan .
5. [Go]     gosec ./...
6. [Rails]  brakeman -q
```

## Output format (use /quick-recap style)
```
!! CRITICAL: [rule-id] - [file:line] - [one-line description]
! HIGH:     [rule-id] - [file:line] - [one-line description]
+ CLEAN:    No [vuln-category] findings
```

## Suppression rules
- Suppress with `# nosemgrep: rule-id` or `# nosec B105` ONLY with explanation comment
- Never suppress CRITICAL without user confirmation
- Log all suppressions to SUPPRESSION.md with: date, rule, reason, reviewer
