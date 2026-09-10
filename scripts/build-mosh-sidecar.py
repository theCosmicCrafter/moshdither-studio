#!/usr/bin/env python3
"""Build the datamosh (FFglitch) sidecar with PyInstaller.

WHY THIS EXISTS. `apply_ffglitch` shells out to `mosh_cli.py`, which needs a
Python interpreter AND numpy (`DatamoshLib/FFG_effects/basic_modes.py` imports
it). The installer shipped neither. `find_python()` fell back to whatever
`python.exe` happened to be on PATH, so datamoshing -- the app's signature
feature -- worked on a developer machine and failed on a clean one with
"Python interpreter not found. Install sam3_env or add python to PATH", a
message that means nothing to someone who just installed a video app.

Unlike the SAM3 sidecar this one is small (numpy and the vendored DatamoshLib /
pymosh, no torch), so it fits comfortably inside the installer and ships as a
normal `externalBin` entry.

Usage:
    python scripts/build-mosh-sidecar.py [--target <target-triple>]

Writes `src-tauri/bin/mosh-cli-<target>`.
"""

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
BACKEND = PROJECT_ROOT / "packages" / "python-backend"
ENTRY = BACKEND / "mosh_cli.py"
BIN_DIR = PROJECT_ROOT / "src-tauri" / "bin"

# Everything mosh_cli.py reaches at runtime. numpy is the only third-party one;
# DatamoshLib and pymosh are vendored in this repo.
REQUIRED_MODULES = ("numpy",)


def get_target(args: argparse.Namespace) -> str:
    if args.target:
        return args.target
    if env_target := os.environ.get("TAURI_TARGET_TRIPLE"):
        return env_target
    try:
        return subprocess.run(
            ["rustc", "--print", "host-tuple"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        if sys.platform == "win32":
            return "x86_64-pc-windows-msvc"
        if sys.platform == "darwin":
            return "aarch64-apple-darwin"
        return "x86_64-unknown-linux-gnu"


def _candidate_roots() -> list[Path]:
    """A worktree has no venv of its own; the one venv sits by the primary
    checkout. Mirrors build-sam3-sidecar.py so both find the same interpreter."""
    roots = [PROJECT_ROOT]
    parent = PROJECT_ROOT
    for _ in range(4):
        parent = parent.parent
        roots.append(parent)
    return roots


def find_python() -> Path:
    override = os.environ.get("MOSHDITHER_SAM3_PYTHON")
    if override:
        p = Path(override)
        if not p.exists():
            raise RuntimeError(f"MOSHDITHER_SAM3_PYTHON points at a missing file: {p}")
        return p
    candidates: list[Path] = []
    for root in _candidate_roots():
        for env in ("sam3_env_cpu", "sam3_env"):
            candidates.append(root / env / "Scripts" / "python.exe")
            candidates.append(root / env / "bin" / "python")
    for c in candidates:
        if c.exists():
            return c
    raise RuntimeError(
        "No interpreter with numpy found.\n"
        "Looked for sam3_env_cpu / sam3_env in:\n"
        + "\n".join("  " + str(r) for r in _candidate_roots())
        + "\n\nRun `npm run setup:sam3-env`, or set MOSHDITHER_SAM3_PYTHON."
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target")
    args = parser.parse_args()

    if not ENTRY.exists():
        print(f"error: {ENTRY} not found", file=sys.stderr)
        return 1

    python = find_python()
    print(f"Using interpreter: {python}")

    # PyInstaller treats a missing import as a warning and still exits 0, so a
    # broken sidecar would otherwise be discovered by a user rather than here.
    for module in REQUIRED_MODULES:
        probe = subprocess.run(
            [str(python), "-c", f"import {module}"], capture_output=True, text=True
        )
        if probe.returncode != 0:
            print(
                f"error: {python} cannot import {module!r}.\n"
                f"  The sidecar would build and then fail at runtime.\n"
                f"  {probe.stderr.strip()}",
                file=sys.stderr,
            )
            return 1

    target = get_target(args)
    # A target triple is [a-z0-9_.-] only; anything else is a typo or an
    # attempt to make the output land somewhere other than bin/.
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", target):
        print(f"error: {target!r} is not a target triple", file=sys.stderr)
        return 1
    output_name = f"mosh-cli-{target}"
    BIN_DIR.mkdir(parents=True, exist_ok=True)

    sep = ";" if sys.platform == "win32" else ":"
    # tempfile.TemporaryDirectory(dir=...) does not create parents; build/ may
    # not exist yet. (The SAM3 script's first real run died exactly here.)
    work_parent = PROJECT_ROOT / "build"
    work_parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(dir=work_parent, prefix="mosh-sidecar-") as tmp:
        work_dir = Path(tmp)
        # PyInstaller builds under a fixed name into the work dir, and the
        # result is renamed into bin/ afterwards. The target triple comes from
        # the command line or the environment, and this keeps it off the
        # PyInstaller command line altogether (Semgrep's tainted-subprocess
        # rule flagged it, and it never needed to be there).
        cmd = [
            str(python),
            "-m",
            "PyInstaller",
            "--onefile",
            "--noconfirm",
            "--clean",
            "--name",
            "mosh-cli",
            "--distpath",
            str(work_dir / "dist"),
            "--workpath",
            str(work_dir / "build"),
            "--specpath",
            str(work_dir / "spec"),
            # Vendored, and imported by name at runtime rather than statically
            # in a way PyInstaller can always follow.
            f"--add-data={BACKEND / 'DatamoshLib'}{sep}DatamoshLib",
            f"--add-data={BACKEND / 'pymosh'}{sep}pymosh",
            "--collect-submodules",
            "DatamoshLib",
            "--collect-submodules",
            "pymosh",
            "--collect-submodules",
            "numpy",
            str(ENTRY),
        ]
        env = os.environ.copy()
        env["PYTHONPATH"] = str(BACKEND) + os.pathsep + env.get("PYTHONPATH", "")
        print("Running:", " ".join(cmd))
        result = subprocess.run(cmd, env=env, cwd=str(PROJECT_ROOT))
        if result.returncode != 0:
            return result.returncode

        suffix = ".exe" if sys.platform == "win32" else ""
        built = work_dir / "dist" / ("mosh-cli" + suffix)
        if not built.exists():
            print(f"error: PyInstaller exited 0 but {built} is missing", file=sys.stderr)
            return 1
        exe = BIN_DIR / (output_name + suffix)
        # os.replace, not shutil.move: atomic when bin/ is on the same volume as
        # build/ (it is -- both sit under the project root), so a build that is
        # interrupted here leaves the old sidecar intact rather than a stub.
        os.replace(built, exe)
    print(f"Sidecar built: {exe} ({exe.stat().st_size / 1048576:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
