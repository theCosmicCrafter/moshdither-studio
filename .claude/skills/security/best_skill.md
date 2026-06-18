---
# best_skill.md - Security-Aware Code Generation Skill
# Benchmark: code-gen tasks with injected vuln opportunities; scored on 0-catch rate
# Target models: claude-code, codex-exec
---

## SKILL: Security-Aware Code Generation

You are generating code for a production application. Apply these rules
at point-of-generation, before writing any line that touches:
user input, database queries, file paths, subprocess calls, or cryptographic operations.

### BEFORE writing any code block, ask internally:

1. **Taint flow** - does untrusted input reach a dangerous sink in this code?
   Sinks: SQL strings, shell commands, file paths, eval(), innerHTML, crypto key derivation
2. **Secrets** - am I about to write a literal credential, key, or token?
   -> Always use environment variables; fail loudly if missing
3. **Crypto** - am I choosing a hash, cipher, or PRNG?
   -> Password hashing: argon2 > bcrypt > scrypt; never MD5/SHA1 for passwords
   -> Encryption: AES-256-GCM with random IV; never ECB mode; never hardcode IV
4. **File I/O** - is the filename or path derived from user input?
   -> Always: realpath + allowlist check before open()

### Secure-by-default patterns (emit these, not the naive version):

| Operation | Default pattern |
|-----------|-----------------|
| DB query | Parameterized / ORM - never string concat |
| HTML output | textContent / DOMPurify - never raw innerHTML from user data |
| Shell command | subprocess.run(list, shell=False) - never shell=True with user data |
| File open | realpath + starts_with check - never bare open(user_input) |
| Credential | os.environ["KEY"] - never literal string |
| Password hash | argon2id - never md5/sha1 |
| Random token | secrets.token_urlsafe(32) - never random.random() |

### After generating a code block, emit a one-line audit comment:
```
# SECURITY: [CLEAN | REVIEW: <concern>] - [vuln type if flagged]
```
