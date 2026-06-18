# Product Requirements Document: MoshDither Studio

## 1. Executive Summary

MoshDither Studio is a unified desktop application that consolidates the capabilities of 37+ existing datamoshing, dithering, glitch, and video-art tools into a single, modern, cross-platform creative suite. The app does not _wrap_ existing tools—it _re-implements their algorithms natively_ as modular effects.

**Organizational model:** Inspired by Datamosher Pro's clean, category-driven workflow. Users load media, browse effects by category (Datamoshing, Dithering, Glitch, Analog, Pixel Geometry, Segmentation, Artistic), pick an effect, tweak its parameters, preview the result, and export. Effects can be stacked in a simple, linear pipeline for combining multiple techniques.

**Core value proposition:** One app. Every technique. Easy to browse, easy to apply.

---

## 2. Target Stack Recommendation

After analyzing every reference tool in the library, the recommended stack is:

| Layer                    | Technology                                                                                  | Rationale                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop Shell**        | **Tauri v2**                                                                                | Proven in the reference library (BitRot uses it). Tiny bundle size (<3 MB), native WebView, secure IPC, cross-platform.            |
| **Backend / Engine**     | **Rust**                                                                                    | Memory-safe systems language fast enough for pixel-level operations. BitRot already proves Rust can handle heavy video pipelines.  |
| **Frontend UI**          | **Vite + TypeScript + React**                                                               | Fast HMR, excellent ecosystem, easy to build complex parameter UIs. Reference tools show modern web UIs work well for this domain. |
| **Video I/O & Encoding** | **FFmpeg** (sidecar)                                                                        | Universally used by every reference tool. Non-negotiable for video.                                                                |
| **Image Processing**     | **Rust crates** (`image`, `imageproc`, `raster`, `rayon`) + **WebGL/Canvas 2D** for preview | Native Rust for quality renders; Canvas/WebGL for real-time preview.                                                               |
| **Audio/DSP**            | **Rust crates** (`rustfft`, `biquad`, `rubato`, `symphonia`)                                | Replaces Audacity entirely—no external audio editor needed.                                                                        |
| **Math / GPU Compute**   | **nalgebra / glam** + **wgpu** (optional)                                                   | For optical flow, motion estimation, and GPU-accelerated previews if needed.                                                       |
| **ML / Segmentation**    | **ONNX Runtime** via **`ort` crate** + **SAM3 ONNX models**                                 | Promptable image/video segmentation, background removal, object masking, mask-driven effects.                                      |

### Why Not the Other Stacks?

| Alternative                           | Why We Passed                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Electron**                          | Bundles Chromium (~150 MB). Slower startup. Heavier memory use. Reference tool WRONG uses it and is bloated. |
| **Qt6 / C++** (like Ditherista)       | Slower iteration, harder cross-platform builds, no modern web UI patterns.                                   |
| **Pure Python** (like Datamosher Pro) | Slow for pixel-level work, painful packaging (PyInstaller), GIL limits parallelism.                          |
| **Browser-only** (like DatamoshLive)  | Cannot access FFmpeg natively, limited file I/O, codec restrictions.                                         |
| **Flutter**                           | Weak video/image processing ecosystem. No FFmpeg bridge as mature as Tauri+Rust.                             |

### Tauri + Rust is the Sweet Spot

BitRot (already in your references) is the **existence proof**: it runs a Rust video pipeline (pixelsort, datamosh, vaporwave, kaleidoscope, block-shift) behind a Tauri/Vite frontend. It bundles FFmpeg as a sidecar. It works on Windows, macOS, and Linux. We are extending that pattern from 5 effects to 100+.

---

## 3. Architecture

### 3.1 High-Level Diagram

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Tauri Window (WebView)                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  React UI                                                     │  │
│  │  - Media preview (video player / image viewer)               │  │
│  │  - Effect category browser (tabs/groups)                     │  │
│  │  - Effect list (click to select)                             │  │
│  │  - Effect stack (reorderable, 1-N effects)                     │  │
│  │  - Parameter panel (sliders, toggles, palettes)              │  │
│  │  - Export settings                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                        ↑ ↓ Tauri IPC (JSON)                         │
├──────────────────────────────────────────────────────────────────────┤
│  Rust Backend                                                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐│
│  │ Effect Registry │  │ Linear Pipeline  │  │ FFmpeg Orchestrator ││
│  │ (by Category)   │→ │ (image → effect  │→ │ (Video I/O, encode) ││
│  │                 │  │  → effect → out) │  │                     ││
│  └─────────────────┘  └──────────────────┘  └─────────────────────┘│
│       ↑                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │  DSP        │  │  Optical    │  │  Preview Renderer           │  │
│  │  (Audio)    │  │  Flow       │  │  (frame buffer → IPC)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Segmentation Engine (SAM3 via ORT)                          │  │
│  │  - Mask generation (point/box/text/auto)                     │  │
│  │  - Mask compositing (inside/outside/alpha)                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Core Design Principles

1. **Effect-as-Plugin**: Every feature from the unified report is a standalone effect implementing a common `Effect` trait. Registered in a category-indexed effect registry for easy browsing.
2. **Category-Driven UI**: Effects are grouped into clear categories (Datamoshing, Dithering, Glitch, Analog, Pixel Geometry, Segmentation, Artistic) exactly like Datamosher Pro's effect browser. Users click a category, then click an effect.
3. **Linear Effect Stack**: Effects are applied in a simple, top-to-bottom stack (like image filters in Photoshop or Lightroom). Reorderable. Each effect in the stack receives the output of the previous. No complex node graph needed.
4. **Two-Tier Rendering**:
   - **Preview tier**: Fast, approximate, possibly lower resolution, runs in real-time for UI feedback.
   - **Export tier**: Full quality, full resolution, multi-threaded, potentially slower.
5. **FFmpeg as Video Backbone**: Video decoding/encoding, container manipulation, and I-frame surgery are orchestrated via FFmpeg commands. Rust manages the pipeline, not the pixels.
6. **Rust as Pixel Backbone**: Image dithering, pixel sorting, color channel shifting, noise generation, and static image processing are pure Rust.
7. **Mask-Aware Pipeline**: Every effect can optionally accept a mask (from SAM3 or manual drawing). Effects apply selectively: inside mask, outside mask, or masked-to-alpha.
8. **Project as JSON**: A project file is a JSON object with a single source, an ordered effect stack, masks, and parameters. Fully portable and versionable.

---

## 4. Feature Decomposition (from Unified Report)

### 4.1 Datamoshing Engine (Video)

| Feature                                                           | Source Tool(s)                  | Implementation Strategy                                                                                            |
| ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| I-frame removal (automatic, range, frame-number)                  | Datamosher Pro, tomato.py       | FFmpeg `mpdecimate`, `setpts`, or direct stream copy with I-frame deletion via bitstream filter                    |
| Frame reordering (shuffle, sort-by-size, invert, reverse, random) | Datamosher Pro, datamosh-js     | Decode to frame sequence → reorder in memory → re-encode                                                           |
| Frame repetition (bloom, water bloom, repeat, glide, pulse)       | Datamosher Pro, pymosh          | Duplicate frame buffers at macroblock or frame level before re-encode                                              |
| Motion transfer                                                   | Datamosher Pro                  | Extract motion vectors via FFmpeg, apply to different video                                                        |
| Macroblock effects (shear, shift, sink, stretch, fluid)           | Datamosher Pro, ffglitch        | Direct macroblock manipulation or ffmpeg + ffglitch scripts                                                        |
| Cross-video datamosh                                              | datamosh-qbixxx, python-moshion | Concatenate raw streams with broken delta references                                                               |
| Real-time live datamosh                                           | DatamoshLive                    | WebCodecs API via Tauri — this is the one feature that may need a separate browser context or a Rust/WebRTC bridge |
| Sample/Inject buffer                                              | DatamoshLive                    | Ring buffer of encoded frames, replay on trigger                                                                   |

**Key insight:** Most of these are different ways of manipulating FFmpeg's bitstream or frame sequence. A single "Datamosh" effect node in the engine can expose all these as sub-modes.

### 4.2 Dithering Engine (Image)

| Algorithm                                                      | Source                         | Implementation                                                          |
| -------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Bayer ordered (2x2/4x4/8x8/16x16)                              | didder, Dither Pie, Ditherista | Pure Rust lookup table                                                  |
| Floyd-Steinberg (serpentine)                                   | didder, Dither Pie, ImageRot   | Pure Rust, `rayon` parallelizable per row                               |
| Jarvis-Judice-Ninke, Atkinson, Stucki, Burkes, Sierra variants | didder                         | Pure Rust error diffusion kernels                                       |
| Ostromoukhov, Riemersma                                        | Dither Pie                     | Pure Rust Hilbert curve traversal                                       |
| Blue Noise, IGN                                                | Dither Pie                     | Precomputed noise textures or hash-based                                |
| Wavelet, Adaptive Variance, Perceptual, Hybrid                 | Dither Pie                     | More complex; may need `ndarray` + custom kernels                       |
| Vector dither (circle/square/diamond shapes, SVG export)       | shpigford-dither               | Frontend generates SVG from Rust-computed dither map                    |
| 90+ method catalog                                             | Ditherista                     | Port `libdither` algorithms to Rust, or FFI to C++ if licensing permits |

### 4.3 Glitch & Corruption Engine (Image/Video)

| Technique                                                                   | Source                                 | Implementation                                                     |
| --------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| JPEG quantization table manipulation                                        | JPEGGED, GlitchNodes (GlitchIT)        | Modify DCT quantization matrices before inverse DCT in Rust        |
| JPEG scan data corruption                                                   | jpg-glitch, glitch-studio, GlitchNodes | Byte-level corruption between SOS/EOI markers                      |
| PNG codec parameter glitch                                                  | glitch-studio                          | Custom PNG decoder with tweakable Huffman/IDAT parameters          |
| General databending (change/reverse/repeat/remove/zero/insert/replace/move) | glitch-tool                            | Byte-array operations in Rust                                      |
| Wavelet corruption                                                          | GlitchNodes (Corruptor)                | `dwt` crate or custom wavelet transform + coefficient manipulation |
| Slice displacement (horizontal/vertical/both)                               | GlitchNodes (DataBend, VHSonAcid)      | Row/column array shifting in Rust                                  |

### 4.4 Analog/VHS/CRT Engine (Image/Video)

| Effect                                        | Source                                | Implementation                               |
| --------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| Scanlines                                     | BitRot, ImageRot, GlitchNodes (Scanz) | Shader or canvas overlay                     |
| VHS artifacts (tracking drift, wobble, noise) | BitRot, VHSonAcid                     | Per-row time-varying offset + noise          |
| Chromatic aberration / RGB split              | BitRot, ImageRot, GlitchNodes         | Channel separation with configurable offsets |
| CRT dot mask / phosphor glow                  | GlitchNodes (VideoModulation)         | Shader with dot pattern texture              |
| Analog TV glitch (IIR lowpass, subcarrier)    | GlitchNodes (TvGlitch)                | Row-wise IIR filter in Rust                  |
| Interference lines                            | ImageRot                              | Row displacement with probability            |

### 4.5 Pixel Sorting & Geometric Engine

| Effect                                | Source                | Implementation                                 |
| ------------------------------------- | --------------------- | ---------------------------------------------- |
| Pixelsort (by threshold, angle, etc.) | BitRot, GlitchNodes   | Threshold → sort contiguous runs by brightness |
| Pixel redistribution                  | GlitchNodes           | Pattern-based spatial remapping                |
| Kaleidoscope                          | BitRot                | Mirror-tile segments of image buffer           |
| Anaglyph                              | ImageRot              | Channel offset with red/cyan separation        |
| Wave distortion                       | ImageRot, GlitchNodes | Sine displacement map                          |
| Block shift                           | BitRot                | Grid-based random offset of blocks             |

### 4.6 Optical Flow & Motion Engine

| Effect                        | Source      | Implementation                                             |
| ----------------------------- | ----------- | ---------------------------------------------------------- |
| Optical flow extraction       | transflow   | FFmpeg `farneback` or OpenCV (if we add `opencv-rust` dep) |
| Flow transfer to image/video  | transflow   | Warp image by flow field using Rust or FFmpeg              |
| PixelFloat (gravity + motion) | GlitchNodes | Optical flow → gravity simulation on pixel blocks          |

### 4.7 Audio-Reactive Engine

| Feature                                                   | Source             | Implementation                                                                                                          |
| --------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Onset / beat / tempo detection                            | beatviewer         | `aubio` Rust bindings or `symphonia` + custom onset detector                                                            |
| Beat-synced video cuts                                    | beatviewer         | Trigger effect parameters on beat markers                                                                               |
| Frame-as-audio DSP (Echo, Reverb, Low-pass, Filter Curve) | audacity-scripting | Decode frame → flatten to 1D PCM → apply DSP filter (`biquad`, `rustfft`) → reshape to frame. **No Audacity required.** |
| Audio file as mosh driver                                 | beatviewer         | Extract beat markers, drive frame drop/injection                                                                        |

### 4.8 Segmentation & Masking Engine (SAM3)

| Feature                       | Capability                                                                               | Implementation                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Point-prompt segmentation** | Click any point on image/video, get precise object mask                                  | SAM3 ONNX encoder + decoder via `ort` crate. Encoder runs once per image; decoder is fast per prompt.      |
| **Box-prompt segmentation**   | Draw a rectangle, get mask for object inside                                             | SAM3 decoder accepts bounding box as additional prompt.                                                    |
| **Text-prompt segmentation**  | Type "person", "car", "sky" — model segments matching region                             | Requires text-encoder ONNX model or CLIP-based prompt-to-embedding mapping.                                |
| **Automatic mask generation** | Segment everything in the image (hierarchical masks)                                     | SAM3 automatic mask generator mode — produces multi-scale masks.                                           |
| **Video mask tracking**       | Track a segmented object across video frames                                             | SAM3 video mode (or optical-flow-assisted mask propagation between frames).                                |
| **Background removal**        | Isolate foreground, discard background                                                   | Mask → invert → apply as alpha channel or composite on new background.                                     |
| **Object isolation**          | Extract single object as transparent PNG/video                                           | Mask → alpha compositing.                                                                                  |
| **Mask-driven effects**       | Apply any effect only inside or outside a mask                                           | Every effect in the pipeline accepts an optional `Mask` input. Mask determines which pixels are processed. |
| **Mask feathering / blur**    | Soft edges on mask boundaries                                                            | Gaussian blur on mask channel, configurable radius.                                                        |
| **Mask inversion**            | Flip inside ↔ outside                                                                    | Bitwise NOT on mask buffer.                                                                                |
| **Manual mask painting**      | Brush/wand/polygon mask editing (fallback when SAM3 is not available or for fine-tuning) | Canvas-based brush strokes + flood-fill wand. Stored as grayscale raster mask.                             |

**Mask-as-Compositor:** SAM3 does not _modify_ pixels directly — it produces masks. These masks feed into the compositing system:

- **Layer mask**: A layer shows/hides based on its mask.
- **Effect mask**: An effect (e.g., dither, pixel sort, datamosh) only applies where the mask is white.
- **Mask-to-alpha**: Convert mask to alpha channel for export.

### 4.9 Luminous & Artistic Effects

| Effect                 | Source                   | Implementation                                 |
| ---------------------- | ------------------------ | ---------------------------------------------- |
| LuminousFlow           | GlitchNodes              | Edge detection → flow field → strand rendering |
| VaporWave aesthetic    | GlitchNodes, datamosh-js | Color banding + chromatic shift + glow         |
| Pixel8Bit retro        | GlitchNodes              | Fixed palette quantization + ordered dither    |
| 8-bit console palettes | GlitchNodes              | Lookup tables (PICO-8, NES, C64, etc.)         |

---

## 5. Audacity Question: Answered

**No, Audacity is not required.**

The Audacity datamoshing script works by:

1. Extracting video frames as images
2. Converting each frame's pixel data to a raw PCM audio buffer (treating RGB values as audio samples)
3. Running DSP filters (Echo, Reverb, Low-pass, etc.) on that "audio"
4. Converting back to an image frame

This is purely signal processing. Rust has excellent DSP crates:

- `rustfft` for FFT-based filters
- `biquad` for parametric EQ, low-pass, high-pass
- `rubato` for resampling
- `biquad` or custom IIR for Echo/Reverb
- Direct convolution for Filter Curve

The effect chain (Echo → Reverb → Filter Curve) becomes a series of Rust functions applied to a `Vec<f32>` representing the frame, with time-varying parameters driven by frame timestamp `t`.

**Conclusion:** The "Audacity" feature is just a creative use of DSP. We reimplement the DSP directly.

---

## 6. Effect System Design

### 6.1 The `Effect` Trait

Every feature from the unified report becomes a Rust struct implementing a common trait:

```rust
pub trait Effect: Send + Sync {
    /// Unique ID (e.g., "dither.bayer", "datamosh.void", "glitch.jpeg_scan")
    fn id(&self) -> &'static str;

    /// Human-readable name
    fn name(&self) -> &'static str;

    /// Category (Dithering, Datamoshing, Glitch, Analog, etc.)
    fn category(&self) -> EffectCategory;

    /// Which media types this effect supports (image, video, or both)
    fn supported_media(&self) -> MediaType;

    /// Parameter schema for the UI to render controls
    fn parameters(&self) -> Vec<ParameterDef>;

    /// Process a single frame with optional mask (for image / preview)
    fn process_frame(&self, input: &Frame, mask: Option<&Mask>, params: &ParameterValues) -> Result<Frame>;

    /// Process a video segment with optional mask (for heavy video operations)
    fn process_video(&self, input: &VideoSegment, mask: Option<&Mask>, params: &ParameterValues) -> Result<VideoSegment>;
}
```

### 6.2 Effect Categories

Effects are grouped by category for the browser UI. Each effect declares whether it supports images, video, or both.

```text
Datamoshing          [video-only]
├── IFrameRemoval
├── FrameReorder
├── FrameRepetition
├── MotionTransfer
└── CrossVideoMosh

Dithering            [image + video]
├── Ordered (Bayer, ClusteredDot, CustomMatrix)
├── ErrorDiffusion (FloydSteinberg, Atkinson, etc.)
├── NoiseBased (BlueNoise, IGN, Random)
└── Advanced (Wavelet, Adaptive, Perceptual, Hybrid)

Glitch               [image + video]
├── JpegQuantization
├── JpegScanCorrupt
├── PngCodecGlitch
├── Databend
└── WaveletCorrupt

Analog               [image + video]
├── VHS
├── Scanlines
├── CRT
├── TVGlitch
└── ChromaticAberration

PixelGeometry        [image + video]
├── PixelSort
├── PixelRedistribute
├── Kaleidoscope
├── Anaglyph
└── WaveDistort

OpticalFlow          [video-primary]
├── FlowExtract
├── FlowTransfer
└── PixelFloat

AudioReactive        [video + audio-driven]
├── BeatSync
├── OnsetDetect
└── FrameAsAudioDSP

Segmentation         [image + video]
├── Sam3PointPrompt
├── Sam3BoxPrompt
├── Sam3TextPrompt
├── Sam3AutoMask
├── Sam3VideoTrack
└── ManualMaskPaint

Artistic             [image + video]
├── LuminousFlow
├── VaporWave
└── Pixel8Bit
```

### 6.3 Pipeline — Linear Stack

The effect pipeline is a simple, ordered stack (not a node graph). Each effect receives the output of the previous effect as its input:

```text
Source Image → Bayer Dither (16 colors) → PixelSort (threshold) → VHS (tracking 0.3) → Export PNG
```

- The stack is top-to-bottom in the UI, left-to-right in execution order.
- Reordering is drag-and-drop.
- Any effect can be temporarily disabled (bypassed) without removing it from the stack.
- The stack is serialized to JSON and can be saved/loaded as a preset.

---

## 7. UI Design

### 7.1 Layout — Datamosher-Pro Style

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Menu Bar  [Open] [Export] [Undo] [Redo] [Settings]               │
├──────────────────┬──────────────────────────────┬──────────────────┤
│                  │                              │                  │
│  EFFECT BROWSER  │      PREVIEW VIEWPORT        │  EFFECT STACK    │
│                  │                              │  & PARAMETERS    │
│  [Tabs]          │      (Video / Image)         │                  │
│    Datamoshing   │                              │  1. Bayer Dither │
│    Dithering     │      [▶] [⏸] [⏮] [⏭]      │     [▼ params]   │
│    Glitch        │                              │  2. Pixel Sort   │
│    Analog        │      [Before] [After]        │     [▼ params]   │
│    Pixel Geo     │                              │  3. VHS          │
│    Segmentation  │                              │     [▼ params]   │
│    Artistic      │                              │                  │
│                  │                              │  [+ Add Effect]  │
│  [Effect List]   │                              │                  │
│  ○ Void          │                              │  ──────────────  │
│  ○ Classic       │                              │  Mask: [mask_1]  │
│  ○ Rise          │                              │  Mode: [inside ▼]│
│  ○ Shuffle       │                              │                  │
│  ○ Bloom         │                              │  [Export]        │
│  ○ ...           │                              │                  │
├──────────────────┴──────────────────────────────┴──────────────────┤
│  Status: Ready  |  Resolution: 1920x1080  |  Duration: 0:05:12  │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 Panel Breakdown

#### Left Panel — Effect Browser

- **Category tabs** across the top: Datamoshing, Dithering, Glitch, Analog, Pixel Geometry, Segmentation, Artistic.
- **Effect list** below: vertically scrollable list of effects in the selected category. Click to add to the stack.
- **Search box**: Filter effects by name across all categories.
- **Favorites**: Starred effects for quick access.

#### Center Panel — Preview Viewport

- **Media player**: Video controls (play/pause/scrub) or static image display.
- **Before/After toggle**: Split-screen or A/B comparison.
- **Zoom/Pan**: Mouse wheel zoom, drag to pan.
- **Mask overlay**: Toggle to see mask boundaries on the preview.

#### Right Panel — Effect Stack & Parameters

- **Effect stack**: Reorderable list of applied effects (drag to reorder, click to expand/collapse).
- **Parameter panel**: Expands when an effect in the stack is selected. Sliders, toggles, color pickers, palette selectors — whatever the effect defines.
- **Mask selector**: Dropdown to attach a SAM3/manual mask to the current effect, plus mode (inside/outside/alpha).
- **Export button**: One-click export with format/codec selector.

### 7.3 Key UI Patterns

- **Datamosher Pro-style category browser**: Tabs for categories, list for effects. The mental model is: "I want a datamosh → I want Classic → tweak parameters → done."
- **BitRot-style effect stack**: Reorderable list on the right for combining multiple effects.
- **Ditherista-style instant preview**: Click any effect in the list to immediately preview it on the loaded media (without adding it to the stack yet).
- **Dither Pie-style palette popover**: When a dithering effect is selected, a popover with palette picker, lospec import, and live preview appears.

---

## 8. Data Model

### 8.1 Project File (JSON)

A project represents one source (image or video) with an ordered stack of effects applied to it. Simple, linear, and portable.

```json
{
  "version": "1.0.0",
  "source": {
    "type": "video",
    "path": "C:/Users/.../input.mp4",
    "trimStart": null,
    "trimEnd": null
  },
  "effectStack": [
    {
      "effectId": "dither.bayer",
      "params": { "matrixSize": 8, "palette": ["#000", "#fff"] },
      "mask": null,
      "maskMode": null
    },
    {
      "effectId": "pixel.sort",
      "params": { "threshold": 0.5, "direction": "horizontal" },
      "mask": null,
      "maskMode": null
    },
    {
      "effectId": "analog.vhs",
      "params": { "trackingDrift": 0.3, "noise": 0.2 },
      "mask": "mask_1",
      "maskMode": "inside"
    }
  ],
  "masks": [
    {
      "id": "mask_1",
      "type": "sam3_point",
      "params": { "points": [[0.5, 0.5]], "labels": [1] }
    }
  ],
  "export": {
    "format": "mp4",
    "codec": "h264",
    "quality": "high",
    "outputPath": null
  }
}
```

### 8.2 Preset System

Every effect configuration can be saved as a named preset. Presets are shareable JSON files.

---

## 9. Export & I/O

| Format         | Read | Write                        |
| -------------- | ---- | ---------------------------- |
| PNG            | Yes  | Yes                          |
| JPEG           | Yes  | Yes                          |
| GIF (animated) | Yes  | Yes                          |
| BMP / TIFF     | Yes  | No (PNG preferred)           |
| MP4 (H.264)    | Yes  | Yes                          |
| WebM (VP8/VP9) | Yes  | Yes                          |
| AVI            | Yes  | Yes (via FFmpeg)             |
| Image sequence | Yes  | Yes                          |
| SVG (dither)   | No   | Yes (shpigford-dither style) |

---

## 10. Development Phases

### Phase 1: Foundation (Weeks 1-3)

- Tauri v2 + Vite + React scaffold
- FFmpeg sidecar integration (copy BitRot's pattern)
- Effect trait + category-indexed registry system
- Basic image I/O (PNG/JPEG read/write)
- Preview viewport (Canvas 2D)
- Category tab UI + effect list browser (Datamosher-Pro style)
- Effect stack panel (add/remove/reorder/enable/disable)

### Phase 2: Image Effects (Weeks 4-7)

- Dithering engine (Bayer, Floyd-Steinberg, Atkinson, Blue Noise)
- Glitch engine (JPEG quantization, databending, slice shift)
- Analog engine (scanlines, chromatic aberration, VHS)
- Pixel geometry (pixel sort, kaleidoscope, wave distort)
- Palette system (import, extraction, fixed presets)

### Phase 3: Video Effects (Weeks 8-11)

- FFmpeg pipeline orchestration (decode → apply stack → encode)
- I-frame manipulation modes (Void, Classic, Rise, Shuffle)
- Frame reordering/repetition (Bloom, Repeat, Glide, Pulse)
- Video preview with frame-accurate scrubbing
- Batch export with progress bar

### Phase 4: Advanced Features (Weeks 12-15)

- **SAM3 segmentation engine**: `ort` crate integration, ONNX model download/management, point/box/auto mask generation
- Mask compositing system (inside/outside/alpha modes)
- Optical flow integration
- Audio-reactive engine (onset/beat detection)
- Frame-as-audio DSP (no Audacity)
- Real-time live preview (WebCodecs bridge)
- LuminousFlow, PixelFloat, and other advanced nodes

### Phase 5: Polish (Weeks 16-18)

- Preset library and sharing
- Export optimization
- Performance profiling
- Documentation and tutorials

---

## 11. Risks & Mitigations

| Risk                                                 | Mitigation                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Porting 90+ dithering algorithms is massive work     | Start with top 15 (Bayer, Floyd-Steinberg, Atkinson, Blue Noise, etc.). Add others incrementally.               |
| Real-time preview of heavy video effects is slow     | Two-tier rendering: fast approximate preview + full-quality export. Use lower resolution for preview.           |
| FFmpeg sidecar bundling is complex on all platforms  | Use `tauri-plugin-shell` + platform-triple naming like BitRot does. Provide setup script.                       |
| Optical flow needs OpenCV (heavy dependency)         | Make optional feature. Use FFmpeg's `farneback` first. Add OpenCV only if needed.                               |
| Audio-reactive beat detection in Rust is non-trivial | Use `aubio` C library bindings or `symphonia` + onset detection algorithm. Start with simple energy threshold.  |
| SAM3 ONNX model is large (~400MB encoder)            | Download on first run or offer as optional plugin. Cache locally. Use lighter SAM3-Mobile variant if available. |
| SAM3 inference is slow on CPU                        | Use `ort` with DirectML (Windows) / CoreML (macOS) / CUDA (Linux). Fall back to CPU with progress bar.          |
| Text-prompt SAM3 needs extra text encoder            | Ship CLIP ONNX or use offline prompt-to-embedding lookup table. Start with point/box prompts only.              |

---

## 12. Success Criteria

1. A user can open the app, load a video, click the **Datamoshing** tab, click **Classic**, adjust the range slider, and export — all within 30 seconds.
2. A user can load an image, click the **Dithering** tab, click **Floyd-Steinberg**, pick a 16-color palette, and export.
3. A user can stack effects: dither → pixel sort → VHS → export, with each effect visible and reorderable in the right panel.
4. Export quality matches or exceeds the reference tools for equivalent effects.
5. Bundle size under 50 MB (with FFmpeg sidecar). SAM3 models are downloaded on first use, not bundled.
6. Startup time under 2 seconds.
7. A user can click a point on an image, get a SAM3 mask, and apply any effect only to the masked region.
8. The effect browser must include at least 50 unique effects across all categories at v1.0.

---

_End of PRD._
