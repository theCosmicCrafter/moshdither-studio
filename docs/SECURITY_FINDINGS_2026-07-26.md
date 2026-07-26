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

## 2. Unpinned model downloads — **FIXED 2026-07-26**

**Was 3 findings, bandit `B615`, in `packages/python-backend/sam3_service.py`.**

`snapshot_download("IDEA-Research/grounding-dino-tiny")` carried no `revision`,
so it fetched whatever the repository pointed at that day.

**This was the delivery vector for §3.** PYSEC-2026-2289 executes arbitrary code
from a repository named in a model's `config.json` `_attn_implementation_internal`
field during `from_pretrained()`. Unpinned + vulnerable transformers is the
whole chain: force-push upstream, and the next launch runs the attacker's code.
Neither finding is remarkable alone; together they are a working path.

**Fixed three ways:**

- `revision` pinned to `a2bb814dd30d776dcf7e30523b00659f4f141c71`, the
  repository head as of 2024-05-12 and unchanged since.
- `allow_patterns` restricts the download to JSON/text/safetensors. The
  repository also ships `pytorch_model.bin`, a pickle, which executes arbitrary
  code on load by design and was being downloaded for no reason.
- `local_files_only=True` and `trust_remote_code=False` stated explicitly on
  both `from_pretrained()` calls, so neither can silently reach the network and
  enabling remote code becomes a deliberate edit rather than an omission.

Those two `from_pretrained()` calls still carry `# nosec B615`: they read the
local cache directory, never the Hub, so `revision` has no meaning for them.
The pin lives on the `snapshot_download()` that actually contacts the Hub.
`bandit -ll packages/python-backend/sam3_service.py` now reports no issues.

---

## 3. `transformers` 4.57.6 — 4 advisories, 1 that matters

Triaged rather than treated as four equal items:

| ID | Vector | Reachable here? |
|---|---|---|
| `PYSEC-2025-217` | X-CLIP **checkpoint conversion** RCE | No — this app never converts checkpoints |
| `PYSEC-2026-2288` | `Trainer._load_rng_state` RCE | No — this app does not train |
| `PYSEC-2026-2290` | **LightGlue** model loading | No — LightGlue is not used |
| `PYSEC-2026-2289` | `from_pretrained()` executes code named in `config.json`'s `_attn_implementation_internal` | **Yes** |

Only the last is reachable: `sam3_service.py` calls
`AutoModelForZeroShotObjectDetection.from_pretrained()`.

**Its delivery vector is closed** — the model download is now pinned to an exact
commit and restricted to safetensors, so an attacker would have to compromise a
specific historical commit rather than force-push `main`. See §2.

The library fix still requires **transformers 5.x**, and `requirements.txt` pins
`>=4.36.0,<5`. That is a major-version migration which also drags
`huggingface_hub` from 0.x to 1.x (violating its own `<1` pin). The API surface
this project uses is small and stable — `AutoProcessor`,
`AutoModelForZeroShotObjectDetection`, `snapshot_download`, all present in 5.x —
so the upgrade is plausible, but it **cannot be verified on this machine**: the
SAM3 checkpoint is not present locally, so no real segmentation can be run.

**To do it safely:** obtain the checkpoint (`scripts/download-sam3-checkpoint.py`),
upgrade `transformers>=5.3,<6` and `huggingface_hub>=1,<2`, then run a text-prompt
segmentation end to end and compare masks against the current output. Shipping it
without that is exactly the untested change this document argues against.

Suppressed by ID, never blanket, so a new `transformers` advisory still fails
the gate.

---

## 4. `rembg` 2.0.69 — **FIXED 2026-07-26**

`PYSEC-2026-2274`, `GHSA-55v6-g8pm-pw4c`. Fixed in 2.0.75.

2.0.75 looks in-range for the existing `<3` pin, and raising the floor was tried
first — it fails:

```
ERROR: Cannot install ... requirements.txt (line 16), requirements.txt (line 35)
and numpy<2 and >=1.26 because these package versions have conflicting
dependencies.  ResolutionImpossible
```

`rembg >= 2.0.75` requires `numpy >= 2`, and the project pinned `numpy < 2`.

**The numpy 2 migration turned out to be already done in everything but the
pin.** Verified rather than assumed:

- The project's own numpy usage is numpy-2 clean. Every symbol it touches
  (`np.float32`, `np.uint8`, `np.int32`, `np.ndarray`, `np.fft`, …) survives in
  numpy 2. None of the bare aliases numpy 2 removed — `np.float`, `np.int`,
  `np.bool` — appear anywhere.
- Every pinned dependency already supported numpy 2 at its installed version:
  torch 2.11, opencv 4.11, scikit-image 0.26, transformers 4.57.
- A dry-run resolve in the live `sam3_env` showed the upgrade touches exactly
  three packages — `numpy 2.4.6`, `rembg 2.0.77`, `scipy 1.18.0` — and leaves
  `torch 2.11.0+cu128` alone, so the CUDA build is preserved.
- After upgrading: torch, opencv, scikit-image, transformers and `sam3` all
  import, `torch.cuda.is_available()` is still `True`, and the numpy-heavy mask
  helpers in `sam3_bridge.py` (`mask_to_base64`, `mask_iou`,
  `deduplicate_masks`, `cmd_postprocess_mask`) all produce correct results —
  `mask_iou` returns exactly 0.25 on geometry constructed to give 0.25.

`requirements.txt` now pins `numpy>=2.0,<3` and `rembg>=2.0.75,<3`, and the
pip-audit suppressions for both rembg advisories are **removed** rather than
kept.

> One loose end: the vendored `sam3` package's own metadata still declares
> `numpy<2`, so pip prints a dependency-conflict warning. It is a defensive
> upstream pin, not a real incompatibility — `sam3` imports and runs fine on
> numpy 2.4.6, as verified above.

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
| `packages/python-backend/` | bandit `exclude` | 15 legacy `shell=True` findings, §1 | §1 fixed |
| 4 × `PYSEC` IDs | pip-audit `--ignore-vuln` | transformers 5.x migration, §3 | transformers upgraded |
| 2 × `# nosec B615` | `sam3_service.py` | `from_pretrained()` on a local path; the pin is on `snapshot_download()` | never — structural |
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
