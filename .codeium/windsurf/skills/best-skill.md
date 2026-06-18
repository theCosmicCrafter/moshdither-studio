# best-skill

Security-aware code generation. Apply before writing any code that touches user input, DB queries, file paths, subprocess, or crypto.

## Self-Check Before Writing Code

1. **Taint flow**: Does untrusted input reach a dangerous sink?
   Sinks: SQL strings, shell commands, file paths, eval(), innerHTML, crypto key derivation
2. **Secrets**: Am I about to write a literal credential? -> Always use env vars
3. **Crypto**: Choosing hash/cipher/PRNG? -> argon2id for passwords, AES-256-GCM for encryption
4. **File I/O**: Is path derived from user input? -> realpath + allowlist before open()

## Secure-by-Default Patterns

| Operation | Default |
|-----------|---------|
| DB query | Parameterized / ORM |
| HTML output | textContent / DOMPurify |
| Shell command | subprocess.run(list, shell=False) |
| File open | realpath + starts_with check |
| Credential | os.environ["KEY"] |
| Password hash | argon2id |
| Random token | secrets.token_urlsafe(32) |

## Audit Comment

After generating code: `# SECURITY: [CLEAN | REVIEW: <concern>] - [vuln type if flagged]`
