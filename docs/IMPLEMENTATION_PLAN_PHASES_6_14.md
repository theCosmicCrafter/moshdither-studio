# MoshDither Studio — Implementation Plan: Phases 6–14

**Date:** 2026-06-09  
**Status:** In Progress  
**Sources:** BRAINSTORM_MISSING_FEATURES_2026.md, PRODUCTION_HARDENING_PLAN.md, RESEARCH_TASKS_1_THROUGH_4.md, Datamosher Pro feature analysis, FFglitch frontend research.

---

## Phase 6: Logging & Final Security Hardening

**Goal:** Complete the transition from legacy crash reporter to structured logger. Apply remaining Electron security checklist items.

- [x] Structured logger (`electron/logger.ts`) — session-scoped, PII redaction, JSONL, rotation
- [x] Console interception to disk
- [x] Renderer log forwarding via IPC (`writeRendererLog`)
- [x] Crash marker detection (`checkCrashMarker`)
- [x] Background timer throttle disable
- [ ] Remove dead `crashReporter.ts` references
- [ ] Add renderer process memory limit (`--max-old-space-size=4096`)
- [ ] Add GPU sandbox early-start flag
- [ ] Electron fuses config (`afterPack` hook in `electron-builder.yml`)
- [ ] safeStorage integration for RPC token (never store in plaintext localStorage)

---

## Phase 7: WebGL Production Pipeline

**Goal:** Apply graphics-engine best practices. Cache shaders, manage FBOs, handle HiDPI, resize gracefully.

- [ ] FBO texture pair factory (`createFramebufferTexturePair`)
- [ ] Shader compilation cache (`Map<string, WebGLProgram>`)
- [ ] Framebuffer completeness checking
- [ ] Canvas `ResizeObserver` with `devicePixelRatio`
- [ ] Texture resize before GPU upload (max 4096px)
- [ ] Shader source sanitization (strip BOMs)

---

## Phase 8: UI Polish — Debounce, Sliders, Persistence

**Goal:** Every slider feels responsive. Preferences survive restarts. No more shader recompilation on every pixel of drag.

- [ ] `useDebounce` hook (150ms) for effect parameter updates
- [ ] Gradient-fill range slider component (CSS custom properties)
- [ ] `useLocalStorage` for non-sensitive prefs (export format, last dir, panel states)
- [ ] `useSafeStorage` for sensitive data (RPC token, API keys)
- [ ] Replace inline styles in `PropertiesPanel.tsx` with CSS classes where feasible

---

## Phase 9: Layer System with Blend Modes

**Goal:** Effects compose like Photoshop layers. Each effect has opacity + blend mode.

- [ ] 16 blend mode shaders: Normal, Multiply, Screen, Overlay, Darken, Lighten, ColorDodge, ColorBurn, HardLight, SoftLight, Difference, Exclusion, Hue, Saturation, Color, Luminosity
- [ ] Ping-pong dual FBO pipeline for layered rendering
- [ ] Layer opacity per effect (0–100%)
- [ ] Layer reorder (drag-and-drop in sidebar)
- [ ] Layer duplicate / merge down

---

## Phase 10: Professional Brush Engine

**Goal:** Mask painting feels like Procreate / Photoshop. Pressure-aware, smooth, natural strokes.

- [ ] Integrate `perfect-freehand` for stroke interpolation
- [ ] Pointer Events + `getCoalescedEvents()` for smooth curves
- [ ] Brush presets: Soft Round, Pencil, Charcoal, Watercolor
- [ ] Soft-edge eraser (`destination-out` blend)
- [ ] Brush size `[` / `]` shortcuts, opacity number keys
- [ ] Pressure, tilt, smoothing, taper, hardness

---

## Phase 11: Export System & Render Queue Integration

**Goal:** One-click export for common destinations. Render queue actually invokes ffmpeg.

- [ ] Export presets: YouTube 4K, Instagram Reel, GIF Meme, ProRes Master, Web Optimized
- [ ] Render queue integration with actual ffmpeg pipeline (MosherAdapter / DitherAdapter)
- [ ] Progress toasts with "Open folder" action
- [ ] Watermark / overlay burn-in
- [ ] Metadata preservation (EXIF/XMP passthrough)

---

## Phase 12: Batch Processing & Project Management

**Goal:** Process 100 files at once. Recent files list. Sample projects.

- [ ] Batch drop folder → apply effect stack to all files
- [ ] Parallel processing with concurrency limit
- [ ] Recent files list (last 20) with thumbnails
- [ ] Quick open (`Ctrl+P`) fuzzy file search
- [ ] Ship 3 sample projects: Cyberpunk Glitch, Retro VHS, Pixel Art Dither

---

## Phase 13: Comparison, Scopes & Onboarding

**Goal:** Users can see before/after. Pros get histograms. First-timers get a guided tour.

- [ ] A-B split-screen / horizontal wipe slider
- [ ] Before/after toggle (`\` key)
- [ ] Histogram (RGB/Luma) via offscreen WebGL canvas
- [ ] Interactive tutorial overlay (first-launch guided tour)

---

## Phase 14: Live Preview & Audio Waveform

**Goal:** Real-time feedback. Audio waveform in timeline. Beat detection.

- [ ] Audio waveform overlay in timeline (from video audio track)
- [ ] Beat detection using `librosa` or Web Audio API
- [ ] Auto-generate keyframes at beat boundaries
- [ ] Full-screen minimal preview mode (`F11`)
- [ ] Live mosh preview mode (lower quality, instant feedback)

---

## Verification Gates (All Phases)

```bash
# Type check
cd packages/desktop-gui && npx tsc --noEmit

# Unit tests
cd packages/desktop-gui && npx vitest run

# Python tests
cd packages/python-backend && python -m pytest test_main.py -v

# Production build
cd packages/desktop-gui && npm run build
```
