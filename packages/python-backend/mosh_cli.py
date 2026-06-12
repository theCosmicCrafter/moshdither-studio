import sys
import os
import json
import re
import tempfile
import subprocess

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

from DatamoshLib.Tomato import tomato
from DatamoshLib.Original import classic, repeat, pymodes, classic_new
from DatamoshLib.FFG_effects import basic_modes, external_script

# Override ffgac and ffedit inside imported modules
basic_modes.ffgac = ffgac_path
basic_modes.ffedit = ffedit_path
external_script.ffgac = ffgac_path
external_script.ffedit = ffedit_path

# Helper to run ffmpeg
def ffmpeg_convert(input_path, output_path, extra_args=None):
    """Run ffmpeg safely using argument list (no shell injection)."""
    extra_args = extra_args or []
    cmd = [ffmpeg_path, "-y", "-i", input_path] + extra_args + [output_path]
    print(f"Running ffmpeg: {cmd}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ffmpeg failed with code {result.returncode}")
        print(f"stderr: {result.stderr}")
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:500]}")

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
        
    # Replace variables based on params
    if "zoom" in params:
        content = re.sub(r"var\s+ZOOM\s*=\s*-?\d+(\.\d+)?\s*;", f"var ZOOM = {params['zoom']};", content)
    if "delay" in params:
        content = re.sub(r"var\s+delay\s*=\s*\d+\s*;", f"var delay = {params['delay']};", content)
    if "feedback" in params:
        content = re.sub(r"var\s+feedback\s*=\s*\d+(\.\d+)?\s*;", f"var feedback = {params['feedback']};", content)
    if "somePercentage" in params:
        content = re.sub(r"var\s+SOME_PERCENTAGE\s*=\s*\d+(\.\d+)?\s*;", f"var SOME_PERCENTAGE = {params['somePercentage']};", content)
    if "multiple" in params:
        content = re.sub(r"var\s+MULTIPLE\s*=\s*\d+\s*;", f"var MULTIPLE = {params['multiple']};", content)
    if "tailLength" in params:
        content = re.sub(r"var\s+tail_length\s*=\s*\d+\s*;", f"var tail_length = {params['tailLength']};", content)
    if "threshold" in params:
        content = re.sub(r"(let|var)\s+threshold\s*=\s*\d+(\.\d+)?\s*;", f"\\1 threshold = {params['threshold']};", content)
    if "origGravity" in params:
        content = re.sub(r"var\s+orig_gravity\s*=\s*-?\d+\s*;", f"var orig_gravity = {params['origGravity']};", content)
    if "frameCount" in params:
        content = re.sub(r"var\s+frameCount\s*=\s*\d+\s*;", f"var frameCount = {params['frameCount']};", content)
    if "nFrames" in params:
        content = re.sub(r"var\s+nFrames\s*=\s*\d+\s*;", f"var nFrames = {params['nFrames']};", content)
    if "movementThreshold" in params:
        content = re.sub(r"var\s+movement_threshold\s*=\s*\d+\s*;", f"var movement_threshold = {params['movementThreshold']};", content)
    if "randomness" in params:
        content = re.sub(r"var\s+randomness\s*=\s*\d+\s*;", f"var randomness = {params['randomness']};", content)
    if "magnitude" in params:
        content = re.sub(r"var\s+MAGNITUDE\s*=\s*\d+\s*;", f"var MAGNITUDE = {params['magnitude']};", content)
        
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
