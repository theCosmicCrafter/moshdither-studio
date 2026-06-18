# vuln-triage

Given scanner output, classify each finding as CONFIRMED / FALSE-POSITIVE / NEEDS-CONTEXT.

## Classification

| Label | Criteria |
|-------|----------|
| CONFIRMED | Sink reachable from untrusted source, no sanitization in path |
| FALSE-POSITIVE | Source is controlled/constant; taint cannot reach sink |
| NEEDS-CONTEXT | Unclear source trust level; flag for human review |

## Heuristics

- **SQLi**: Query string-concatenated from user input? No parameterized query? -> CONFIRMED
- **XSS**: User input reaches innerHTML / dangerouslySetInnerHTML without encoding? -> CONFIRMED
- **RCE**: User input reaches subprocess/exec/eval/os.system without allowlist? -> CONFIRMED
- **Path Traversal**: User-supplied filename reaches open() without path.basename check? -> CONFIRMED
- **Secrets**: Value is a literal string matching a credential pattern? -> CONFIRMED
- **Weak Crypto**: MD5/SHA1 for passwords? DES/RC4? hardcoded IV? -> CONFIRMED

## Output

```
CONFIRMED  [file:line] [vuln-type] - [why it's real]
FALSE-POS  [file:line] [rule]     - [why it's safe]
NEEDS-CTX  [file:line] [vuln-type] - [what info is needed]
```
