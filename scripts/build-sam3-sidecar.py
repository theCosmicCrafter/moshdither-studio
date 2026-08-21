#!/usr/bin/env python3
"""Build the SAM3 bridge sidecar using PyInstaller.

The sidecar is a single-file executable that bundles a Python interpreter,
torch/opencv, and the `sam3` package source. It communicates with the Rust
backend over stdin/stdout using the same JSON-line protocol as
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


def _candidate_roots() -> list[Path]:
    """Directories that may hold a sam3_env, nearest first.

    A git worktree lives at `<repo>/.claude/worktrees/<name>` and does not get
    its own venv -- the one venv sits beside the primary checkout. Searching only
    PROJECT_ROOT meant a worktree build silently fell through to system Python,
    which has none of the SAM3 dependencies. PyInstaller then warned that it
    could not import `sam3`, exited 0 anyway, and produced a 405 MB binary that
    dies on `ModuleNotFoundError: No module named 'iopath'` at startup.
    """
    roots = [PROJECT_ROOT]
    parent = PROJECT_ROOT
    for _ in range(4):
        parent = parent.parent
        roots.append(parent)
    return roots


# Packages the frozen sidecar cannot run without. Checked against the chosen
# interpreter before building, because PyInstaller treats a missing one as a
# warning and still exits 0.
REQUIRED_MODULES = ("torch", "iopath", "sam3")
NL = chr(10)
NLNL = chr(10) + chr(10)


def find_python() -> Path:
    """Locate the SAM3 Python interpreter, preferring an explicit override."""
    override = os.environ.get("MOSHDITHER_SAM3_PYTHON")
    if override:
        p = Path(override)
        if not p.exists():
            raise RuntimeError(f"MOSHDITHER_SAM3_PYTHON points at a missing file: {p}")
        return p

    candidates: list[Path] = []
    for root in _candidate_roots():
        candidates.append(root / "sam3_env" / "Scripts" / "python.exe")
        candidates.append(root / "sam3_env" / "bin" / "python")
    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise RuntimeError(
        "No sam3_env interpreter found.\n"
        "Searched for sam3_env in:\n"
        + "\n".join("  " + str(r) for r in _candidate_roots())
        + "\n\nRun `npm run setup:sam3-env`, or set MOSHDITHER_SAM3_PYTHON to an\n"
        "interpreter that has torch, iopath and sam3 installed.\n"
        "\n"
        "Refusing to fall back to system Python: it lacks the SAM3 dependencies,\n"
        "and PyInstaller would still emit a binary that fails at startup."
    )


def verify_interpreter(python: Path) -> None:
    """Fail before a 15-minute build if the interpreter cannot import the deps."""
    missing = []
    for mod in REQUIRED_MODULES:
        probe = subprocess.run(
            [str(python), "-c", "import " + mod],
            capture_output=True,
            text=True,
        )
        if probe.returncode != 0:
            missing.append(mod)
    # A CPU-only torch yields a sidecar that builds, packages and starts -- and
    # then cannot load the model at all. Upstream SAM3 is GPU-only by design: it
    # hardcodes device="cuda" in 13 files (sam3/model/position_encoding.py:55,
    # sam3/model/decoder.py:283, sam3/model/io_utils.py, ...). Worse, a bundled
    # sidecar takes precedence over a working CUDA venv in sam3_engine.rs, so
    # shipping a CPU build actively breaks SAM3 for users who already had it.
    if not missing:
        probe = subprocess.run(
            [str(python), "-c", "import torch; print(torch.version.cuda or '')"],
            capture_output=True,
            text=True,
        )
        if probe.returncode == 0 and not probe.stdout.strip():
            raise RuntimeError(
                "This interpreter has a CPU-only torch build."
                + NLNL
                + "  interpreter: "
                + str(python)
                + NLNL
                + 'SAM3 hardcodes device="cuda" in 13 upstream files, so a CPU sidecar'
                + NL
                + "starts and then fails with:"
                + NL
                + "  Model load failed: Torch not compiled with CUDA enabled"
                + NLNL
                + "A bundled sidecar also wins over a local CUDA venv, so shipping one"
                + NL
                + "would break SAM3 for users who already have it working."
                + NLNL
                + "Build against a CUDA environment, or skip the sidecar with"
                + NL
                + "`npm run tauri:build:no-sam3` and let users point"
                + NL
                + "MOSHDITHER_SAM3_PYTHON at their own CUDA interpreter."
            )

    if missing:
        raise RuntimeError(
            "Interpreter is missing modules the sidecar requires: "
            + ", ".join(missing)
            + "\n  interpreter: " + str(python)
            + "\n\nPyInstaller only warns about these and still exits 0, so the\n"
            "build would appear to succeed and produce a binary that dies on\n"
            "startup with ModuleNotFoundError. Install them into that\n"
            "environment, or run `npm run setup:sam3-env`."
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

    # torch has heavy dynamic imports; collect all submodules and data. Same
    # for its companions here -- none of these are transformers/rembg/
    # onnxruntime, which only the recycled legacy RPC backend ever needed
    # (see docs/SECURITY_FINDINGS_2026-07-26.md §3); sam3_bridge.py and the
    # vendored sam3 package never import them.
    for pkg in ["torch", "torchvision", "timm", "iopath", "huggingface_hub", "tqdm"]:
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
    verify_interpreter(python)
    print(f"Target triple: {target}")

    build_root = PROJECT_ROOT / "build"
    build_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sam3-sidecar-", dir=str(build_root)) as tmp:
        work_dir = Path(tmp)
        work_dir.mkdir(parents=True, exist_ok=True)
        binary = run_pyinstaller(target, python, work_dir)
        size_mb = binary.stat().st_size / (1024 * 1024)
        print(f"Sidecar built: {binary} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
