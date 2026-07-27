#Author: Akash Bora
import os, subprocess
from pathlib import Path
from .basic_modes import _run

DIRPATH = Path(os.path.dirname(os.path.realpath(__file__)))
ffgac = os.path.join(str(DIRPATH.parent.parent),"FFglitch","ffgac")
ffedit = os.path.join(str(DIRPATH.parent.parent),"FFglitch","ffedit")

def mosh(input_video, output_video, mode, effect='', scriptfile='', gop=1000):
    
    if mode==1:
        script_path = scriptfile
    elif mode==2:
        script_path = os.path.join(str(DIRPATH),"jscripts",effect+".js")

    # See basic_modes._run for why these are argument lists with return-code
    # checking rather than shell strings: a user-chosen path went straight into
    # a shell command line, and failures were swallowed.
    _run([ffgac, "-i", str(input_video), "-an", "-mpv_flags", "+nopimb+forcemv",
          "-qscale:v", "0", "-b:v", "20M", "-minrate", "20M", "-maxrate", "20M",
          "-bufsize", "2M", "-g", str(gop),
          "-vcodec", "mpeg2video", "-f", "rawvideo", "-y", "tmp.mpg"])
    _run([ffedit, "-i", "tmp.mpg", "-f", "mv", "-s", str(script_path), "-o", str(output_video)])
    os.remove('tmp.mpg')
