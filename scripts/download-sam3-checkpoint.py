#!/usr/bin/env python3
"""Download the SAM3 checkpoint from HuggingFace into `models/sam3/`.

The checkpoint is shipped as a Tauri resource and copied/cached by the Rust
runtime. This script only fetches it; it does not need a venv as long as
`huggingface_hub` is installed, but it will prefer the `sam3_env` interpreter.

Usage:
    python scripts/download-sam3-checkpoint.py [--repo-id facebook/sam3.1] [--filename sam3.1_multiplex.pt] [--token $HF_TOKEN]
"""

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
MODEL_DIR = PROJECT_ROOT / "models" / "sam3"
MANIFEST_PATH = PROJECT_ROOT / "packages" / "python-backend" / "sam3-checkpoint.json"


def load_manifest() -> dict:
    """Load the canonical SAM3 checkpoint manifest."""
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def manifest_defaults() -> tuple[str, str, str]:
    """Return (repo_id, filename, local_name) from the manifest."""
    m = load_manifest()
    return m["repo_id"], m["filename"], m.get("local_name", m["filename"])


def find_python() -> str:
    candidates = [
        PROJECT_ROOT / "sam3_env" / "Scripts" / "python.exe",
        PROJECT_ROOT / "sam3_env" / "bin" / "python",
        Path("python"),
        Path("python3"),
    ]
    for candidate in candidates:
        resolved = shutil.which(str(candidate)) or (str(candidate) if candidate.exists() else None)
        if resolved:
            return resolved
    raise RuntimeError("No Python interpreter found.")


def ensure_hf_hub(python: str) -> None:
    try:
        subprocess.run(
            [python, "-c", "import huggingface_hub"],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        print("huggingface_hub not found; installing...")
        subprocess.run([python, "-m", "pip", "install", "huggingface_hub"], check=True)


def main() -> None:
    repo, filename, local_name = manifest_defaults()
    parser = argparse.ArgumentParser(description="Download the SAM3 checkpoint")
    parser.add_argument("--repo-id", default=os.environ.get("SAM3_REPO_ID", repo))
    parser.add_argument("--filename", default=os.environ.get("SAM3_FILENAME", filename))
    parser.add_argument("--local-name", default=os.environ.get("SAM3_LOCAL_NAME", local_name))
    parser.add_argument("--token", default=os.environ.get("HF_TOKEN"))
    parser.add_argument("--local-dir", default=str(MODEL_DIR))
    args = parser.parse_args()

    python = find_python()
    ensure_hf_hub(python)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    local_path = MODEL_DIR / args.local_name
    if local_path.exists():
        print(f"Checkpoint already exists at {local_path}")
        return

    if not args.token:
        print(
            "WARNING: HF_TOKEN not set. The SAM3 checkpoint is gated, so it cannot be "
            "downloaded automatically. The app will prompt the user to log in at runtime."
        )
        print(f"To bundle the checkpoint, set HF_TOKEN and re-run: {__file__}")
        return

    script = f"""
from huggingface_hub import hf_hub_download

path = hf_hub_download(
    repo_id={args.repo_id!r},
    filename={args.filename!r},
    local_dir={args.local_dir!r},
    local_dir_use_symlinks=False,
    token={args.token!r},
)
print(path)
"""
    print(f"Downloading {args.repo_id}/{args.filename}...")
    subprocess.run([python, "-c", script], check=True)

    downloaded = Path(args.local_dir) / args.filename
    if downloaded.exists() and args.local_name != args.filename:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        downloaded.rename(local_path)
        print(f"Renamed {args.filename} -> {args.local_name}")

    print(f"Checkpoint ready at {local_path}")


if __name__ == "__main__":
    main()
