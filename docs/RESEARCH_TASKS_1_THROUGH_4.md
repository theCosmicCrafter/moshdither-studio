# Research Report: Tasks 1 Through 4

**Date:** June 9, 2026
**Scope:** Deep-dive investigation into four high-impact integration targets identified during the CascadeProjects cross-project scan. No code was written during this phase — research only.

---

## Task 1: Debounced Inputs, Visual Sliders, and Persistence

### 1.1 React 19 Debounce Patterns

**Source investigated:** React 19 docs (`useDeferredValue`), `drawing-app/useDebounce.ts`

**Key finding:** `useDeferredValue` and `useDebounce` solve different problems.

| Hook | Purpose | Good for sliders? |
|------|---------|-----------------|
| `useDeferredValue` | Defers *re-rendering* of a subtree, keeping UI responsive | No — it still triggers state updates immediately |
| `useDebounce` (setTimeout) | Delays the *state setter* itself until user stops interacting | **Yes** — prevents shader recompilation spam |

**Why `useDebounce` is correct for MoshDither:**
When a user drags an "Intensity" slider from 0.0 to 1.0, the `updateParam()` call currently fires 60+ times per second. Each call updates React state, which triggers `useEffect` in `WebGLCanvas`, which recompiles shaders. With `useDebounce(value, 150)`, the state only commits after the user pauses for 150ms. The visual slider thumb still updates instantly (via local component state), but the expensive downstream work is batched.

**Recommended pattern:**
```ts
// In PropertiesPanel: local state for immediate visual feedback
const [localValue, setLocalValue] = useState(activeFx.params.intensity);

// Debounced version that actually commits to global state
const debouncedValue = useDebounce(localValue, 150);

useEffect(() => {
  updateParam('intensity', debouncedValue);
}, [debouncedValue]);
```

### 1.2 Gradient-Fill Range Sliders

**Source investigated:** `drawing-app/slider.tsx`

**Implementation:** CSS `linear-gradient(to right, accent 0%, accent ${percent}%, track ${percent}%, track 100%)` applied to the input's `style` prop. Works across all modern browsers. Uses `appearance: none` to hide the default track.

**Limitation:** The `drawing-app` implementation uses inline styles. For MoshDither, we should use CSS custom properties (`--slider-fill-percent`) so the gradient updates via a CSS variable instead of inline style recreation.

### 1.3 Persistence: localStorage vs. Electron safeStorage

**Source investigated:** Electron `safeStorage` API docs, `drawing-app/useLocalStorage.ts`

**The problem:** Raw `localStorage` is:
- Unencrypted on disk (plaintext JSON in LevelDB)
- Limited to ~5-10MB
- Synchronous (blocks renderer on read/write)
- Shared across all apps on the same origin (including browser tabs if not in Electron)

**Electron `safeStorage` (recommended for sensitive data):**
- **macOS:** Keychain Access — other apps cannot decrypt without user override
- **Windows:** DPAPI — protected from other users, not other same-user apps
- **Linux:** Secret Service / kwallet / Portal Secret — varies by DE
- **Async API:** Non-blocking, supports key rotation (`shouldReEncrypt` flag), handles temporary unavailability

**Recommendation for MoshDither:**
- Use `useLocalStorage` pattern for **non-sensitive** data (last output directory, export format, UI panel open/closed states) — fast, simple
- Use `safeStorage.encryptStringAsync()` for **sensitive** data (RPC tokens, API keys, user credentials) — secure
- Never store the Python RPC token in plaintext localStorage

---

## Task 2: Professional Brush Engine for Mask Painting

### 2.1 perfect-freehand Library

**Source investigated:** GitHub `steveruizok/perfect-freehand` (5.6k stars, actively maintained)

**What it does:** Converts a series of input points into a smooth, natural-looking stroke outline using cubic bezier curves and pressure simulation. Handles variable width based on velocity (faster = thinner).

**Key options from the API:**
| Option | Type | Effect |
|--------|------|--------|
| `size` | number | Base stroke diameter |
| `thinning` | number (0-1) | How much velocity reduces width |
| `smoothing` | number (0-1) | Curve smoothing (0 = jagged, 1 = very smooth) |
| `streamline` | number (0-1) | How much to pull points toward average direction |
| `taper` | boolean/number | Taper at start/end of stroke |
| `simulatePressure` | boolean | Generate fake pressure from velocity if hardware lacks it |

**Integration complexity:** Low. Single dependency. The `drawing-app/BrushEngine.ts` wrapper shows exactly how to use it: collect `BrushPoint[]` during `pointermove`, call `getStroke(points, options)` on `pointerup`, render with `Path2D` + `ctx.fill()`.

### 2.2 Pointer Events API

**Source investigated:** MDN PointerEvent docs

**Critical properties for brush input:**

| Property | Range | Use in brush engine |
|----------|-------|---------------------|
| `pressure` | 0.0 - 1.0 | Directly maps to stroke width multiplier |
| `tiltX` / `tiltY` | -90 to 90 | Angle of stylus — can affect brush shape/orientation |
| `width` / `height` | pixels | Contact ellipse size for finger/stylus |
| `pointerType` | "mouse" / "pen" / "touch" | Mouse = no pressure (simulate), Pen = use real pressure |
| `getCoalescedEvents()` | Array | Returns ALL intermediate points the OS coalesced into a single `pointermove`. Critical for smooth curves at high speed. |

**Implementation note:** The current mask painting uses `onMouseMove`. Switching to `onPointerMove` + `getCoalescedEvents()` will dramatically improve stroke quality on high-DPI tablets (Wacom, iPad, Surface).

**Event sequence for a stroke:**
```
pointerdown → pointermove (many) → pointerup
     │              │                    │
   start         collect points      finalize + render
   stroke        + getCoalesced      via BrushEngine
```

### 2.3 Eraser Implementation

**Current state:** Binary eraser (removes pixels completely).
**Proposed upgrade:** Use the same `BrushEngine` with `globalCompositeOperation = 'destination-out'` and configurable hardness. This creates a soft-edge eraser that feather-fades the mask edges instead of hard-cutting them.

---

## Task 3: Blend Modes in WebGL2 and Layer Compositing

### 3.1 The Core Problem

**Source investigated:** MDN `globalCompositeOperation` (26 modes), MDN `blendFunc()` (basic factors), Khronos WebGL 2.0 spec

**WebGL `blendFunc()` is NOT enough.** It only supports basic arithmetic:
- `SRC_COLOR`, `DST_COLOR`, `SRC_ALPHA`, `ONE_MINUS_SRC_ALPHA`, etc.
- Formula: `color = src * sfactor + dst * dfactor`

This can implement: Normal, Additive, Multiply (partially), Screen (partially).

**It CANNOT implement:** Overlay, Soft Light, Hard Light, Color Dodge, Color Burn, Hue, Saturation, Color, Luminosity. These require per-pixel conditional logic ("if base < 0.5, use multiply, else use screen") that cannot be expressed as a simple linear blend function.

### 3.2 The Solution: Shader-Based Compositing

**Source investigated:** `glsl-playground/renderer.js` ping-pong pattern

Each blend mode must be implemented as a fragment shader. The pipeline becomes:

```
Pass 0: Input texture → Effect 0 shader → FBO 0
Pass 1: FBO 0 → Effect 1 shader → FBO 1 (with blend mode uniform)
Pass 2: FBO 1 → Effect 2 shader → FBO 0 (with blend mode uniform)
...
Final:  Last FBO → blend with original → screen
```

**For each blend mode, a fragment shader snippet:**

```glsl
// Overlay blend mode
vec3 blendOverlay(vec3 base, vec3 blend) {
  return vec3(
    base.r < 0.5 ? (2.0 * base.r * blend.r) : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r)),
    base.g < 0.5 ? (2.0 * base.g * blend.g) : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g)),
    base.b < 0.5 ? (2.0 * base.b * blend.b) : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b))
  );
}
```

**All 16 blend modes from `drawing-app/layer.ts` are implementable in GLSL.** The formulas are well-documented in the W3C Compositing and Blending spec and the SVG/Canvas specs.

### 3.3 Implementation Strategy

**Option A: Per-Mode Shaders**
Generate a separate fragment shader for each blend mode. Most flexible but many shader programs to manage.

**Option B: Mega-Shader with Uniform**
Single fragment shader with a `uniform int blendMode` and a large switch statement. Simpler to manage but slightly more GPU instructions per pixel.

**Recommendation:** Option B for MoshDither. The performance impact of a switch in a fragment shader is negligible for a fullscreen quad at 60fps. It reduces WebGL program management complexity significantly.

### 3.4 Texture Resize Before Upload

**Source investigated:** `glsl-playground/TextureManager.js`

The `resizeImage(dataURL, maxSize)` utility downsizes user-provided textures to a maximum dimension (default 512px) before GPU upload. This prevents GPU memory exhaustion when users import 4K images. MoshDither should adopt this for the media texture loader.

---

## Task 4: Structured Logging with PII Redaction

### 4.1 Electron Logging Landscape

**Source investigated:** `electron-log` GitHub (1.5k stars, 569 commits), `daydream-fluid-studio/main.js`

| Solution | Pros | Cons |
|----------|------|------|
| `electron-log` npm | Mature, transports for file/console/remote, log levels, IPC support | Less control over rotation, no built-in PII redaction |
| Custom (`daydream-fluid-studio`) | Full control over format, rotation, PII, JSONL | Must maintain ourselves |
| Electron `crashReporter` | Native crash dumps, uploads to server | Only for crashes, not general logging |

**Recommendation:** Build on the `daydream-fluid-studio` pattern (custom) rather than adding another dependency. It already has everything needed and is more flexible.

### 4.2 PII Redaction Patterns

**Source investigated:** `daydream-fluid-studio/sanitizeText()`

**Patterns that MUST be scrubbed before disk write:**

| Pattern | Regex Example | Risk |
|---------|--------------|------|
| Bearer tokens | `Bearer\s+[^\s"']+` | API auth tokens in HTTP logs |
| OpenAI keys | `sk-[A-Za-z0-9]+` | LLM API keys |
| API key KV | `"apiKey"\s*:\s*"[^"]+"` | JSON config with embedded keys |
| JWT tokens | `eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*` | Session/auth tokens |
| Connection strings | `[A-Za-z]+://[^:]+:[^@]+@` | Database credentials |
| Email addresses | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` | User PII |
| File paths (on error) | Windows user paths contain username | Partial: scrub home directory |

**Implementation:** Run `sanitizeText()` on EVERY string before writing to the log stream. Apply it in the console interceptor, not at individual log call sites, to guarantee nothing leaks.

### 4.3 Log Rotation Strategy

**Source investigated:** `daydream-fluid-studio/initLogging()`

**Current pattern (from daydream-fluid-studio):**
- 7-day retention (`retentionMs = 7 * 24 * 60 * 60 * 1000`)
- Max 200 log files (sorted by mtime, delete oldest)
- Session ID format: `YYYY-MM-DD_HH-MM-SS-<pid>-<hexnonce>`
- `latest.txt` symlink for quick access
- `runs.jsonl` for structured event querying

**Improvement for MoshDither:**
- Reduce retention to 30 days (not 7) for debugging long-running issues
- Add a `crash-marker.json` file written on `uncaughtException` so the next launch can detect a crash
- Include Electron version, Node version, GPU info, and app version in the `runs.jsonl` start event

### 4.4 Console Interception Architecture

**Source investigated:** `daydream-fluid-studio/main.js` lines 131-139

```js
const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
console.log = (...args) => { writeLine('LOG', args); orig.log(...args); };
```

**Why this is important:** Many libraries and developer-written code use `console.error()` for non-fatal issues. Without interception, these messages go only to stderr and are lost in production (users don't run from terminal). With interception, they go to the rotating log file.

**Caveat:** Must preserve the original console methods so dev tools in the renderer still work. The pattern above does this by calling `orig.log()` after writing to the file stream.

---

## Summary: What We Should Build

Based on this research, here are the recommended implementations for each task:

| Task | Integration Decision | Key File(s) to Create/Modify |
|------|---------------------|------------------------------|
| **1** | `useDebounce` hook (drawing-app pattern) + `safeStorage` for sensitive prefs | `src/hooks/useDebounce.ts`, `src/hooks/useSafeStorage.ts`, `PropertiesPanel.tsx` |
| **2** | `BrushEngine` wrapper around `perfect-freehand` + Pointer Events | `src/lib/BrushEngine.ts`, `Viewport.tsx` mask painting handlers |
| **3** | Shader-based blend modes (mega-shader with uniform switch) + `createFramebufferTexturePair()` | `WebGLCanvas.tsx`, new `src/webgl/blendModes.ts` |
| **4** | Custom structured logger based on daydream-fluid-studio pattern | `electron/logger.ts`, replace `crashReporter.ts` |

All four tasks have production-ready reference code in the local workspace. No external research beyond what was done above is required to begin implementation.
