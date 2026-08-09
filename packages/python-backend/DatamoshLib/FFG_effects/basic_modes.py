#Author: Akash Bora
import os, shutil, subprocess, random, json, tempfile
from contextlib import contextmanager
from pathlib import Path
import numpy as np


@contextmanager
def _scratch_dir():
    """Run a mosh in a private temp directory, then clean it up.

    These effects write fixed filenames -- tmp.mpg, tmp.json, apply_vectors.js
    and a cache_ffg/ tree -- into the *current working directory*, which is
    whatever directory the app happened to spawn the process from. Two problems:

    * Two exports running at once overwrite each other's intermediates and
      produce corrupt or silently wrong output.
    * The files land in the user's working directory, and any crash between
      creation and os.remove() leaves them behind.

    Giving each run its own directory fixes both, and means a failure cleans up
    after itself. Paths passed in by the caller are made absolute first, since
    they were resolved relative to the original directory.
    """
    previous = os.getcwd()
    scratch = tempfile.mkdtemp(prefix="moshdither_ffg_")
    try:
        os.chdir(scratch)
        yield scratch
    finally:
        os.chdir(previous)
        shutil.rmtree(scratch, ignore_errors=True)

DIRPATH = Path(os.path.dirname(os.path.realpath(__file__)))
ffgac = os.path.join(str(DIRPATH.parent.parent),"FFglitch","ffgac")
ffedit = os.path.join(str(DIRPATH.parent.parent),"FFglitch","ffedit")


def _run(args):
    """Run an external tool from an argument list, and fail loudly if it fails.

    Replaces `subprocess.call(f'...', shell=True)`, which was wrong twice over:

    1. **Injection.** The command was built by interpolating caller-supplied
       paths into a single string handed to the shell. A video whose *filename*
       contains a quote followed by shell metacharacters would close the quoted
       argument and run whatever followed, with this process's privileges. This
       is reachable: mosh_cli.py is spawned by the app for user-chosen files.
       Passing a list with shell=False means the OS receives argv directly and
       no shell ever parses it, so a path is always just a path.

    2. **Silent failure.** subprocess.call returns the exit code and never
       raises, and no call site checked it. When ffgac or ffedit failed the
       pipeline carried on and died later at an unrelated "file not found",
       pointing at the wrong step. Checking here means the failure is reported
       where it happens, with the command and the tool's own stderr.
    """
    # timeout: this whole script is given an overall bound and cancellation by
    # the Rust host (apply_ffglitch/run_ffglitch_subprocess in
    # src-tauri/src/commands.rs), which kills the Python process if it hangs
    # -- but killing that parent does not, on Windows, kill an already-spawned
    # ffgac/ffedit child on its own. A per-call timeout here lets
    # subprocess.run's own kill logic clean up that specific child
    # immediately instead of leaving it orphaned.
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=1200)
    except subprocess.TimeoutExpired as e:
        tool = os.path.basename(str(args[0]))
        raise RuntimeError(f"{tool} timed out after {e.timeout}s: {' '.join(str(a) for a in args)}") from e
    if result.returncode != 0:
        tool = os.path.basename(str(args[0]))
        raise RuntimeError(
            f"{tool} failed (exit {result.returncode}): {' '.join(str(a) for a in args)}\n"
            f"{(result.stderr or '')[-1500:]}"
        )
    return result

def library(input_video, output, mode, extract_from="", fluidity=0, size=0, s=0, e=0, vh=0, gop=1000, r=0, f=0):
        
        def get_vectors(input_video):
            _run([ffgac, "-i", str(input_video), "-an", "-mpv_flags", "+nopimb+forcemv",
                  "-qscale:v", "0", "-g", str(gop),
                  "-vcodec", "mpeg2video", "-f", "rawvideo", "-y", "tmp.mpg"])
            _run([ffedit, "-i", "tmp.mpg", "-f", "mv:0", "-e", "tmp.json"])
            os.remove('tmp.mpg')
            f = open('tmp.json', 'r')
            raw_data = json.load(f)
            f.close()
            os.remove('tmp.json')
            frames = raw_data['streams'][0]['frames']
            vectors = []
            for frame in frames:
                try:
                    vectors.append(frame['mv']['forward'])
                except:
                    vectors.append([])
            return vectors

        def apply_vectors(vectors, input_video, output_video, method='add'):
            _run([ffgac, "-i", str(input_video), "-an", "-mpv_flags", "+nopimb+forcemv",
                  "-qscale:v", "0", "-g", str(gop),
                  "-vcodec", "mpeg2video", "-f", "rawvideo", "-y", "tmp.mpg"])
            to_add = '+' if method == 'add' else ''
            script_path = 'apply_vectors.js'
            # `export` is required from FFglitch 0.10 on. Without it ffedit
            # aborts with "Could not find function glitch_frame()", which the
            # old subprocess.call swallowed -- so fluid/stretch/motion_transfer
            # silently produced nothing. The bundled binary is 0.10.2.
            script_contents = '''
            var vectors = [];
            var n_frames = 0;
            export function glitch_frame(frame) {
                let fwd_mvs = frame["mv"]["forward"];
                if (!fwd_mvs || !vectors[n_frames]) {
                    n_frames++;
                    return;
                }
                for ( let i = 0; i < fwd_mvs.length; i++ ) {
                    let row = fwd_mvs[i];
                    for ( let j = 0; j < row.length; j++ ) {
                        let mv = row[j];
                        try {
                            mv[0] ''' + to_add + '''= vectors[n_frames][i][j][0];
                            mv[1] ''' + to_add + '''= vectors[n_frames][i][j][1];
                        } catch {}
                    }
                }
                n_frames++;
            }
            '''
            with open(script_path, 'w') as f:
                f.write(script_contents.replace('var vectors = [];', f'var vectors = {json.dumps(vectors)};'))
            _run([ffedit, "-i", "tmp.mpg", "-f", "mv", "-s", str(script_path), "-o", str(output_video)])
            os.remove('apply_vectors.js')
            os.remove('tmp.mpg')
            
        def shuffle(output):
            if os.path.isdir("cache_ffg"):
                shutil.rmtree("cache_ffg")
            os.mkdir("cache_ffg")
            base = os.path.basename(input_video)
            fin = os.path.join("cache_ffg",base[:-4]+".mpg")
            _run([ffgac, "-i", str(input_video), "-an", "-vcodec", "mpeg2video", "-f", "rawvideo",
                  "-mpv_flags", "+nopimb", "-qscale:v", "6", "-r", "30", "-g", str(gop), "-y", str(fin)])
            os.mkdir(os.path.join("cache_ffg","raws"))
            framelist = []
            _run([ffgac, "-i", str(fin), "-vcodec", "copy", "cache_ffg/raws/frames_%04d.raw"])
            frames = os.listdir(os.path.join("cache_ffg","raws"))
            siz = size
            framelist.extend(frames)
            chunked_list = []
            chunk_size = siz
            for i in range(0, len(framelist), chunk_size):
                    chunked_list.append(framelist[i:i+chunk_size])
            random.shuffle(chunked_list)
            framelist.clear()
            for k in frames[0:siz]:
                 framelist.append(k)
            for i in chunked_list:
                    for j in i:
                            if not j in framelist:
                                framelist.append(j)
            out_data = b''
            for fn in framelist:
               with open(os.path.join("cache_ffg","raws",fn), 'rb') as fp:
                   out_data += fp.read()
            with open(output, 'wb+') as fp:
                  fp.write(out_data)
                  fp.close()
            shutil.rmtree("cache_ffg")
            
        def rise(output):
            if os.path.isdir("cache_ffg"):
                shutil.rmtree("cache_ffg")
            os.mkdir("cache_ffg")
            base = os.path.basename(input_video)
            fin = os.path.join("cache_ffg",base[:-4]+".mpg")
            qua = ''
            _run([ffgac, "-i", str(input_video), "-an", "-vcodec", "mpeg2video", "-f", "rawvideo",
                  "-mpv_flags", "+nopimb", "-qscale:v", "6", "-r", "30", "-g", str(gop), "-y", str(fin)])
            os.mkdir(os.path.join("cache_ffg","raws"))
            framelist = []
            _run([ffgac, "-i", str(fin), "-vcodec", "copy", "cache_ffg/raws/frames_%04d.raw"])
            kil = e
            po = s
            if po==0:
                    po = 1
            frames=os.listdir(os.path.join("cache_ffg","raws"))  
            for i in frames[po:(po+kil)]:
                os.remove(os.path.join("cache_ffg","raws",i))
            frames.clear()
            frames = os.listdir(os.path.join("cache_ffg","raws"))
            framelist.extend(frames)
            out_data = b''
            for fn in framelist:
               with open(os.path.join("cache_ffg","raws",fn), 'rb') as fp:
                   out_data += fp.read()
            with open(output, 'wb') as fp:
                  fp.write(out_data)
                  fp.close()
            shutil.rmtree("cache_ffg")

        def combine(output):
            if os.path.isdir("cache_ffg"):
                shutil.rmtree("cache_ffg")
            os.mkdir("cache_ffg")
            qua=''
            num = 0
            frames = []
            converted = {}
            for i in input_video:
                if i in list(converted.keys()):
                    continue
                base=os.path.basename(i)
                num +=1
                fin=os.path.join("cache_ffg",base[:-4]+f"_{num}.mpg")
                os.mkdir(os.path.join("cache_ffg",f"raws_{num}"))
                
                _run([ffgac, "-i", str(i), "-an", "-vcodec", "mpeg2video", "-f", "rawvideo",
                      "-mpv_flags", "+nopimb", "-qscale:v", "6", "-r", "30",
                      "-s", "1920x1080", "-g", str(gop), "-y", str(fin)])
               
                _run([ffgac, "-i", str(fin), "-vcodec", "copy", f"cache_ffg/raws_{num}/frames_%04d.raw"])
                converted.update({i:os.path.join("cache_ffg",f"raws_{num}")})
        
            num = 0
            for i in input_video:
                num +=1    
                raw_frames = os.listdir(converted[i])
                if num == 1:
                    n = 0
                else:
                    if len(raw_frames)>10:
                        n=5
                    else:
                        n=1
                for frame in raw_frames[n:]:
                    frames.append(os.path.join(converted[i],frame))
            
            out_data = b''
            for fn in frames:
               with open(os.path.join(fn), 'rb') as fp:
                   out_data += fp.read()
            with open(output, 'wb') as fp:
                  fp.write(out_data)
                  fp.close()
            try:
                if os.path.isdir("cache_ffg"):
                    shutil.rmtree("cache_ffg")
            except: pass

        def water_bloom(output):
            if os.path.isdir("cache_ffg"):
                shutil.rmtree("cache_ffg")
            os.mkdir("cache_ffg")
            base = os.path.basename(input_video)
            fin = os.path.join("cache_ffg",base[:-4]+".mpg")
            qua = ''
            _run([ffgac, "-i", str(input_video), "-an", "-vcodec", "mpeg2video", "-f", "rawvideo",
                  "-mpv_flags", "+nopimb", "-qscale:v", "6", "-r", "30", "-g", str(gop), "-y", str(fin)])
            os.mkdir(os.path.join("cache_ffg","raws"))
            framelist = []
            _run([ffgac, "-i", str(fin), "-vcodec", "copy", "cache_ffg/raws/frames_%04d.raw"])
            repeat = r
            po = f-1
            frames=os.listdir(os.path.join("cache_ffg","raws"))
            for i in frames[:po]:
                    framelist.append(i)
            for i in range(repeat):
                    framelist.append(frames[po])
            for i in frames[po:]:
                    framelist.append(i)
            out_data = b''
            for fn in framelist:
               with open(os.path.join("cache_ffg","raws",fn), 'rb') as fp:
                   out_data += fp.read()
            with open(output, 'wb') as fp:
                  fp.write(out_data)
                  fp.close()
            shutil.rmtree("cache_ffg")
            
        def average(frames):
            if not frames:
                return []
            return np.mean(np.array([x for x in frames if x != []]), axis=0).tolist()

        def fluid(frames):
            average_length = fluidity
            if average_length==1:
                average_length=2
            return [average(frames[i + 1 - average_length: i + 1]) for i in range(len(frames))]

        def movement(frames):
            for frame in frames:
                if not frame:
                    continue
                for row in frame:
                    for col in row:
                        col[vh] = 0
            return frames

        # Caller paths are resolved before chdir, since the scratch directory
        # changes what a relative path means.
        output = os.path.abspath(output) if isinstance(output, str) else output
        if isinstance(input_video, str):
            input_video = os.path.abspath(input_video)
        elif isinstance(input_video, (list, tuple)):
            input_video = [os.path.abspath(v) for v in input_video]
        if extract_from:
            extract_from = os.path.abspath(extract_from)

        with _scratch_dir():
            if(mode==1):
                transfer_to = input_video
                vectors = []
                if extract_from:
                    vectors = get_vectors(extract_from)
                    if transfer_to == '':
                        with open(output, 'w') as f:
                            json.dump(vectors, f)
                apply_vectors(vectors, transfer_to, output)
            elif(mode==2):
                apply_vectors(movement(get_vectors(input_video)), input_video, output, method='')
            elif(mode==3):
                apply_vectors(fluid(get_vectors(input_video)), input_video, output, method='')
            elif(mode==4):
                shuffle(output)
            elif(mode==5):
                rise(output)
            elif(mode==6):
                water_bloom(output)
            elif(mode==7):
                combine(output)
