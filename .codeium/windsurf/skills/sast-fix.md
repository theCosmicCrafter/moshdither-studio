# sast-fix

Given a CONFIRMED finding, generate the minimal secure fix. Preserve existing behavior and API contracts.

## Fix Patterns

### SQLi
```python
# BEFORE
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
# AFTER
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

### XSS
```js
// BEFORE
element.innerHTML = userInput;
// AFTER
element.textContent = userInput;
```

### Path Traversal
```python
import os
safe_path = os.path.realpath(os.path.join("/files", user_filename))
if not safe_path.startswith("/files/"):
    raise ValueError("Path traversal attempt")
```

### RCE
```python
# BEFORE
os.system(f"convert {user_input}")
# AFTER
subprocess.run(["convert", user_input], shell=False, check=True)
```

### Hardcoded Secret
```python
# BEFORE
API_KEY = "sk-abc123hardcoded"
# AFTER
import os
API_KEY = os.environ["APP_API_KEY"]
```

### Weak Crypto
```python
# BEFORE
import hashlib; hashlib.md5(password).hexdigest()
# AFTER
from argon2 import PasswordHasher
ph = PasswordHasher(); ph.hash(password)
```

## After Fixing

Emit a /quick-recap with: fix applied, test coverage note, suppression added if needed
