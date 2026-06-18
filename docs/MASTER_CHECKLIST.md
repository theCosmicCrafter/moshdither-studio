# MoshDither Studio — Master Feature Checklist

## Audio Reactive System

- [x] AudioEngine with Meyda integration
- [x] AudioParameterMapper with attack/decay/gate/invert
- [x] AudioFeatureExtractor for offline baking
- [x] AudioBakeData JSON schema
- [x] **Audio Reactive Shaders**
  - [x] audio_bass_pulse
  - [x] audio_spectrum bars overlay
  - [x] audio_waveform oscilloscope overlay
  - [x] audio_spectral_shift (hue shift by centroid)
  - [x] audio_glitch_beat (trigger glitch on beat)
  - [x] audio_reactive_dither (dither strength by bass)
  - [x] audio_reactive_pixelate (block size by energy)
  - [x] audio_reactive_chromatic (aberration by flux)
- [x] **Audio Reactive Panel UI**
  - [x] Audio file drop/upload component
  - [x] Microphone toggle button
  - [x] Play/pause/stop controls
  - [x] Volume slider
  - [x] Real-time spectrum visualization (7 bands)
  - [x] Beat indicator LEDs (bass/mid/treble)
  - [x] BPM display
- [x] **Parameter Binding UI**
  - [x] Bind/unbind toggle per parameter
  - [x] Dropdown per parameter: select audio source
  - [x] Input range min/max editors
  - [x] Output range min/max editors
  - [x] Gate enable + threshold
  - [x] Invert toggle
  - [x] Real-time value preview next to binding
- [x] **WebGL Audio Uniform Injection**
  - [x] Global audio uniforms injected into every render pass
  - [x] Continuous RAF render loop when audio enabled
- [ ] **Export Integration**
  - [ ] Pass AudioBakeData JSON to Rust export_video
  - [ ] Rust command accepts audio_bake_json parameter
  - [ ] Rust effects read frame-indexed audio values
  - [ ] Audio-reactive Rust effect implementations

## Timeline & Transport

- [x] **Timeline Component**
  - [x] Horizontal scrubber with time ruler
  - [x] Frame number display
  - [x] Current time / duration display
  - [x] Playhead with drag scrubbing
  - [ ] In/out point markers
  - [ ] Zoom in/out on timeline
  - [ ] Effect stack markers on timeline
- [x] **Transport Controls**
  - [x] Play / Pause / Stop buttons (UI present)
  - [x] Step forward / backward one frame
  - [x] Jump to start / end
  - [x] Loop toggle (UI present)
  - [x] Playback speed selector (0.25x, 0.5x, 1x, 2x)
- [x] **Keyframe System**
  - [x] Keyframe track per effect parameter
  - [x] Add/remove keyframes at playhead (diamond button in ParameterPanel)
  - [x] Linear / ease-in / ease-out / hold interpolation
  - [ ] Keyframe curve editor
  - [ ] Copy/paste keyframes

## Video Layout & Compositing

- [ ] **Multi-Layer Compositing**
  - [ ] Layer stack (like Photoshop layers)
  - [ ] Layer opacity, blend modes
  - [ ] Layer transform (position, scale, rotation)
  - [ ] Layer visibility toggle
  - [ ] Layer reordering (drag and drop)
- [x] **Blend Modes**
  - [x] Normal, Add, Multiply, Screen, Overlay
  - [x] Difference, Exclusion, Hard Light, Soft Light
  - [x] Color Dodge, Color Burn, Linear Dodge
- [x] **Transform Effects**
  - [x] Position (x, y)
  - [x] Scale (uniform + non-uniform)
  - [x] Rotation
  - [x] Anchor point
- [ ] **Output Sizing**
  - [ ] Resolution preset selector (1080p, 4K, 720p, custom)
  - [ ] Aspect ratio lock
  - [ ] Fit / Fill / Stretch modes
  - [ ] Crop tool

## Masking System (Expand Current)

- [x] SAM3 segmentation (text, point, box, auto)
- [x] Multi-mask output with score selection
- [x] Mask isolate effect
- [x] **Manual Mask Drawing**
  - [x] Brush tool with size
  - [x] Eraser tool
  - [x] Rectangle mask
  - [x] Ellipse mask
  - [ ] Polygon / Lasso freehand
  - [ ] Gradient mask
- [x] **Mask Management UI**
  - [ ] Mask list panel (name, thumbnail, visibility)
  - [ ] Mask rename / duplicate / delete
  - [x] Mask opacity slider
  - [x] Mask feather / blur
  - [x] Mask invert toggle
  - [ ] Mask expansion / contraction (grow/shrink)
- [x] **Mask Application**
  - [x] Per-effect mask assignment dropdown
  - [ ] Mask mode: inside / outside / alpha
  - [ ] Mask blend mode

## Datamoshing & Glitch (Expand)

- [x] 7 Rust datamoshing effects (classic, iframe, motion, combine, repeat, rise, shuffle, bloom)
- [x] 8 Rust glitch effects (slice_shift, databend, jpeg, byte_flip, byte_zero, byte_insert, byte_reverse)
- [x] **More Glitch Shaders**
  - [x] datamoshing-style temporal shader
  - [x] macroblock corruption shader
  - [x] motion vector displacement shader
  - [x] I-frame removal simulation shader
  - [x] h264 artifact shader
  - [x] sorting glitch shader
- [x] **Glitch Parameters**
  - [x] Random seed control
  - [ ] Temporal accumulation toggle
  - [x] Block size variation

## Dithering System (Expand)

- [x] 12 Rust dithering algorithms
- [x] 12 WebGL dithering shaders
- [x] **Dithering Enhancements**
  - [x] Color palette selector (2-8 colors)
  - [ ] Custom palette import/export
  - [x] Popular palette presets (Game Boy, CGA, PICO-8, etc.)
  - [x] Dithering pattern scale
  - [x] Dithering angle rotation
  - [ ] Error diffusion strength
  - [ ] Multi-pass dithering (ordered + error diffusion combo)

## LUT & Color Grading

- [x] LUT loader with PNG flat LUTs
- [x] 14+ LUT presets
- [x] LUT amount/intensity slider
- [x] **Color Grading Tools**
  - [x] Lift / Gamma / Gain wheels
  - [ ] Shadows / Midtones / Highlights
  - [x] Temperature / Tint
  - [x] Vibrance / Saturation
  - [x] Contrast / Brightness
  - [x] Curves editor (RGB + per-channel)

## Export & Output

- [x] Video export via Rust (decode -> process -> encode)
- [x] Image save to disk
- [x] Base64 preview output
- [x] **Export Settings UI**
  - [x] Format selector (MP4, WebM, GIF, PNG sequence)
  - [x] Quality presets (draft / good / best)
  - [x] Frame rate selector
  - [x] Audio include/exclude toggle
  - [x] Codec selector (H.264, H.265, ProRes, VP9)
  - [x] Resolution selector
  - [x] Export progress bar with cancel
- [x] **Batch Export**
  - [x] Queue multiple exports
  - [ ] Preset-based batch processing
  - [ ] Folder watch / auto-export

## Preview System

- [x] WebGL real-time preview via EffectChain
- [x] Before/After toggle
- [x] Zoom control
- [x] **Preview Enhancements**
  - [x] Full screen preview (F11)
  - [x] Split-screen before/after draggable divider
  - [x] Playback speed selector (0.25x-4x)
  - [ ] Pixel peep 1:1 view
  - [x] Histogram overlay
  - [x] Waveform / RGB Parade overlay
  - [ ] Safe area / grid overlay
  - [x] Frame counter overlay
  - [x] Audio waveform overlay on preview

## Presets & Project Management

- [x] **Effect Presets**
  - [x] Save current stack as named preset
  - [x] Preset browser list with load/delete
  - [x] Preset thumbnails
  - [x] Import/export presets (JSON)
  - [ ] Default presets for common looks
- [x] **Project Save/Load**
  - [x] Save project file (.moshdither) via Ctrl+S
  - [x] Load project file (restore stack, media refs)
  - [x] Auto-save
  - [x] Recent projects list

## UI/UX Polish

- [x] **Keyboard Shortcuts**
  - [x] Space = play/pause
  - [x] Arrow keys = nudge frame
  - [x] Home/End = jump to start/end
  - [x] Delete = remove selected effect
  - [x] Ctrl/Cmd+Z = undo
  - [x] Ctrl/Cmd+Shift+Z = redo
  - [x] Ctrl/Cmd+Y = redo
  - [x] Ctrl/Cmd+S = save project
  - [ ] Number keys = switch effect categories
  - [ ] Custom shortcut editor
- [ ] **Dark/Light Theme**
  - [ ] Theme toggle
  - [ ] Consistent color tokens
- [ ] **Responsive Layout**
  - [ ] Collapsible panels
  - [ ] Resizable panel splits
  - [ ] Panel pop-out to separate window

## Performance & Architecture

- [ ] **WebGL Optimization**
  - [ ] Shader compilation caching
  - [ ] Texture pooling
  - [ ] Lazy uniform updates
  - [ ] Frame skipping during scrub
- [ ] **Rust Optimization**
  - [ ] Parallel frame processing (rayon)
  - [ ] GPU acceleration where possible
  - [ ] Memory pool for frame buffers
- [ ] **General**
  - [ ] Web Worker for audio analysis
  - [ ] IndexedDB for large asset caching
  - [ ] Lazy load SAM3 model
