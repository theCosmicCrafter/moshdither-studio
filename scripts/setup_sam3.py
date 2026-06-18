#!/usr/bin/env python3
"""
Bootstrap script for SAM3 model setup in MoshDither Studio.

Usage:
    python scripts/setup_sam3.py [--checkpoint-url URL]

This script:
    1. Verifies Python >= 3.10 and PyTorch are installed.
    2. Creates the default model directory (~/.moshdither/models/sam3).
    3. Checks for the SAM3 checkpoint file.
    4. Optionally downloads the checkpoint from a provided URL.
    5. Verifies the checkpoint can be loaded by the bridge.

Environment variables:
    SAM3_CHECKPOINT   Override the default checkpoint path.
    SAM3_DEVICE       Set to "cpu" or "cuda" (default: auto-detect).
    SAM3_USE_AMP      Set to "1" to enable AMP (default: disabled).
"""

import argparse
import os
import sys
import urllib.request
from pathlib import Path


def check_python():
    """Ensure Python version is 3.10 or newer."""
    if sys.version_info < (3, 10):
        print(f"[ERROR] Python {sys.version_info.major}.{sys.version_info.minor} is too old. Python 3.10+ required.")
        sys.exit(1)
    print(f"[OK] Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")


def check_pytorch():
    """Check that PyTorch is installed and report CUDA availability."""
    try:
        import torch
    except ImportError:
        print("[ERROR] PyTorch not found. Install it first:")
        print("  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118")
        sys.exit(1)

    print(f"[OK] PyTorch {torch.__version__}")
    if torch.cuda.is_available():
        print(f"[OK] CUDA available: {torch.cuda.get_device_name(0)}")
    else:
        print("[WARN] CUDA not available. SAM3 will run on CPU (slower).")


def check_sam3_package():
    """Check that the sam3 package is importable."""
    try:
        import sam3
        print(f"[OK] sam3 package found")
    except ImportError:
        print("[WARN] sam3 package not found in Python environment.")
        print("       Make sure the SAM3 repository is installed or on PYTHONPATH.")


def get_checkpoint_path():
    """Resolve the checkpoint path from environment or default."""
    default = Path.home() / ".moshdither" / "models" / "sam3" / "sam3.pt"
    return Path(os.environ.get("SAM3_CHECKPOINT", default))


def ensure_dir(path: Path):
    """Create the directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)
    print(f"[OK] Directory ready: {path}")


def download_file(url: str, dest: Path):
    """Download a file with progress feedback."""
    print(f"[INFO] Downloading from {url}")
    print(f"       Destination: {dest}")

    def report_progress(block_num, block_size, total_size):
        downloaded = block_num * block_size
        pct = downloaded * 100 / total_size if total_size else 0
        if total_size:
            sys.stdout.write(f"\r  {pct:.1f}% ({downloaded // (1024*1024)} MB / {total_size // (1024*1024)} MB)")
        else:
            sys.stdout.write(f"\r  {downloaded} bytes")
        sys.stdout.flush()

    try:
        urllib.request.urlretrieve(url, dest, reporthook=report_progress)
        sys.stdout.write("\n")
        print("[OK] Download complete.")
    except Exception as e:
        print(f"\n[ERROR] Download failed: {e}")
        sys.exit(1)


def verify_checkpoint(path: Path):
    """Try to load the checkpoint to verify integrity."""
    try:
        import torch
        ckpt = torch.load(path, map_location="cpu")
        keys = list(ckpt.keys())[:5]
        print(f"[OK] Checkpoint verified. Keys: {keys}")
    except Exception as e:
        print(f"[WARN] Could not verify checkpoint: {e}")


def main():
    parser = argparse.ArgumentParser(description="Bootstrap SAM3 for MoshDither Studio")
    parser.add_argument("--checkpoint-url", help="URL to download the SAM3 checkpoint", default=None)
    parser.add_argument("--skip-verify", action="store_true", help="Skip checkpoint integrity check")
    args = parser.parse_args()

    print("=" * 60)
    print("MoshDither Studio — SAM3 Bootstrap")
    print("=" * 60)

    check_python()
    check_pytorch()
    check_sam3_package()

    checkpoint_path = get_checkpoint_path()
    ensure_dir(checkpoint_path.parent)

    if checkpoint_path.exists():
        size_mb = checkpoint_path.stat().st_size / (1024 * 1024)
        print(f"[OK] Checkpoint exists: {checkpoint_path} ({size_mb:.1f} MB)")
        if not args.skip_verify:
            verify_checkpoint(checkpoint_path)
    else:
        print(f"[WARN] Checkpoint not found at: {checkpoint_path}")
        if args.checkpoint_url:
            download_file(args.checkpoint_url, checkpoint_path)
            if not args.skip_verify:
                verify_checkpoint(checkpoint_path)
        else:
            print("[INFO] Place your SAM3 checkpoint at the above path, or rerun with --checkpoint-url.")
            print("       Example:")
            print(f"       python scripts/setup_sam3.py --checkpoint-url https://example.com/sam3.pt")
            sys.exit(1)

    print("=" * 60)
    print("SAM3 is ready!")
    print(f"Checkpoint: {checkpoint_path}")
    print("Run the app and SAM3 will load automatically on first use.")
    print("=" * 60)


if __name__ == "__main__":
    main()
