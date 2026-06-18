---
name: sast-fix
description: Given a CONFIRMED finding from /vuln-triage, generate the minimal secure fix. Preserve existing behavior and API contracts. Trigger "fix this vuln", "patch this finding", after /vuln-triage output.
---

# /sast-fix

## Purpose
Generate minimal, behavior-preserving fixes for confirmed security findings.
Do not refactor beyond the security boundary. Do not change API contracts.

## Fix patterns by vuln type

### SQLi
```python
# BEFORE
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
# AFTER - parameterized query
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

### XSS
```js
// BEFORE
element.innerHTML = userInput;
// AFTER - safe text node
element.textContent = userInput;
// or DOMPurify for rich HTML
element.innerHTML = DOMPurify.sanitize(userInput);
```

### Path Traversal
```python
# BEFORE
with open(f"/files/{user_filename}") as f:
# AFTER - canonicalize + allowlist
import os
safe_path = os.path.realpath(os.path.join("/files", user_filename))
if not safe_path.startswith("/files/"):
    raise ValueError("Path traversal attempt")
with open(safe_path) as f:
```

### RCE
```python
# BEFORE
os.system(f"convert {user_input}")
# AFTER - list args, no shell=True
subprocess.run(["convert", user_input], shell=False, check=True)
```

### Hardcoded Secret
```python
# BEFORE
API_KEY = "sk-abc123hardcoded"
# AFTER - env var with fallback error
import os
API_KEY = os.environ["APP_API_KEY"]  # fail loudly if missing
```

### Weak Crypto
```python
# BEFORE
import hashlib; hashlib.md5(password).hexdigest()
# AFTER - bcrypt or argon2
from argon2 import PasswordHasher
ph = PasswordHasher(); ph.hash(password)
```

## After fixing
Emit a /quick-recap with: fix applied, test coverage note, suppression added if needed
