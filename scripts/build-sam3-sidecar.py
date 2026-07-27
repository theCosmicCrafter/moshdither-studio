#!/usr/bin/env python3
"""Build the SAM3 bridge sidecar using PyInstaller.

The sidecar is a single-file executable that bundles a Python interpreter,
torch/transformers/opencv, and the `sam3` package source. It communicates
with the Rust backend over stdin/stdout using the same JSON-line protocol as
`src-tauri/sam3_bridge.py`.

The model checkpoint is **not** bundled here; it is shipped as a Tauri resource
and the Rust launcher sets `SAM3_CHECKPOINT` at runtime.

Usage:
    python scripts/build-sam3-sidecar.py [--target <target-triple>]

The resulting binary is written to `src-tauri/bin/sam3-bridge-<target>`.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
SAM3_REPO = PROJECT_ROOT / "packages" / "python-backend" / "sam3_repo"
BRIDGE_SCRIPT = PROJECT_ROOT / "src-tauri" / "sam3_bridge.py"
BIN_DIR = PROJECT_ROOT / "src-tauri" / "bin"


def get_target(args: argparse.Namespace) -> str:
    """Determine the Rust-style target triple for the output filename."""
    if args.target:
        return args.target
    if env_target := os.environ.get("TAURI_TARGET_TRIPLE"):
        return env_target
    try:
        return (
            subprocess.run(
                ["rustc", "--print", "host-tuple"], check=True, capture_output=True, text=True
            )
            .stdout.strip()
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        if sys.platform == "win32":
            return "x86_64-pc-windows-msvc"
        if sys.platform == "darwin":
            return "aarch64-apple-darwin"
        return "x86_64-unknown-linux-gnu"


def find_python() -> Path:
    """Locate the SAM3 Python interpreter."""
    candidates = [
        PROJECT_ROOT / "sam3_env" / "Scripts" / "python.exe",
        PROJECT_ROOT / "sam3_env" / "bin" / "python",
        Path("python"),
        Path("python3"),
    ]
    for candidate in candidates:
        if shutil.which(str(candidate)) or candidate.exists():
            return Path(shutil.which(str(candidate)) or candidate)
    raise RuntimeError(
        "No Python interpreter found. Run `python scripts/setup-sam3-env.py` first."
    )


def copy_sam3_package(temp_dir: Path) -> Path:
    """Copy only the `sam3` package source into a temp dir for clean bundling.

    This excludes reference assets, videos, and test files that are not needed at
    inference time, keeping the sidecar smaller.
    """
    src = SAM3_REPO / "sam3"
    dst = temp_dir / "sam3"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "*.pyc", "__pycache__", ".git", ".github", "assets", "videos", "tests", "test*"
    ))
    return dst


def run_pyinstaller(target: str, python: Path, work_dir: Path) -> Path:
    """Invoke PyInstaller and return the produced binary path."""
    ext = ".exe" if sys.platform == "win32" else ""
    output_name = f"sam3-bridge-{target}"
    bin_name = output_name + ext

    BIN_DIR.mkdir(parents=True, exist_ok=True)

    # Bundle the `sam3` package source at the root of the PyInstaller temp dir.
    sam3_pkg = copy_sam3_package(work_dir)

    # Add the temp dir to PYTHONPATH so PyInstaller can analyze the `sam3` package.
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SAM3_REPO) + os.pathsep + env.get("PYTHONPATH", "")

    add_data_sep = ";" if sys.platform == "win32" else ":"

    cmd = [
        str(python),
        "-m",
        "PyInstaller",
        "--onefile",
        "--noconfirm",
        "--clean",
        "--name",
        output_name,
        "--distpath",
        str(BIN_DIR),
        "--workpath",
        str(work_dir / "build"),
        "--specpath",
        str(work_dir / "spec"),
        f"--add-data={str(sam3_pkg)}{add_data_sep}.",
        "--collect-submodules",
        "sam3",
        "--collect-data",
        "sam3",
        "--hidden-import",
        "sam3.model.sam3_image_processor",
        "--hidden-import",
        "sam3.model_builder",
        "--hidden-import",
        "sam3.model_management",
        str(BRIDGE_SCRIPT),
    ]

    # torch/transformers have heavy dynamic imports; collect all submodules and data.
    for pkg in ["torch", "torchvision", "transformers", "timm", "iopath", "huggingface_hub", "tqdm"]:
        cmd.extend(["--collect-submodules", pkg, "--collect-data", pkg])

    print("Building sidecar...")
    print(" ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, env=env)

    produced = BIN_DIR / bin_name
    if not produced.exists():
        raise RuntimeError(f"PyInstaller did not produce expected binary: {produced}")
    return produced


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the SAM3 bridge sidecar")
    parser.add_argument("--target", help="Rust target triple (e.g. x86_64-pc-windows-msvc)")
    args = parser.parse_args()

    target = get_target(args)
    python = find_python()
    print(f"Using Python: {python}")
    print(f"Target triple: {target}")

    with tempfile.TemporaryDirectory(prefix="sam3-sidecar-", dir=str(PROJECT_ROOT / "build")) as tmp:
        work_dir = Path(tmp)
        work_dir.mkdir(parents=True, exist_ok=True)
        binary = run_pyinstaller(target, python, work_dir)
        size_mb = binary.stat().st_size / (1024 * 1024)
        print(f"Sidecar built: {binary} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
