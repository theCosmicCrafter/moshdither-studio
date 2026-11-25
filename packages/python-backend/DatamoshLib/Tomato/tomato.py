#Original Author: Kasper Ravel
#Modified by: Akash Bora
import os, re, random, struct, tempfile, shutil
from itertools import chain
from itertools import repeat
def mosh(infile, outfile, m, c, n, a, f, k):

        print ("Tomato Automosh v2.0")
        print ("Audio Video Interleave breaker")
        print (" ")
        print ("glitch tool made with love for the glitch art community <3")
        print ("___________________________________")

        filein = infile
        mode = m
        countframes = c
        positframes = n
        audio = a
        firstframe = f
        kill = k

        if filein is None or os.path.exists(filein) == False:
                raise FileNotFoundError(f"input video not found: {filein!r}")
                
        #define temp directory and files (system temp, cleaned in finally)
        temp_dir = tempfile.mkdtemp(prefix="moshdither_tomato_")
        temp_hdrl = os.path.join(temp_dir,"hdrl.bin")
        temp_movi = os.path.join(temp_dir,"movi.bin")
        temp_idx1 = os.path.join(temp_dir,"idx1.bin")

        try:

                #Define constrain function for jiggle :3
                def constrain(val, min_val, max_val):
                    return min(max_val, max(min_val, val))

                ######################################
                ### STREAM FILE INTO WORK DIR BINS ###
                ######################################

                print("> step 1/5 : streaming into binary files")

                def bstream_until_marker(bfilein, bfileout, marker=0, startpos=0):
                        chunk = 1024
                        filesize = os.path.getsize(bfilein)
                        if marker :
                                marker = str.encode(marker)
                        # A 4-byte marker can begin in the last bytes of one
                        # chunk and end in the next; scanning each buffer
                        # alone misses that split (and find() > 0 missed a
                        # marker at offset 0). Hold back the tail of every
                        # chunk so the scan always sees marker-length context.
                        overlap = len(marker) - 1 if marker else 0

                        with open(bfilein,'rb') as rd:
                                with open(bfileout,'ab') as wr:
                                        pending = b''
                                        for pos in range(startpos, filesize, chunk):
                                                rd.seek(pos)
                                                buffer = rd.read(chunk)

                                                if marker:
                                                        scan = pending + buffer
                                                        hit = scan.find(marker)
                                                        if hit >= 0 :
                                                                wr.write(scan[:hit])
                                                                return pos - len(pending) + hit # absolute position of the marker's first byte
                                                        # No marker: flush everything except the tail where
                                                        # one could still start.
                                                        wr.write(scan[:len(scan) - overlap])
                                                        pending = scan[len(scan) - overlap:]
                                                else:
                                                        wr.write(buffer)
                                        if pending:
                                                wr.write(pending)
                                        return None

                #make 3 files, 1 for each chunk
                movi_marker_pos = bstream_until_marker(filein, temp_hdrl, "movi")
                if movi_marker_pos is None:
                        raise ValueError("Invalid AVI container: 'movi' marker not found")
                idx1_marker_pos = bstream_until_marker(filein, temp_movi, "idx1", movi_marker_pos)
                if idx1_marker_pos is None:
                        raise ValueError("Invalid AVI container: 'idx1' marker not found")
                bstream_until_marker(filein, temp_idx1, 0, idx1_marker_pos)

                ####################################
                ### FUN STUFF WITH VIDEO CONTENT ###
                ####################################

                print("> step 2/5 : constructing frame index")

                with open(temp_movi,'rb') as rd:
                        chunk = 1024
                        filesize = os.path.getsize(temp_movi)
                        frame_table = []

                        for pos in range(0, filesize, chunk):
                                rd.seek(pos)
                                buffer = rd.read(chunk)

                        #build first list with all adresses 
                                for m in (re.finditer(b'\x30\x31\x77\x62', buffer)): # find iframes
                                                if audio : frame_table.append([m.start() + pos, 'sound'])		
                                for m in (re.finditer(b'\x30\x30\x64\x63', buffer)): # find b frames
                                        frame_table.append([m.start() + pos, 'video'])

                                #then remember to sort the list
                                frame_table.sort(key=lambda tup: tup[0])

                        l = []
                        l.append([0,0, 'void'])
                        max_frame_size = 0

                    #build tuples for each frame index with frame sizes
                        for n in range(len(frame_table)):
                                if n + 1 < len(frame_table):
                                        frame_size = frame_table[n + 1][0] - frame_table[n][0]
                                else:
                                        frame_size = filesize - frame_table[n][0]
                                max_frame_size = max(max_frame_size, frame_size)
                                l.append([frame_table[n][0],frame_size, frame_table[n][1]])


                ########################
                ### TIME FOR SOME FX ###
                ########################

                # variables that make shit work
                clean = []
                final = []

                # keep first video frame or not
                if firstframe:
                        if mode == "bloom":
                                if positframes==1:
                                        positframes=2
                                for x in l[0:positframes]:
                                        if x[2] == 'video':
                                                clean.append(x)
                                # clean the list by killing "big" frames
                                for x in l[positframes:]:
                                        if x[1] <= (max_frame_size * kill) :
                                                clean.append(x)
                        else:
                                for x in l[0:10]:
                                        if x[2] == 'video':
                                                clean.append(x)
                                # clean the list by killing "big" frames
                                for x in l[10:]:
                                        if x[1] <= (max_frame_size * kill) :
                                                clean.append(x)
                else:
                        for x in l:
                                if x[2] == 'video':
                                        clean.append(x)
                                        break
                        # clean the list by killing "big" frames
                        for x in l:
                                if x[1] <= (max_frame_size * kill) :
                                        clean.append(x)
                # An empty clean list makes bloom/jiggle crash with IndexError
                # and every other mode silently emit an empty file.
                if not clean:
                        raise ValueError("No frames survived the clean pass -- input may be too short or the kill threshold too strict")
                # FX modes
                if mode == "void":
                        print('> step 3/5 : mode void')
                        final = clean

                if mode == "random":
                        print('> step 3/5 : mode random')
                        final = random.sample(clean,len(clean))

                if mode == "reverse":
                        print('> step 3/5 : mode reverse')
                        final = sum(zip(clean[::-1], clean[:-1]), ())

                if mode == "invert":
                        print('> step 3/5 : mode invert')
                        final = sum(zip(clean[1::2], clean[::2]), ())

                if mode == 'bloom':
                        print('> step 3/5 : mode bloom')
                        repeat = int(countframes)
                        frame = int(positframes)
                        ## split list
                        lista = clean[:frame]
                        listb = clean[frame:]
                        ## rejoin list with bloom
                        final = lista + ([clean[frame]]*repeat) + listb

                if mode == 'pulse':
                        print('> step 3/5 : mode pulse')
                        pulselen = max(1, int(countframes))
                        pulseryt = max(1, int(positframes))
                        for j, x in enumerate(clean):
                                if j % pulseryt == 0:
                                        final.extend([x] * pulselen)
                                else:
                                        final.append(x)

                if mode == "jiggle":
                        print('> step 3/5 : mode jiggle')
                        #print('*needs debugging lol help thx*') # didn't pandy's branch fix this?
                        amount = int(positframes)
                        final = [clean[constrain(x+int(random.gauss(0,amount)),0,len(clean)-1)] for x in range(0,len(clean))]

                if mode == "overlap":
                        print('> step 3/5 : mode overlap')
                        # pulselen/pulseryt <= 0 make range() raise ValueError.
                        pulselen = max(1, int(countframes))
                        pulseryt = max(1, int(positframes))

                        clean = [clean[i:i+pulselen] for i in range(0,len(clean),pulseryt)]
                        final = [item for sublist in clean for item in sublist]

                if mode == 'exponential':#Ask Kasper to add these modes (Note by Akash)
                        print('> step 3/5 : mode exponential')
                        print('sorry, currently not implemented. using void..')	

                if mode == 'swap':
                        print('> step 3/5 : mode swap')
                        print('sorry, currently not implemented. using void..')		


                ####################################
                ### PUT VIDEO FILE BACK TOGETHER ###
                ####################################

                print("> step 4/5 : putting things back together")

                #name new file
                fileout = outfile

                #delete old file
                if os.path.exists(fileout):
                        os.remove(fileout)

                bstream_until_marker(temp_hdrl, fileout)

                with open(temp_movi,'rb') as rd:
                        filesize = os.path.getsize(temp_movi)
                        with open(fileout,'ab') as wr:
                                wr.write(struct.pack('<4s', b'movi'))
                                for x in final:
                                        if x[0] != 0 and x[1] != 0:
                                                rd.seek(x[0])
                                                wr.write(rd.read(x[1]))

                bstream_until_marker(temp_idx1, fileout)

        finally:
                # Success or failure, the scratch dir goes away -- it used to
                # be created in the CWD and leaked on any mid-run error.
                shutil.rmtree(temp_dir, ignore_errors=True)

        print("> step 5/5 : done - final idx size : " + str(len(final)))
