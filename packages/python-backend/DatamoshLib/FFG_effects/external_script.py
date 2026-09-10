#Author: Akash Bora
import os, subprocess
from pathlib import Path
from .basic_modes import _run, _scratch_dir

DIRPATH = Path(os.path.dirname(os.path.realpath(__file__)))
ffgac = os.path.join(str(DIRPATH.parent.parent),"FFglitch","ffgac")
ffedit = os.path.join(str(DIRPATH.parent.parent),"FFglitch","ffedit")

def mosh(input_video, output_video, mode, effect='', scriptfile='', gop=1000):

    if mode==1:
        script_path = scriptfile
    elif mode==2:
        script_path = os.path.join(str(DIRPATH),"jscripts",effect+".js")
    else:
        # Any other mode reached ffgac, then died at `script_path` with an
        # UnboundLocalError that pointed at the wrong line.
        raise ValueError(f"external_script.mosh: unknown mode {mode!r} (expected 1 or 2)")

    # The intermediate is a fixed name written to the current directory, so
    # this runs inside a private scratch directory like basic_modes.library
    # does (see _scratch_dir for the two problems that solves). Caller paths
    # are made absolute first: relative ones would resolve against the
    # scratch directory instead of where the caller meant.
    input_video = os.path.abspath(str(input_video))
    output_video = os.path.abspath(str(output_video))
    script_path = os.path.abspath(str(script_path))

    # See basic_modes._run for why these are argument lists with return-code
    # checking rather than shell strings: a user-chosen path went straight into
    # a shell command line, and failures were swallowed.
    with _scratch_dir():
        _run([ffgac, "-i", input_video, "-an", "-mpv_flags", "+nopimb+forcemv",
              "-qscale:v", "0", "-b:v", "20M", "-minrate", "20M", "-maxrate", "20M",
              "-bufsize", "2M", "-g", str(gop),
              "-vcodec", "mpeg2video", "-f", "rawvideo", "-y", "tmp.mpg"])
        _run([ffedit, "-i", "tmp.mpg", "-f", "mv", "-s", script_path, "-o", output_video])
