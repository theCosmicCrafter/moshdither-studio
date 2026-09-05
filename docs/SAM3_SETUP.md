# SAM3 Local Setup

SAM3 (Meta's segmentation model) powers click-to-segment masking. It runs as
a Python subprocess (`src-tauri/sam3_bridge.py`) managed by the Rust backend
(`src-tauri/src/sam3_engine.rs`), which the frontend talks to via
`sam3_init` / `sam3_point_prompt` / etc.

Three things need to exist locally for it to work, none of which are
committed to this repo (they're all gitignored, the same way `sam3_env` and
other Python venvs are):

## 1. A Python virtualenv with SAM3's dependencies

`sam3_env/` in the repo root (or `packages/python-backend/venv/`), with
`torch`, `torchvision`, and the `sam3` package (editable-installed from
step 2) — see `packages/python-backend/requirements.txt`.

## 2. The `facebookresearch/sam3` repo, patched for this project's torch version

Location: `packages/python-backend/sam3_repo/` — this is the exact path
`resolve_sam3_repo()` in `sam3_engine.rs` reads (both for the bundled/
production resource path and the dev fallback). It is **not** a plain
upstream clone of `facebookresearch/sam3.git` — as of the torch version this
project pins (2.11.0+), `torch.load()` defaults `weights_only=True`, which
this checkpoint format doesn't satisfy. You need `facebookresearch/sam3`
plus a patch relaxing that constraint to `False` in
`sam3/model_builder.py`'s checkpoint-loading path.

To set this up:

```bash
git clone https://github.com/facebookresearch/sam3.git packages/python-backend/sam3_repo
# then apply the weights_only=False relaxation to sam3/model_builder.py's
# torch.load call, and to whatever sam3/model/*.py and sam3/perflib/*.py
# files depend on it.
pip install -e packages/python-backend/sam3_repo   # from inside sam3_env
```

If a working patched copy already exists elsewhere on disk (e.g. a second
local clone on a branch with this patch already applied — check
`git log` for a commit relaxing `weights_only`), the fastest path is
copying its `sam3/` directory over rather than re-patching from scratch.

## 3. The model checkpoint

`sam3_bridge.py` looks for `SAM3_CHECKPOINT` (env var) or falls back to
`~/.moshdither/models/sam3/sam3.pt`. Request access at
<https://huggingface.co/facebook/sam3> and download the checkpoint there,
or point `SAM3_CHECKPOINT` at wherever you already have it.

## Verifying it works

```bash
sam3_env/Scripts/python.exe -c "
import sys
sys.path.insert(0, 'packages/python-backend/sam3_repo')
from sam3.model_builder import build_sam3_image_model
model = build_sam3_image_model(
    checkpoint_path='<path to sam3.pt>',
    device='cpu', eval_mode=True, load_from_HF=False,
    enable_segmentation=True, enable_inst_interactivity=True, compile=False,
)
print('OK:', type(model))
"
```

If this prints `OK: <class 'sam3.model.sam3_image.Sam3Image'>`, the Rust/
Python bridge will work too — `Sam3Engine::new()` runs the same import and
build path.

## Packaged builds

The base `tauri.conf.json` intentionally ships no SAM3 sidecar (dev builds
run the Python interpreter directly, per above). Release builds use a
separate pipeline, driven by `scripts/setup-sam3-env.py` →
`scripts/download-sam3-checkpoint.py` → `scripts/build-sam3-sidecar.py` →
`scripts/enable-sam3-sidecar.mjs`, which generates a `tauri.release.conf.json`
overlay adding `sam3-bridge` to `bundle.externalBin` and the checkpoint to
`bundle.resources` — so the model ships inside the installer rather than
requiring a first-run download. `.github/workflows/release.yml` already
wires all four steps together for CI release builds.

This pipeline previously produced a broken sidecar (see the fix history
below) but has been verified end-to-end locally: `scripts/build-sam3-sidecar.py`
now produces a working `sam3-bridge-<target>.exe`, confirmed by actually
launching it and completing a real handshake + shutdown round-trip over its
stdin/stdout JSON-IPC protocol — not just checking that the binary exists.
The CI workflow itself has not been exercised in this repo (GitHub Actions
is blocked on this account's billing), so a real release build remains
unverified end-to-end, but the local build/run path that CI drives is now
confirmed functional.

### Fix history: PyInstaller + eager JIT compilation

`build-sam3-sidecar.py` failed on its very first real run with
`FileNotFoundError` because it wrote its scratch dir under a `build/`
subdirectory that never existed — `tempfile.TemporaryDirectory(dir=...)`
doesn't create parent directories. This alone is strong evidence the script
had never been successfully run end-to-end before.

Once that was fixed, the *built* sidecar crashed on startup (before ever
reaching the auth handshake) with several different frozen-bundle failures,
all the same underlying cause: PyInstaller's onefile bundle ships compiled
bytecode, not real `.py` source files, but several dependencies eagerly JIT-
compile functions at import time using `inspect.getsourcelines()` /
`linecache`, which only work against real source on disk:

- `sageattention` (optional attention accelerator, probed in
  `sam3_bridge.py`) failed with `ValueError` from triton's `@jit` machinery,
  not `ImportError` — the existing `except ImportError` didn't catch it and
  crashed the whole bridge process. Broadened to `except Exception`, same
  fix applied to the adjacent `xformers`/`triton` probes.
- `sam3/model/model_misc.py` has its own `import xformers` guarded by
  `except ImportError` — xformers' own `_register_extensions()` call raises
  `FileNotFoundError` in the frozen bundle (its DLL directory doesn't exist
  at the expected frozen path), which also wasn't caught. Same broadening.
- `sam3/model/box_ops.py` applies `@torch.jit.script` eagerly at module
  level to two functions, unconditionally, on every import — not optional,
  and not something `sam3_bridge.py`'s own accelerator probes could guard.
  Patched to attempt scripting and fall back to the plain eager function on
  any failure (dev builds still get the scripted/faster version; frozen
  builds get the same numerically-correct but uncompiled function).
- The vendored `sam3` package uses `@triton.jit` eagerly at module level in
  several more files (`sam3/model/edt.py`, `sam3/perflib/triton/*`), each of
  which would otherwise crash the same way one file at a time across
  separate rebuild-and-discover cycles. Instead of patching each file,
  `sam3_bridge.py` now patches `triton.jit` itself — once, only when running
  from a frozen bundle (`sys.frozen`) — so any `@triton.jit` call site,
  including ones not yet discovered, falls back to the plain function
  instead of crashing. Verified directly against a function with no
  introspectable source (simulating the frozen condition) before rebuilding.
- `torch.jit.script` hits the same wall from a different direction, and this
  one survives past import into **model load**. `SAM2Transforms.__init__`
  (`sam3/model/utils/sam1_utils.py`) scripts
  `nn.Sequential(Resize(...), Normalize(...))`; torchvision's `Resize` holds an
  `InterpolationMode`, an `Enum`. To script an `Enum` subclass TorchScript walks
  `cls.__dict__` — which on Python 3.12+ contains `Enum._generate_next_value_`,
  defined in the stdlib's `enum.py` — and calls `inspect.getsource` on it. The
  bundle ships no stdlib source, so the model never loads:
  `Failed to get source for <function Enum._generate_next_value_> using
  inspect.getsource`. Patched in `sam3_bridge.py` the same way as `triton.jit`:
  once, only under `sys.frozen`, at the mechanism rather than the call site.
  `torch._jit_internal.get_type_hint_captures` builds a map from a function's
  *literal annotation text* to the type it names, so a function with no
  annotations has an empty map **by definition** — returning `{}` there is exact,
  not a guess, and is what torch's own comment says to do ("If we can't get the
  source, simply return an empty dict"); only its code disagrees and raises. A
  function that *is* annotated still raises, because dropping those captures
  would genuinely lose information. Verified by simulating the frozen condition
  in the dev venv (force `inspect.getsource` to raise for `enum.py` only, then
  script the same `Sequential`): reproduces the identical error, and with the
  patch produces a correct scripted transform — proven before spending a
  ~3 GB rebuild on it.

  Two supporting changes came out of the same hunt. `cmd_load_image` and
  `cmd_video_predictor` returned `Model load failed: {e}` with no traceback,
  so the error named neither a file nor a call site; both now
  `logging.exception` first, and Rust captures that stderr. And the probe that
  drives the bridge printed captured stderr with `print()`, which raised
  `UnicodeEncodeError` on a cp1252 console and swallowed the real output — it
  now writes the bytes to a file.

`packages/python-backend/sam3_repo` (the vendored SAM3 checkout, not
git-tracked — see above) carries the `box_ops.py` patch; the root `sam3_repo/`
reference copy was kept in sync for consistency.
