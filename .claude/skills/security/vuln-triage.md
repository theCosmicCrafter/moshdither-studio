---
name: vuln-triage
description: Given scanner output (SARIF, JSON, or plain text), classify each finding as CONFIRMED / FALSE-POSITIVE / NEEDS-CONTEXT. Use after running /security-scan or when reviewing CI scan results.
---

# /vuln-triage

## Purpose
Turn raw scanner noise into an actionable list. Scanners over-fire;
triage separates signal from static before handing off for fixing.

## Classification rules

| Label | Criteria |
|-------|----------|
| CONFIRMED | Sink reachable from untrusted source, no sanitization in path |
| FALSE-POSITIVE | Source is controlled/constant; taint cannot reach sink |
| NEEDS-CONTEXT | Unclear source trust level; flag for human review |

## Vuln-type quick heuristics

**SQLi**: Is the query string-concatenated from user input? No parameterized query? -> CONFIRMED
**XSS**: Does user input reach innerHTML / dangerouslySetInnerHTML / document.write without encoding? -> CONFIRMED
**RCE**: Does user input reach subprocess/exec/eval/os.system without allowlist? -> CONFIRMED
**Path Traversal**: Does user-supplied filename reach open()/fs.readFile() without path.basename/realpath check? -> CONFIRMED
**Secrets**: Is the value a literal string that matches a credential pattern? -> CONFIRMED
**Weak Crypto**: MD5/SHA1 for passwords? DES/RC4? hardcoded IV? -> CONFIRMED

## Output format
```
CONFIRMED  [file:line] [vuln-type] - [why it's real]
FALSE-POS  [file:line] [rule]     - [why it's safe]
NEEDS-CTX  [file:line] [vuln-type] - [what info is needed]
```
