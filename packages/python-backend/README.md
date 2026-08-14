# Python Backend

The MoshDither Python backend provides video processing capabilities via FFglitch and ffmpeg.

SAM3 segmentation is a separate Python process, not part of this directory:
the production bridge is `src-tauri/sam3_bridge.py`, spawned directly by
`src-tauri/src/sam3_engine.rs` (or its packaged sidecar, built by
`scripts/build-sam3-sidecar.py`). This directory previously also held a
standalone HTTP RPC server (`main.py`) for neural-network integration, but it
was never wired to the app — see `docs/SECURITY_FINDINGS_2026-07-26.md` §3 —
and was recycled 2026-08-11.

---

## Components

| File | Purpose |
|------|---------|
| `mosh_cli.py` | Command-line interface for FFglitch-based datamoshing |
| `requirements.txt` | Python dependencies |

---

## Setup

```bash
cd packages/python-backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## Datamoshing (`mosh_cli.py`)

The CLI wraps FFglitch with safe argument list construction (no shell injection).

```bash
python mosh_cli.py <input> <mode> [--output OUTPUT]
```

**Modes:** `classic`, `gop_corrupt`, `p-frame_repeat`, `i-frame_removal`, `sort`, `buffer_overflow`, `random_noise`, `custom_script`

---

## License

Same as root project (MIT).
