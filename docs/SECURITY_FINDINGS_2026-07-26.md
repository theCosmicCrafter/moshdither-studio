# Security Findings — 2026-07-26

First run of the security tooling. The `.pre-commit-config.yaml` stack existed
but had never executed: the framework was not wired to this repository's hooks,
and the separate TruffleHog hook silently skipped on every commit because it
looked for the binary in the wrong directory.

Everything below is a **real finding that is not yet fixed**. Each is suppressed
by explicit ID or path in the tooling so the gates block *new* problems rather
than being permanently red — a gate that always fails is one people learn to
bypass, which is how this situation arose in the first place. Nothing here is
dismissed.

---

## 1. Command injection in the legacy Python backend — **HIGH**

**15 findings, bandit `B602` (`subprocess_popen_with_shell_equals_true`).**

| File | Count |
|---|---|
| `packages/python-backend/DatamoshLib/FFG_effects/basic_modes.py` | 13 |
| `packages/python-backend/DatamoshLib/FFG_effects/external_script.py` | 2 |

User-supplied file paths are interpolated directly into a shell string:

```python
subprocess.call(f'"{ffgac}" -i "{input_video}" -an -mpv_flags +nopimb+forcemv '
                f'-qscale:v 0 -g "{gop}" -vcodec mpeg2video -f rawvideo -y tmp.mpg',
                shell=True)
```

**This code is live.** `src-tauri/src/commands.rs:2160` resolves and invokes
`packages/python-backend/mosh_cli.py`, so the path runs whenever the FFglitch
effects are used.

**Why it matters.** This is a desktop application that opens files the user
chooses. A filename containing a double quote followed by shell metacharacters
closes the quoted argument and appends an arbitrary command, which then runs
with the application's privileges. The user does not have to be the attacker —
downloading a video with a crafted filename is enough.

**Fix.** Convert to list-form `subprocess.run([...])` with `shell=False`. Each
call site needs its arguments split into a list rather than formatted into a
string. `tmp.mpg` / `tmp.json` are also written to the process working directory
rather than a temp dir, which is worth fixing in the same pass.

**Not done here** because it rewrites live media-processing code whose exercise
path needs the external `ffgac` / `ffedit` binaries to test, and shipping an
untested rewrite of that is worse than the documented status quo.

**Tooling status.** `packages/python-backend/` is excluded from the bandit hook
so the gate covers new Python code today. Remove that exclusion when this is
fixed.

---

## 2. Unpinned model downloads — **MEDIUM**

**3 findings, bandit `B615`.** In `packages/python-backend/sam3_service.py`.

Hugging Face model loads without a pinned `revision`, so the code fetches
whatever the remote repository currently points at. If the upstream model
repository is compromised or force-pushed, this pulls the replacement silently.

**Fix.** Pass an explicit `revision="<commit sha>"` to each `from_pretrained` /
`hf_hub_download` call.

---

## 3. `transformers` 4.57.6 — 4 advisories

`PYSEC-2025-217`, `PYSEC-2026-2288`, `PYSEC-2026-2289`, `PYSEC-2026-2290`.

Every fix is in `transformers` 5.x. `requirements.txt` pins `>=4.36.0,<5`, so
clearing these is a **major-version migration**, not a bump — 5.x has breaking
API changes and the SAM3 / GroundingDINO integration would need revalidating.

Suppressed by ID in `.pre-commit-config.yaml`. A new advisory against
`transformers` still fails the gate, because the suppression is per-ID and never
blanket.

---

## 4. `rembg` 2.0.69 — 2 advisories

`PYSEC-2026-2274`, `GHSA-55v6-g8pm-pw4c`. Fixed in 2.0.75.

2.0.75 looks in-range for the existing `<3` pin, and raising the floor was tried
first — it fails:

```
ERROR: Cannot install ... requirements.txt (line 16), requirements.txt (line 35)
and numpy<2 and >=1.26 because these package versions have conflicting
dependencies.  ResolutionImpossible
```

`rembg >= 2.0.75` requires `numpy >= 2`, and the project pins `numpy < 2`.
Clearing this advisory therefore means a **numpy 2.x migration** across `torch`,
`opencv-python`, `scikit-image` and `pycocotools`. Suppressed by ID until then.

---

## Cleared during this pass

- **`scripts/mirror_sam3_model.py:38`** — `subprocess.run(cmd, shell=True)` with
  a list argument. On Windows, Python joins the list into a single string before
  handing it to the shell, so a path with shell metacharacters was interpreted
  rather than treated as a path. `mklink` is a `cmd.exe` builtin and genuinely
  needs a shell, so the fix invokes `cmd /c` explicitly with `shell=False`,
  which keeps the arguments as distinct argv entries. **Fixed.**

- **Full git history secret scan** — 0 verified secrets across all 112 commits.
  Ten unverified findings, all placeholder connection strings
  (`mongodb://username:password@host:1234`) <!-- pragma: allowlist secret -->
  inside the vendored `zod` test suite under the committed `node_modules`. Not
  leaks.

  > Quoting that string in this document made detect-secrets flag *this file* on
  > the very first gated commit, which is a fair demonstration that the gate
  > works. The inline pragma above marks it reviewed rather than silencing the
  > rule.

- **Two detect-secrets findings, both false positives.** `.env.example:55` is a
  commented-out placeholder of literal `x` characters, and there is no real
  `.env` in the repository. `src-tauri/tauri.conf.json:87` decodes to
  `untrusted comment: minisign public key` — a **public** key, which is
  published by design so the updater can verify signatures. Both recorded in
  `.secrets.baseline`.

---

## Suppression inventory

Everything currently keeping a gate green, so it can be audited in one place.

| What | Where | Reason | Removable when |
|---|---|---|---|
| `packages/python-backend/` | bandit `exclude` | 17 legacy findings, §1 and §2 | §1 and §2 fixed |
| 4 × `PYSEC` IDs | pip-audit `--ignore-vuln` | transformers 5.x migration, §3 | transformers upgraded |
| 2 × rembg IDs | pip-audit `--ignore-vuln` | numpy 2.x migration, §4 | numpy upgraded |
| `.secrets.baseline` | `.gitleaks.toml` | Stored SHAs read as high-entropy secrets | never — structural |
| Vendored trees | all scanners | Third-party code, ~6.5 GB | never — structural |
| njsscan | removed from config | Ships no `.pre-commit-hooks.yaml` at any tag | upstream adds one |
| semgrep | `stages: [manual]` | Fetches rulesets over the network, so it fails intermittently -- observed passing and failing across two identical back-to-back runs. CI runs it authoritatively. | rules are vendored locally |

---

## What runs when

**Every commit** (five hooks, ~15s): trufflehog, gitleaks, detect-secrets,
bandit, pip-audit. Verified stable across three consecutive full runs.

**On demand:**

```
pre-commit run --all-files                              # the commit-time set
pre-commit run semgrep --hook-stage manual --all-files  # + semgrep
npm run secret-scan                                     # working tree
npm run secret-scan:history                             # all git history
```

**CI** (`.github/workflows/security.yml`): Semgrep, CodeQL, TruffleHog, Snyk,
Bandit, Trivy. This is the authoritative run and is not subject to the local
scoping exclusions above.
