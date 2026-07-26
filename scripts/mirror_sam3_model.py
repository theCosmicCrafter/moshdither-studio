#!/usr/bin/env python3
r"""
Mirror a SAM3 checkpoint from an external drive into the MoshDither model path.

On Windows, the default model location is:
    %USERPROFILE%\.moshdither\models\sam3

This script creates a directory junction (or symlink) so that the external model
folder appears at the default path without copying the large checkpoint file.

Usage:
    python scripts/mirror_sam3_model.py D:\models\sam3

You can also set SAM3_CHECKPOINT explicitly instead of mirroring:
    $env:SAM3_CHECKPOINT="D:\models\sam3\sam3.pt"
"""

import os
import sys
from pathlib import Path


def get_default_model_dir() -> Path:
    """Return the default SAM3 model directory."""
    return Path.home() / ".moshdither" / "models" / "sam3"


def create_windows_junction(link: Path, target: Path):
    """Create a Windows directory junction."""
    import subprocess

    # Junctions only work on directories, so link must be the parent dir path.
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists() or link.is_symlink():
        raise RuntimeError(f"Link path already exists: {link}. Remove it first.")

    # mklink is a cmd.exe builtin, so it cannot be executed directly -- but
    # passing a list with shell=True is the dangerous combination: Python joins
    # the list into one string and hands it to the shell, so a path containing
    # shell metacharacters is interpreted rather than treated as a path.
    #
    # Invoking cmd explicitly with shell=False keeps the arguments as distinct
    # argv entries, which Python quotes for us.
    cmd = ["cmd", "/c", "mklink", "/J", str(link), str(target)]
    result = subprocess.run(cmd, shell=False, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Failed to create junction: {result.stderr}")


def create_symlink(link: Path, target: Path):
    """Create a symbolic link, with platform-specific fallback."""
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists() or link.is_symlink():
        raise RuntimeError(f"Link path already exists: {link}. Remove it first.")

    if sys.platform == "win32":
        # On Windows, directory symlinks require admin or Developer Mode.
        # If the target is a directory, try a junction first; otherwise a file symlink.
        if target.is_dir():
            try:
                create_windows_junction(link, target)
                return
            except RuntimeError as e:
                print(f"[WARN] Junction failed ({e}); trying symbolic link (may need admin/Developer Mode).")
        os.symlink(str(target), str(link), target_is_directory=target.is_dir())
    else:
        os.symlink(str(target), str(link))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nUsage: python scripts/mirror_sam3_model.py <source_dir>")
        print("Example: python scripts/mirror_sam3_model.py D:\\models\\sam3")
        sys.exit(1)

    source_dir = Path(sys.argv[1]).resolve()
    if not source_dir.exists():
        print(f"[ERROR] Source directory does not exist: {source_dir}")
        sys.exit(1)
    if not source_dir.is_dir():
        print(f"[ERROR] Source must be a directory: {source_dir}")
        sys.exit(1)

    link_dir = get_default_model_dir()
    print(f"[INFO] Mirroring {source_dir}")
    print(f"       -> {link_dir}")

    try:
        create_symlink(link_dir, source_dir)
        print(f"[OK] Mirror created successfully.")
        print(f"     The app will now find the checkpoint at {link_dir / 'sam3.pt'}")
    except RuntimeError as e:
        print(f"[ERROR] {e}")
        print("\nAlternative: set the SAM3_CHECKPOINT environment variable instead:")
        print(f"    $env:SAM3_CHECKPOINT=\"{source_dir / 'sam3.pt'}\"")
        sys.exit(1)


if __name__ == "__main__":
    main()
