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
VENV_DIR = PROJECT_ROOT / "sam3_env"
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

    print("Installing SAM3 backend requirements...")
    run(
        [str(venv_pip), "install", "-r", str(REQUIREMENTS)]
        + (["--extra-index-url", "https://download.pytorch.org/whl/cu121"] if os.environ.get("SAM3_CUDA") else [])
    )

    print("Installing PyInstaller for sidecar builds...")
    # Pin to the 6.x line; upgrade deliberately after validating a new version.
    run([str(venv_pip), "install", "pyinstaller>=6.0,<7"])

    print("SAM3 environment ready.")
    print(f"  Python: {venv_python}")
    print(f"  Activate: {VENV_DIR}")


if __name__ == "__main__":
    main()
