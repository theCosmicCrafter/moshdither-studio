import json
import math
import os
import re
import subprocess
import sys
import tempfile

# Add current folder to python path to resolve DatamoshLib imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Monkeypatch binary paths for DatamoshLib modules before importing them.
# In a self-contained Electron build, the main process sets these env vars
# so the script finds bundled binaries regardless of platform.
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

ffgac_path = os.environ.get(
    "MOSHDITHER_FFGAC_PATH",
    os.path.join(BASE_DIR, "assets", "bin", "ffglitch-0.10.2-windows-x86_64", "ffgac.exe"),
)
ffedit_path = os.environ.get(
    "MOSHDITHER_FFEDIT_PATH",
    os.path.join(BASE_DIR, "assets", "bin", "ffglitch-0.10.2-windows-x86_64", "ffedit.exe"),
)
ffmpeg_path = os.environ.get(
    "MOSHDITHER_FFMPEG_PATH",
    os.path.join(BASE_DIR, "assets", "bin", "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe"),
)

from DatamoshLib.FFG_effects import basic_modes, external_script
from DatamoshLib.Original import classic, classic_new, pymodes, repeat
from DatamoshLib.Tomato import tomato

# Override ffgac and ffedit inside imported modules
basic_modes.ffgac = ffgac_path
basic_modes.ffedit = ffedit_path
external_script.ffgac = ffgac_path
external_script.ffedit = ffedit_path

def _ffmpeg_error_summary(stderr, max_chars=600):
    """Pull the part of ffmpeg's stderr that actually says what went wrong.

    ffmpeg opens every run with a banner -- version line, build flags, then one
    `lib*` line per linked library -- which on its own runs well past 500
    characters. Reporting `stderr[:500]` therefore surfaced nothing but that
    boilerplate and cut off before the real message, which ffmpeg prints last.
    Errors that reached the UI looked like "ffmpeg failed: ffmpeg version
    8.0-essentials_build ... --enable-gpl --enable-version3 ..." and were
    impossible to act on.

    Take the tail instead, after dropping the banner and progress spam.
    """
    if not stderr:
        return "(no stderr)"
    skip_prefixes = (
        "ffmpeg version",
        "built with",
        "configuration:",
        "lib",
        "Press [q]",
        "frame=",
        "size=",
        "video:",
    )
    lines = [ln.rstrip() for ln in stderr.splitlines() if ln.strip()]
    meaningful = [ln for ln in lines if not ln.lstrip().startswith(skip_prefixes)]
    # If filtering removed everything, the banner really was all there was.
    tail = meaningful or lines
    selected = tail[-12:]
    # Drop whole lines to fit the budget rather than slicing characters, which
    # left the message opening mid-token (".​..393733 (Error number ...").
    while selected and len("\n".join(selected)) > max_chars and len(selected) > 1:
        selected.pop(0)
    summary = "\n".join(selected)
    if len(summary) > max_chars:
        # A single line longer than the budget: keep its end, where ffmpeg's
        # reason sits, but say so rather than appearing to start mid-word.
        summary = "(truncated) ..." + summary[-max_chars:]
    return summary


# Helper to run ffmpeg
def ffmpeg_convert(input_path, output_path, extra_args=None):
    """Run ffmpeg safely using argument list (no shell injection)."""
    extra_args = extra_args or []

    # ffmpeg_path comes from MOSHDITHER_FFMPEG_PATH, which the Tauri host sets
    # so a packaged build finds its bundled binary. Command injection is already
    # impossible here -- this is a list with shell=False, so the OS receives
    # argv directly and no shell parses it -- but an env var can still point at
    # a *different* executable. Checking it is a real file turns that into a
    # clear error instead of silently running whatever is there, and it also
    # catches the far more common case of a typo'd or stale path.
    if not os.path.isfile(ffmpeg_path):
        raise RuntimeError(
            f"ffmpeg not found at {ffmpeg_path!r}. Set MOSHDITHER_FFMPEG_PATH to a "
            "valid ffmpeg binary, or leave it unset to use the bundled one."
        )

    cmd = [ffmpeg_path, "-y", "-i", input_path] + extra_args + [output_path]
    print(f"Running ffmpeg: {cmd}")
    # List form with shell=False cannot inject, and the executable is validated
    # above.
    #
    # timeout: this whole script is itself given an overall bound and
    # cancellation by the Rust host (see apply_ffglitch/run_ffglitch_subprocess
    # in src-tauri/src/commands.rs), which kills THIS process if it hangs --
    # but killing this process does not, on Windows, kill an already-spawned
    # ffmpeg child on its own. A per-call timeout here lets subprocess.run's
    # own kill logic clean up that specific child immediately, rather than
    # leaving it orphaned until the whole process tree is eventually reaped.
    #
    try:
        # The marker must sit on the line immediately before the call.
        # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1200)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"ffmpeg timed out after {e.timeout}s") from e
    if result.returncode != 0:
        print(f"ffmpeg failed with code {result.returncode}")
        print(f"stderr: {result.stderr}")
        raise RuntimeError(
            f"ffmpeg failed (exit {result.returncode}) converting "
            f"{os.path.basename(input_path)} -> {os.path.basename(output_path)}: "
            f"{_ffmpeg_error_summary(result.stderr)}"
        )

def configure_js_script(effect_name, params):
    # Locate original JS file
    jscript_dir = os.path.join(os.path.dirname(__file__), "DatamoshLib", "FFG_effects", "jscripts")
    js_path = os.path.join(jscript_dir, f"{effect_name}.js")

    # Try finding exact case-insensitive match or match replacing dashes with spaces
    if not os.path.exists(js_path):
        for f in os.listdir(jscript_dir):
            cleaned_f = f.lower().replace("-", " ").replace(" ", "")
            cleaned_effect = effect_name.lower().replace("-", " ").replace(" ", "")
            if cleaned_f == f"{cleaned_effect}.js":
                js_path = os.path.join(jscript_dir, f)
                break

    if not os.path.exists(js_path):
        raise FileNotFoundError(f"JS effect file not found: {effect_name} at {js_path}")

    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    def _sanitize_number(val, default=0):
        """Coerce a param value to a safe numeric string for JS interpolation."""
        try:
            f = float(val)
            if not (math.isfinite(f)):
                return str(default)
            return str(int(f)) if f == int(f) else str(f)
        except (ValueError, TypeError):
            return str(default)

    def _sanitize_int(val, default=0):
        """Coerce a param value to a safe integer string for JS interpolation."""
        try:
            return str(int(float(val)))
        except (ValueError, TypeError):
            return str(default)

    # Replace variables based on params — all values sanitized to prevent JS injection
    if "zoom" in params:
        content = re.sub(r"var\s+ZOOM\s*=\s*-?\d+(\.\d+)?\s*;", f"var ZOOM = {_sanitize_number(params['zoom'])};", content)
    if "delay" in params:
        content = re.sub(r"var\s+delay\s*=\s*\d+\s*;", f"var delay = {_sanitize_int(params['delay'])};", content)
    if "feedback" in params:
        content = re.sub(r"var\s+feedback\s*=\s*\d+(\.\d+)?\s*;", f"var feedback = {_sanitize_number(params['feedback'])};", content)
    if "somePercentage" in params:
        content = re.sub(r"var\s+SOME_PERCENTAGE\s*=\s*\d+(\.\d+)?\s*;", f"var SOME_PERCENTAGE = {_sanitize_number(params['somePercentage'])};", content)
    if "multiple" in params:
        content = re.sub(r"var\s+MULTIPLE\s*=\s*\d+\s*;", f"var MULTIPLE = {_sanitize_int(params['multiple'])};", content)
    if "tailLength" in params:
        content = re.sub(r"var\s+tail_length\s*=\s*\d+\s*;", f"var tail_length = {_sanitize_int(params['tailLength'])};", content)
    if "threshold" in params:
        content = re.sub(r"(let|var)\s+threshold\s*=\s*\d+(\.\d+)?\s*;", f"\\1 threshold = {_sanitize_number(params['threshold'])};", content)
    if "origGravity" in params:
        content = re.sub(r"var\s+orig_gravity\s*=\s*-?\d+\s*;", f"var orig_gravity = {_sanitize_int(params['origGravity'])};", content)
    if "frameCount" in params:
        content = re.sub(r"var\s+frameCount\s*=\s*\d+\s*;", f"var frameCount = {_sanitize_int(params['frameCount'])};", content)
    if "nFrames" in params:
        content = re.sub(r"var\s+nFrames\s*=\s*\d+\s*;", f"var nFrames = {_sanitize_int(params['nFrames'])};", content)
    if "movementThreshold" in params:
        content = re.sub(r"var\s+movement_threshold\s*=\s*\d+\s*;", f"var movement_threshold = {_sanitize_int(params['movementThreshold'])};", content)
    if "randomness" in params:
        content = re.sub(r"var\s+randomness\s*=\s*\d+\s*;", f"var randomness = {_sanitize_int(params['randomness'])};", content)
    if "magnitude" in params:
        content = re.sub(r"var\s+MAGNITUDE\s*=\s*\d+\s*;", f"var MAGNITUDE = {_sanitize_int(params['magnitude'])};", content)

    temp_fd, temp_script_path = tempfile.mkstemp(suffix=".js", prefix="mosh_script_")
    os.close(temp_fd)
    with open(temp_script_path, "w", encoding="utf-8") as f:
        f.write(content)

    return temp_script_path

def main():
    if len(sys.argv) < 2:
        print("Usage: python mosh_cli.py <config_json_path>")
        sys.exit(1)

    config_path = sys.argv[1]
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    input_path = config["input"]
    output_path = config["output"]
    mode = config["mode"] # e.g. classic, shuffle, tomato-bloom, zoom, delay, etc.
    params = config.get("params", {})

    # 1. Automosh (Tomato) Modes: Bloom, Pulse, Overlap, Jiggle, Void, Reverse, Invert, Random
    tomato_modes = ["bloom", "pulse", "overlap", "jiggle", "void", "reverse", "invert", "random"]

    # 2. Original AVI Modes: Classic, Classic2, Repeat, Glide, Sort, Echo
    original_modes = ["classic", "classic2", "repeat", "glide", "sort", "echo"]

    # 3. FFglitch built-in Python modes: Fluid, Stretch, Motion Transfer, Shuffle (basic), Rise, Water Bloom, Combine
    basic_modes_list = ["fluid", "stretch", "motion_transfer", "shuffle_basic", "rise", "water_bloom", "combine"]

    # 4. JS effects modes: Zoom, Delay, Buffer, Noise, Shift, Sink, Slice, Stop, Vibrate, Invert-Reverse, Mirror, Shear, Slam Zoom
    js_effects = ["zoom", "delay", "buffer", "noise", "shift", "sink", "slice", "stop", "vibrate", "invert-reverse", "mirror", "shear", "slam zoom"]

    temp_dir = tempfile.gettempdir()

    if mode in tomato_modes:
        temp_in = os.path.join(temp_dir, f"tomato_in_{os.path.basename(input_path)}.avi")
        temp_corrupted = os.path.join(temp_dir, f"tomato_corrupted_{os.path.basename(input_path)}.avi")

        try:
            # Step 1: Convert to AVI using x264 with specific bitrate limit
            ffmpeg_convert(input_path, temp_in, ["-c:v", "libx264", "-preset", "medium", "-b:v", "2M", "-minrate", "2M", "-maxrate", "2M", "-bufsize", "2M"])

            # Step 2: Mosh using Tomato
            count = params.get("count", 20)
            n_frame = params.get("frame", 1)
            kill_rate = params.get("kill", 0.7)
            keep_audio = 1 if params.get("keepAudio", True) else 0
            keep_frame = 1 if params.get("keepFrame", True) else 0

            tomato.mosh(
                infile=temp_in,
                outfile=temp_corrupted,
                m=mode,
                c=count,
                n=n_frame,
                a=keep_audio,
                f=keep_frame,
                k=kill_rate
            )

            # Step 3: Re-encode corrupted AVI back to target container
            ffmpeg_convert(temp_corrupted, output_path, ["-c:v", "libx264", "-pix_fmt", "yuv420p"])
        finally:
            if os.path.exists(temp_in):
                os.remove(temp_in)
            if os.path.exists(temp_corrupted):
                os.remove(temp_corrupted)

    elif mode in original_modes:
        temp_in = os.path.join(temp_dir, f"orig_in_{os.path.basename(input_path)}.avi")
        temp_corrupted = os.path.join(temp_dir, f"orig_corrupted_{os.path.basename(input_path)}.avi")

        try:
            # Step 1: Convert to AVI without B-frames
            ffmpeg_convert(input_path, temp_in, ["-bf", "0", "-b:v", "10000k"])

            # Step 2: Apply specific mosh mode
            if mode == "classic":
                classic.Datamosh(temp_in, temp_corrupted, s=params.get("start", 0), e=params.get("end", 10), p=params.get("p", 1), fps=30)
            elif mode == "classic2":
                classic_new.Datamosh(temp_in, temp_corrupted, s=params.get("startFrame", 0), e=params.get("endFrame", 1000), fps=30)
            elif mode == "repeat":
                repeat.Datamosh(temp_in, temp_corrupted, s=params.get("startFrame", 0), e=params.get("endFrame", 1000), p=params.get("p", 5), fps=30)
            elif mode == "glide":
                pymodes.library.glide(params.get("p", 5), temp_in, temp_corrupted)
            elif mode == "sort":
                keep_first = 0 if params.get("keepFirst", True) else 1
                reverse = params.get("reverse", False)
                pymodes.library.avi_sort(temp_in, temp_corrupted, mode=keep_first, rev=reverse)
            elif mode == "echo":
                pymodes.library.process_streams(temp_in, temp_corrupted, mid=params.get("mid", 0.5))

            # Step 3: Re-encode corrupted AVI
            ffmpeg_convert(temp_corrupted, output_path, ["-c:v", "libx264", "-pix_fmt", "yuv420p"])
        finally:
            if os.path.exists(temp_in):
                os.remove(temp_in)
            if os.path.exists(temp_corrupted):
                os.remove(temp_corrupted)

    elif mode in basic_modes_list or mode in js_effects:
        temp_corrupted = os.path.join(temp_dir, f"ffg_out_{os.path.basename(input_path)}.mpg")
        temp_js = None

        try:
            gop = params.get("gop", 1000)

            if mode == "fluid":
                basic_modes.library(input_path, temp_corrupted, mode=3, fluidity=params.get("fluidity", 5), gop=gop)
            elif mode == "stretch":
                direction = 1 if params.get("direction", "horizontal") == "horizontal" else 0
                basic_modes.library(input_path, temp_corrupted, mode=2, vh=direction, gop=gop)
            elif mode == "motion_transfer":
                motion_video = params.get("motionUrl")
                if not motion_video:
                    raise ValueError("motionUrl parameter is required for motion_transfer mode")
                basic_modes.library(input_path, temp_corrupted, mode=1, extract_from=motion_video, gop=gop)
            elif mode == "shuffle_basic":
                basic_modes.library(input_path, temp_corrupted, mode=4, size=params.get("chunkSize", 1), gop=gop)
            elif mode == "rise":
                start_f = params.get("startFrame", 1)
                end_f = params.get("endFrame", 100)
                basic_modes.library(input_path, temp_corrupted, mode=5, s=start_f, e=(end_f - start_f), gop=gop)
            elif mode == "water_bloom":
                pos_f = params.get("positionFrame", 1)
                repeat_c = params.get("repeatCount", 20)
                basic_modes.library(input_path, temp_corrupted, mode=6, f=pos_f, r=repeat_c, gop=gop)
            elif mode == "combine":
                combine_videos = params.get("combineVideos", [])
                if isinstance(combine_videos, str):
                    combine_videos = [combine_videos]
                # Normalize and clean paths
                combine_videos = [v.replace('media://', '') for v in combine_videos if v]
                if len(combine_videos) < 2:
                    raise ValueError("At least 2 video paths are required for combine mode")
                basic_modes.library(combine_videos, temp_corrupted, mode=7, gop=gop)
            elif mode in js_effects:
                # Dynamically write custom JS script
                temp_js = configure_js_script(mode, params)
                external_script.mosh(input_path, temp_corrupted, mode=1, scriptfile=temp_js, gop=gop)

            # Convert MPG to MP4
            ffmpeg_convert(temp_corrupted, output_path, ["-c:v", "libx264", "-pix_fmt", "yuv420p"])
        finally:
            if temp_js and os.path.exists(temp_js):
                os.remove(temp_js)
            if os.path.exists(temp_corrupted):
                os.remove(temp_corrupted)
    else:
        raise ValueError(f"Unknown datamoshing mode: {mode}")

    print("Mosh pipeline completed successfully!")

if __name__ == "__main__":
    main()
