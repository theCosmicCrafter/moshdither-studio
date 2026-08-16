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

## Known gap: packaged builds

None of the above ships in a built installer today. `tauri.conf.json`'s
`bundle.externalBin` only lists ffmpeg/ffprobe/ffgac/ffedit — no SAM3
sidecar — and there's no first-run model-download flow. A distributable
build needs: a PyInstaller-built `sam3-bridge` sidecar added to
`externalBin`, and a decision on checkpoint delivery (first-run download UI
is the recommended approach over bundling several GB of weights into the
installer). See `docs/HARDENING_PLAN_2026-07-26.md` §7 and
`docs/PRODUCTION_AUDIT_2026-07-25.md` for the existing analysis.
