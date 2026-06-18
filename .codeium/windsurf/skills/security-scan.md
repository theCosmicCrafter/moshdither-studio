# security-scan

Run multi-tool SAST + secrets scan pipeline before committing or requesting review. Catches SQLi, XSS, RCE, path traversal, hardcoded secrets, and weak crypto.

## Trigger

- "scan this", "security scan", "check for vulns"
- "before I commit", "is this safe?"
- Files touching: queries, exec(), subprocess, open(), crypto, jwt, auth

## Execution

```
1. semgrep scan --config=p/owasp-top-ten --config=p/secrets --severity=ERROR
2. gitleaks detect --source . --exit-code 1
3. [Python] bandit -r . -ll
4. [JS/TS]  njsscan .
5. [Go]     gosec ./...
6. [Rails]  brakeman -q
```

## Output

```
!! CRITICAL: [rule-id] - [file:line] - [one-line description]
! HIGH:     [rule-id] - [file:line] - [one-line description]
+ CLEAN:    No [vuln-category] findings
```

## Suppression

- Suppress with `# nosemgrep: rule-id` or `# nosec B105` ONLY with explanation comment
- Never suppress CRITICAL without user confirmation
- Log all suppressions to SUPPRESSION.md
