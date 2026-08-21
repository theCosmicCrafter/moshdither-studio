#!/usr/bin/env python3
"""Create a local Python environment for SAM3 and install dependencies.

This environment is used for both development (`sam3_env`) and as the build
environment for the PyInstaller sidecar. It is intentionally separate from the
system Python so that the bundled sidecar is reproducible and self-contained.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
# Overridable so a CPU-only environment can be built alongside an existing
# CUDA one rather than destroying it.
VENV_DIR = Path(os.environ.get("SAM3_VENV_DIR") or (PROJECT_ROOT / "sam3_env"))
REQUIREMENTS = PROJECT_ROOT / "packages" / "python-backend" / "requirements.txt"


def find_system_python() -> str:
    """Find a Python 3.10+ interpreter for the venv."""
    for name in ["python3", "python"]:
        path = shutil.which(name)
        if not path:
            continue
        check = subprocess.run(
            [path, "-c", "import sys; assert sys.version_info >= (3, 10)"],
            capture_output=True,
        )
        if check.returncode == 0:
            return path
        print(f"Rejected {path}: Python 3.10+ required", file=sys.stderr)
    raise RuntimeError(
        "No Python 3.10+ interpreter found on PATH. Install Python 3.10+ to continue."
    )


def run(cmd: list[str], **kwargs) -> None:
    print(" ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kwargs)


def main() -> None:
    if not REQUIREMENTS.exists():
        raise RuntimeError(
            f"SAM3 requirements not found: {REQUIREMENTS}\n"
            "Make sure packages/python-backend/requirements.txt is present."
        )

    if VENV_DIR.exists():
        print(f"Using existing venv: {VENV_DIR}")
    else:
        python = find_system_python()
        print(f"Creating venv at {VENV_DIR} using {python}")
        run([python, "-m", "venv", str(VENV_DIR)])

    if sys.platform == "win32":
        venv_python = VENV_DIR / "Scripts" / "python.exe"
        venv_pip = VENV_DIR / "Scripts" / "pip.exe"
    else:
        venv_python = VENV_DIR / "bin" / "python"
        venv_pip = VENV_DIR / "bin" / "pip"

    if not venv_python.exists():
        raise RuntimeError(f"venv created but interpreter not found at {venv_python}")

    print("Upgrading pip...")
    run([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"])

    # Torch flavour matters enormously for packaging. On Windows the default
    # PyPI wheel is the CUDA build, which drags in ~3.5 GB of CUDA libraries --
    # `torch/lib` alone reaches 4 GB. A PyInstaller sidecar built from it is
    # ~2.9 GB, and NEITHER Windows installer format can package that: makensis
    # is 32-bit and fails with "failed creating mmap", and WiX/MSI exceeds the
    # 2 GB cabinet limit. A CUDA sidecar therefore cannot ship at all.
    #
    # SAM3_TORCH_CPU=1 installs the CPU-only wheels, which package fine. GPU
    # users keep full speed by pointing MOSHDITHER_SAM3_PYTHON at a CUDA env,
    # which takes precedence over the bundled sidecar.
    if os.environ.get("SAM3_TORCH_CPU"):
        # torch must come from the CPU index FIRST, on its own. --index-url
        # replaces PyPI rather than adding to it, so installing the whole
        # requirements file against it fails: timm, Pillow and the rest simply
        # are not published there ("No matching distribution found for timm").
        # Installing torch alone pins the CPU build, and the subsequent PyPI
        # install then leaves the already-satisfied torch untouched.
        print("Installing CPU-only torch...")
        run(
            [
                str(venv_pip), "install",
                "torch>=2.0.0,<3", "torchvision>=0.15.0,<1",
                "--index-url", "https://download.pytorch.org/whl/cpu",
            ]
        )
        print("Installing remaining SAM3 backend requirements...")
        torch_args = []
    elif os.environ.get("SAM3_CUDA"):
        print("Installing SAM3 backend requirements (explicit CUDA index)...")
        torch_args = ["--extra-index-url", "https://download.pytorch.org/whl/cu121"]
    else:
        print("Installing SAM3 backend requirements (default wheels)...")
        torch_args = []
    run([str(venv_pip), "install", "-r", str(REQUIREMENTS)] + torch_args)

    # The `sam3` package itself is NOT in requirements.txt -- it is the vendored
    # upstream checkout, installed editable. Without this step the environment
    # looks complete but cannot build a sidecar: PyInstaller fails to collect
    # `sam3`, warns, exits 0 anyway, and emits a binary that dies at startup on
    # ModuleNotFoundError. Every env produced by this script had that hole.
    sam3_repo = PROJECT_ROOT / "packages" / "python-backend" / "sam3_repo"
    if not sam3_repo.exists():
        parent_repo = PROJECT_ROOT.parent / "packages" / "python-backend" / "sam3_repo"
        if parent_repo.exists():
            sam3_repo = parent_repo
    if sam3_repo.exists():
        print(f"Installing the sam3 package (editable) from {sam3_repo} ...")
        # --no-deps: sam3's pyproject pins numpy>=1.26,<2, while this project's
        # requirements.txt uses numpy 2.x. Honouring that stale upstream bound
        # makes pip try to build numpy 1.x from source, which has no wheel for
        # Python 3.13 and fails in meson. Dependencies are already satisfied by
        # requirements.txt above.
        # --no-build-isolation: the isolated build env otherwise re-resolves the
        # same numpy constraint and fails identically.
        run(
            [
                str(venv_pip), "install", "-e", str(sam3_repo),
                "--no-deps", "--no-build-isolation",
            ]
        )
    else:
        raise RuntimeError(
            "sam3_repo not found; the environment would be unable to build a "
            "sidecar.\n"
            f"  looked in: {sam3_repo}\n"
            "See docs/SAM3_SETUP.md for how to obtain a compatible checkout."
        )

    print("Installing PyInstaller for sidecar builds...")
    # Pin to the 6.x line; upgrade deliberately after validating a new version.
    run([str(venv_pip), "install", "pyinstaller>=6.0,<7"])

    print("SAM3 environment ready.")
    print(f"  Python: {venv_python}")
    print(f"  Activate: {VENV_DIR}")


if __name__ == "__main__":
    main()
