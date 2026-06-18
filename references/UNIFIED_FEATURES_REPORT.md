# Unified Feature Report: Datamoshing, Glitch & Dithering Reference Library

**Generated:** 2026-06-14
**Sources reviewed:** 37 repositories
**Output format:** One categorized list of unique capabilities across all tools

---

## 1. DATAMOSHING & VIDEO GLITCH TECHNIQUES

### I-Frame Manipulation

- **Automatic I-frame removal** (Void mode) - motion-vector-based datamosh cuts
- **Classic AviDemux-style datamosh** within a time range
- **Precise frame-number I-frame removal** (Classic2)
- **Manual I-frame range removal** (Rise / ffglitch style)
- **Progressive frame deletion** along with incoming clip I-frames (python-moshion)
- **Random I-frame dropping** with probabilistic per-frame control (datamoshlive)

### Frame Reordering & Repetition

- **Frame shuffling** - randomly shuffle chunks then mosh (Shuffle)
- **Frame sorting by data size** then merge with classic datamosh (Sort)
- **Keyframe bloom** - duplicate a keyframe multiple times with void mode (Bloom)
- **Water bloom** - duplicate any frame multiple times with ffglitch precision
- **Series repeat** - repeat a series of frames multiple times (Repeat)
- **Macroblock glide** - duplicate macroblocks continuously (Glide)
- **P-frame pulse** - duplicate groups of P-frames every N frames (Pulse)
- **Frame inversion/switching** - swap consecutive frames (Invert)
- **Frame reversal** - reverse frame order (Reverse)
- **Overlap** - copy frame groups from every Nth position
- **Jiggle** - take frames from around current position
- **Random frame order** (Random)

### Motion & Macroblock Effects

- **Motion transfer** - transfer vector motion data from one video to another
- **Fluid / average motion** - smooth liquid-type effect from macroblock averaging
- **Stretch** - stretch macroblocks horizontally and vertically
- **Shear** - tilt and mosh video clockwise
- **Shift** - shift random blocks against gravity
- **Sink** - drown next frame with previous one
- **Slam zoom** - zoom with sink effect
- **Slice** - randomly slice video into multiple parts
- **Stop** - sink variant with random XY stop values
- **Vibrate** - randomize pixels continuously
- **Zoom** - simple zoom inside moshed video
- **Echo** - duplicate video and apply mosh at midpoint
- **Buffer** - create glitchy ring buffers in video
- **Delay** - random delaying mosh effect
- **Mirror** - mosh with vertically mirrored part

### Video-to-Video Datamosh

- **Combine** - combine multiple videos and mosh them together
- **Cross-video datamosh** - bash script concatenating broken binary data from two videos
- **Segmented random mosh** - split video into segments, apply random settings to each

### Real-Time / Interactive Datamoshing

- **Browser-based live datamosh** via WebCodecs API (datamoshlive)
- **VP8/VP9/H.264/AV1 codec support** for live encoding
- **Frame drop** - drop encoded frames to create delta smear
- **Frame corrupt** - zero out random regions of encoded bitstream
- **Frame sync** - force clean keyframe recovery
- **Sample/Inject** - capture N frames into buffer and replay them
- **Probabilistic dropping** - per-frame drop probability (0-1)
- **Probabilistic corruption** - per-frame corruption probability with amount control
- **Hold/freeze** - freeze canvas and smear on release
- **Live parameter functions** - parameters as functions called every frame
- **Auto-recovery** - configurable frames until clean keyframe restoration

### Profile-Based Datamosh

- **Glitch profile** - subtle static-like distortion
- **Bloom profile** - color bleeding effects
- **Smear profile** - trailing/motion smear
- **Extreme profile** - heavy destruction
- **Rainbow profile** - saturated colorful chaos

---

## 2. DITHERING ALGORITHMS

### Ordered Dithering

- **Bayer matrix** - 2x2, 4x4, 8x8, 16x16 (configurable up to any power-of-2)
- **Clustered-dot** - multiple preprogrammed matrices
- **Horizontal/vertical line matrices**
- **Custom ordered matrices** via JSON import
- **Polka dot** - retro circular threshold patterns
- **Halftone** - newspaper-style printing with rotating screens

### Error Diffusion Dithering

- **Floyd-Steinberg** (standard and serpentine)
- **False Floyd-Steinberg**
- **Jarvis-Judice-Ninke**
- **Atkinson**
- **Stucki**
- **Burkes**
- **Sierra / Sierra3, Sierra2, Sierra2-4A (Sierra-Lite)**
- **Steven Pigeon**
- **Ostromoukhov** - adaptive error diffusion with variable coefficients
- **Riemersma** - Hilbert curve-based space-filling error diffusion
- **Simple 2D error diffusion**
- **Custom error diffusion matrices** via JSON import

### Noise-Based Dithering

- **Random noise** (grayscale and RGB)
- **Blue noise** - high-quality spatial distribution with configurable seed
- **IGN (Interleaved Gradient Noise)** - deterministic hash noise with scale/seed

### Advanced Dithering

- **Wavelet dithering** - multi-scale frequency decomposition
- **Adaptive variance** - context-aware based on local variance
- **Perceptual** - luminance-preserving error diffusion
- **Hybrid** - separates luminance/color channels for detail preservation
- **DBS (Direct Binary Search)** - high-quality but computationally expensive
- **Threshold dithering** - simple cutoff
- **Scaled/halftone style**

---

## 3. PIXEL MANIPULATION & SORTING

### Pixel Sorting

- **Pixelsort** - smear and reorder pixels along lines/bands, turning motion/edges into streaky gradients
- **Pixel sorting by threshold** - sort pixels above/below brightness threshold
- **Iterative interference sorting** (Interference node)

### Pixelation & Block Effects

- **Regular pixelization** - nearest-neighbor downsampling
- **Neural pixelization** - AI-powered artistic pixelization (PyTorch models)
- **Pixel redistribution** - redistribute pixels by pattern and color
- **Block shift** - shift pixel blocks with random offsets
- **Pixelate effect** - configurable intensity

### Optical Flow & Motion

- **Optical flow transfer** - extract dense velocity field from video and apply to image/video
- **PixelFloat** - gravity-affected motion via optical flow (block-based with motion estimation)
- **Block-matched motion estimation** - 32x32 blocks, +/-6px search, sub-sampled SAD
- **Motion field warping** - warp carrier buffer by motion field

---

## 4. COLOR CHANNEL & CHROMATIC EFFECTS

### Channel Manipulation

- **Chroma glitch** - split and offset color channels for RGB drift, halos, jittery separation
- **RGB channel shifting** - independent R/G/B horizontal shifts
- **Chromatic aberration** - configurable intensity
- **Hue shift** - full 0-360 degree rotation
- **Color bleed** - VHS-style RGB misalignment
- **Color drift** - analog TV-style color distortion
- **Vaporwave color bands** - aesthetic color banding

### Color Space Processing

- **RGB, HSV, LAB, YUV** color space corruption (Corruptor node)
- **YIQ color space** - analog TV signal distortion simulation
- **Linear color space calculations** for accuracy
- **LAB 2000 color matching** with weight controls

### Palette & Quantization

- **Fixed historical palettes** - PICO-8, GameBoy, NES, C64, Atari 2600, MSX, ZX Spectrum, Apple II, EGA-16, VGA-256, Amiga Workbench, CGA
- **Adaptive K-Means quantization** - content-aware 2-256 colors
- **Median Cut** - classic color quantization
- **Uniform quantization** - evenly distributed color space
- **Custom palette import** - hex codes, lospec.com, Paint.NET format
- **Palette extraction from image** - K-means on reference image
- **Recolor after dithering** - apply different palette post-dither
- **Posterize** - bit depth reduction (1-8 bits)

---

## 5. COMPRESSION ARTIFACTS & BYTE-LEVEL CORRUPTION

### JPEG Manipulation

- **JPEG quantization table manipulation** - real-time 8x8 matrix editing (luminance + chrominance)
- **JPEG scan data corruption** - manipulate bytes between SOS and EOI markers
- **JPEG quality degradation** - controlled quality reduction
- **JPEG artifact generation** - synthetic DCT coefficient distortion
- **JPEG byte-flipping** - format-aware entropy-coded pair corruption

### PNG Manipulation

- **Dynamic PNG codec glitch** - manipulate internal PNG decoder parameters live
- **PNG IDAT corruption** with CRC32 recompute

### General Databending

- **Byte change** - randomize chunk values
- **Byte reverse** - reverse order of bytes in chunk
- **Byte repeat** - repeat first X bytes throughout chunk
- **Byte remove** - delete chunk entirely
- **Byte zero** - null out chunk
- **Byte insert** - insert random data at random point
- **Byte replace** - replace chunk with random data
- **Byte move** - relocate chunk to new position
- **WebP/GIF/MP4/WebM container-skip corruption**

---

## 6. ANALOG / VHS / CRT EFFECTS

### VHS / Tape Effects

- **VHS emulation** - tape artifacts, scanlines, noise, wobble, soft tracking drift
- **VHS on Acid** - VHS with psychedelic color distortion, random slice displacement
- **Scan lines** - configurable opacity, thickness, count
- **Scan drift** - horizontal drift of scanlines
- **Scan curve** - curved scanline distortion
- **Tracking errors** - analog tape tracking drift

### CRT / Monitor Simulation

- **CRT dot patterns** - monitor simulation
- **Video modulation** - CRT monitor with dot patterns
- **Chromatic separation** - CRT-style color separation
- **Interference lines** - VHS/lost footage horizontal shifts

### TV Signal Effects

- **Analog TV glitch** (TvGlitch) - subcarrier amplitude, video noise, IIR lowpass per row
- **TV signal distortion** - YIQ color space manipulation
- **Signal noise** - analog broadcast noise simulation
- **Ghosting** - multi-path signal echo

---

## 7. SLICE, WAVE & GEOMETRIC DISTORTIONS

### Slice Manipulation

- **Horizontal/vertical/both slice shifting** - random slice displacement
- **Slice size variability** - configurable min/max slice sizes
- **Mirror slices** - mirror individual slices
- **Repeat slices** - repeat slice content

### Wave Distortions

- **Sine wave distortion** - horizontal or vertical with amplitude/frequency/phase
- **Wave amplitude/frequency/speed** controls
- **Scan curve** - curved wave distortion

### Geometric Effects

- **Kaleidoscope** - mirror-tile segments
- **Anaglyph** - 3D red/cyan separation with configurable channel offsets
- **Borders** - add colored/opaque borders
- **Rectangle overlays** - random clipped rectangles with invert chance

---

## 8. NOISE, DEGRADATION & ARTIFACTS

### Noise Generation

- **Random noise** - configurable intensity
- **Fractal noise** - octaves, persistence, scale, intensity controls
- **Salt & pepper noise**
- **Gaussian noise**
- **Uniform noise**
- **Heatmap** - pseudo-heatmap effect with control points

### Degradation

- **JPEG degrade** - synthetic JPEG artifact injection
- **Compression artifacts** - controlled compression simulation
- **Solarize** - threshold-based color inversion
- **Grayscale** - configurable intensity
- **Brightness/contrast/gamma/saturation** pre-processing

---

## 9. AUDIO-REACTIVE & BEAT-SYNC FEATURES

- **Onset detection** - detect audio transients
- **Tempo extraction** - BPM detection
- **Beat tracking** - state-of-the-art beat tracking algorithms
- **Real-time VJ visuals** - Pygame or WebSocket output to OBS
- **Beat-synced video editing** - automatic cut/seek/slow based on audio beats
- **Audacity frame-by-frame datamoshing** - apply audio effects (Echo, Filter Curve, Reverb) to video frames with time-variable parameters

---

## 10. REAL-TIME / INTERACTIVE / BROWSER CAPABILITIES

### Browser-Based Tools

- **Supermosh** - first browser-based datamosh editor
- **DatamoshLive** - real-time WebCodecs datamosh in browser
- **Eternal Mess** - endless algorithmic datamosh visuals
- **JPEGGED** - real-time JPEG quantization table editor
- **jpg-glitch** - browser JPG corruption experiment
- **glitch-studio** - dynamic PNG codec glitch in browser
- **glitch-image** - generative glitch image web tool
- **ImageRot** - cross-browser/Node image manipulation library
- **shpigford-dither** - web app vector dithering

### Desktop Applications

- **BitRot** - Tauri-based desktop video glitch tool (Rust + Vite)
- **Datamosher Pro** - Python GUI with 30+ effects (Windows/Mac + mobile)
- **Ditherista** - Qt6 GUI dithering app (Windows/Linux/macOS)
- **Dither Pie** - Python GUI+CLI dithering tool
- **Datamosh-Den** - AutoHotkey Windows datamosh GUI
- **Crasher** - Python glitch art desktop app
- **WRONG** - Electron-based corrupted web browser
- **GuD-V1B3** - AutoHotkey image vibration GIF tool

### Pipeline / CLI Tools

- **didder** - extensive CLI dithering (Go)
- **fftools** - FFmpeg-based video manipulation suite
- **transflow** - optical flow transfer CLI + GUI
- **datamosh-qbixxx** - bash video datamosh
- **glitch-tool** - Python databending CLI
- **python-moshion** - ffmpeg datamosh CLI
- **pymosh** - Python AVI/MPEG4 manipulation library

---

## 11. ADVANCED / UNIQUE TECHNIQUES

### Wavelet Corruption

- **Wavelet transformation corruption** - controlled corruption via wavelet transforms with scaling factors, noise injection, coefficient quantization modes (regular/absolute/threshold)

### Luminous Effects

- **LuminousFlow** - transform images into flowing luminous strands following image features with line spacing, thickness, flow intensity, glow, darkness, vibrancy

### Pixel Redistribution

- **Pattern-based pixel redistribution** - redistribute pixels by spatial pattern and color similarity

### VideoModulation

- **CRT monitor simulation** with dot pattern masking and phosphor glow

### Frequency Modulation

- **FM modulation on images/video** - apply frequency modulation to visual data

### Seam Carving

- **Content-aware video resizing** via seam carving

### Zalgo / Text Corruption

- **Zalgo text injection** - combining diacritics into every visible character across shadow DOMs
- **Live MutationObserver** for dynamic content

### Hex Editing

- **Hex edit compressed AVI** - before or after datamosh
- **Force frame rate via hex edits**

---

## 12. WORKFLOW & UTILITY FEATURES

### Batch Processing

- **Batch folder processing** with progress tracking
- **Multi-core/CPU parallelization**
- **Glob pattern support** for input files
- **Video trimming** via filename suffix (#start-end)

### Caching & Preview

- **Smart caching** - re-dither without re-pixelizing
- **Live palette preview** - instant preview during palette selection
- **Toggle original/preview** comparison
- **Random frame preview** for video settings testing

### Import / Export

- **Drag & drop** file loading
- **Copy & paste** image import/export
- **SVG vector export** - grouped by color
- **PNG/GIF/JPG/BMP/TIFF** support
- **Animated GIF** creation from multiple images
- **Lospec.com palette import**
- **Custom palette JSON**

### Platform & Integration

- **Cross-platform** (Windows/Linux/macOS/browser)
- **Web Worker support** for browser performance
- **Zero dependencies** browser builds
- **ComfyUI nodes** - 17 nodes for AI art pipeline integration
- **OBS Studio / WebSocket** output
- **Adobe Illustrator plugin**
- **Mobile apps** (iOS/Android)

---

## 13. PROGRAMMING INTERFACES

### APIs & Extensibility

- **Custom mode API** - add user-defined mosh functions
- **Live function parameters** - pass functions instead of static values for real-time variation
- **Buffer-based processing** - chainable effects on raw buffers
- **Configurable builds** - include only desired effects
- **FFmpeg script integration** - custom ffglitch scripts
- **MCP / external tool integration** (WRONG browser protocol interception)

---

*End of unified feature report. All capabilities listed above were extracted from the 37 reference repositories in the moshdither-studio references directory.*
