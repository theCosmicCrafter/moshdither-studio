# MoshDither Studio — Correctness, Quality & Scope Plan

**Date:** 2026-07-26
**Status:** Plan only. Nothing in this document has been implemented.
**Prerequisite:** approval, plus decisions on the items marked **[NEEDS YOUR CALL]**.

---

## 0. First: the deleted files were never destroyed

The 16 files showing as deleted in `git status` were **moved to
`recycling/audit_cleanup_2026-07-25/`**, not removed. All 17 archived files are
on disk, and all 16 are also intact in `HEAD` (nothing is staged). The
recycling-bin convention you want already exists and was already followed —
I misread a `git status` `D` flag as destruction. It wasn't.

Restoring any of them is one command; §1 formalises the protocol so this is
never ambiguous again.

---

## 1. Findings that drive this plan

Five substantive discoveries from reading the effect implementations. The first
two are the reason you were right to be suspicious of the dithering.

### 1.1 Seven "error diffusion" shaders are one algorithm wearing seven hats

`floydSteinbergDither.ts`, `atkinsonDither.ts`, `stuckiDither.ts`,
`burkesDither.ts`, `jarvisDither.ts`, `sierraDither.ts` and
`riemersmaDither.ts` are **byte-identical apart from two numbers**: the hash
dot-product constants and an amplitude multiplier.

Every one of them does this:

```glsl
float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
float errNoise = hash(vUv) * amount;
float threshold = 0.5 - errNoise;
gl_FragColor = vec4(vec3(step(threshold, lum)), color.a);
```

That is **random-threshold dithering**. There is no error term, no neighbour
propagation, no scan order. The comments above each hash — `// Weight error
dispersion curve (7/16, 3/16, 5/16, 1/16)`, `// Stucki 42nds dispersion across
12 neighbors` — describe coefficients that appear nowhere in the code. In the
GPU preview all seven algorithms are visually indistinguishable noise.

This is not fixable by improving the shaders. Error diffusion is *inherently
sequential*: pixel N's threshold depends on the residual error from pixel N−1.
A fragment shader has no ordering guarantee and cannot read its own output.
There is no correct fragment-shader implementation of Floyd-Steinberg.

**The Rust side is genuine.** `error_diffusion::apply` implements real kernels
with serpentine scanning and level quantisation. The export has always been
correct — only the preview lies.

> **RESOLVED 2026-07-26.** All seven shaders moved to
> `recycling/dead_dither_shaders_2026-07-26/`; their `rustToWebGL` entries now
> point at `pass_through`. A detail the original finding missed: the shaders
> were already unreachable. All seven were marked `accurate: false`, and
> `stackRequiresCpuPreview()` returns `true` on that flag, so their previews
> already rendered on the Rust CPU path. They were compiled and registered at
> startup, then bypassed — which is why removing them has provably zero output
> impact, demonstrable from the routing flag rather than by comparing frames.

### 1.2 All error diffusion is grayscale-only

`error_diffusion.rs` writes `data[idx] = data[idx+1] = data[idx+2] = v`. Every
one of the seven error-diffusion dithers **destroys colour**, in preview *and*
in export. For a glitch-art tool this is a significant functional gap —
palette-quantised colour error diffusion is the signature look of the genre,
and `references/dither_pie` in this very repo does exactly that.

> **PARTLY RESOLVED 2026-07-26.** `color_mode = "rgb"` now diffuses R/G/B
> independently and keeps colour. Palette-quantised mode remains open pending a
> palette-source decision — see §3.5.
>
> The finding also understated the problem. `error_diffusion::apply` took a
> `params` argument named `_params` and ignored it entirely, while all six
> kernel effects declared `parameters: vec![]` — so the family had no colour,
> no level control and no scan-order control, and `error_diffusion_variants`
> was the only way to reach any of it. That is now fixed at the shared core, so
> all eight call sites gained the controls at once.

### 1.3 Ordered dithering is correct — leave it alone

`bayerDither.ts` uses real Bayer threshold matrices. Ordered and blue-noise
dithering are *legitimately* parallel per-pixel operations, so the shader is
the right implementation and it matches the Rust. This is the model the
error-diffusion effects should be measured against, not rewritten toward.

### 1.4 Composition guides are burned into exports — **RESOLVED 2026-07-26**

> Demoted to a viewport SVG overlay (`ViewportGuides.tsx`). Effect count 98 → 94.
> See §5.1 and `recycling/overlay_guides_demoted_2026-07-26/`.

`overlay.crosshairs`, `overlay.safe_area`, `overlay.rule_of_thirds` and
`overlay.pixel_grid` are registered as **effects in the export stack**. Framing
guides are viewport aids. Rendering them into the delivered file is almost
certainly not what anyone wants, and there is no UI affordance distinguishing
them from creative effects.

### 1.5 Effect inventory is top-heavy in one category

| Category | Count |
|---|---|
| datamoshing | **26** |
| dithering | 19 |
| glitch | 12 |
| analog | 8 |
| pixel_geo | 8 |
| color | 7 |
| artistic / audio_reactive / noise / overlay | 4 each |
| composite | 1 |
| mask_isolate | 1 |
| **Total** | **98** |

Five of the 26 datamoshing entries are `profile_bloom`, `profile_extreme`,
`profile_glitch`, `profile_rainbow`, `profile_smear`.

> **Corrected 2026-07-26.** An earlier draft of this section called them
> "parameter bundles [that] belong in the preset system". That was wrong — see
> §5.2 for why, and note the total above is now **94**, not 98, after §5.1.
> The owner has since confirmed these are commonly-used and stay as they are.

---

## 2. Guardrails — retention and loss prevention

Non-negotiable, applied before any other work starts.

### 2.1 Deletion protocol

No file is ever removed. Deletion means:

1. `git mv` (or copy) the file to `recycling/<YYYY-MM-DD>_<reason>/<original/path>`,
   preserving the directory structure — matching the existing
   `recycling/audit_cleanup_2026-07-25/` layout.
2. Append a line to `recycling/MANIFEST.md`: date, original path, reason,
   what replaced it, and the commit that removed it.
3. `recycling/` stays gitignored, so archives are local safety nets, not repo
   weight. Git history is the durable record; recycling is the fast one.

### 2.2 Checkpoint before each workstream

A named git tag (`pre-<workstream>`) before starting, so any change set can be
reverted as a unit without untangling it from the others.

### 2.3 Separate the two change sets currently interleaved

Right now the working tree contains my audit fixes *and* the cleanup pass,
unstaged and mixed. Before new work: commit them as two distinct commits so
either can be reverted independently. **[NEEDS YOUR CALL]** — I can propose the
split, but you should confirm the cleanup pass was intentional before it is
committed.

### 2.4 Retention for user data

- Autosave currently writes a single `localStorage` key that each save
  overwrites. A corrupt or partial write loses the session with no fallback.
  Move to a small ring of N recent snapshots with atomic replace.
- `saveAutoSave` has a quota-fallback path that only fires when
  `session.mediaDataUrl` is set; otherwise the save is silently dropped. Needs
  a fallback for the general case and a visible indicator when autosave fails.
- No confirmation on window close. Add one, plus a visible "recovered from
  autosave" notice on restore.

### 2.5 Regression gates

Every workstream must leave green: `cargo test`, `cargo clippy -D warnings`,
`cargo fmt --check`, `mosh-verify verify-all` (98/98), `tsc`, `lint`, `vitest`,
`build`, `playwright`. Plus the new gates in §3.4 and §5.5.

---

## 3. Workstream A — make the dithering true dithering

The largest and highest-value piece. Goal: what you see is what you export, and
each named algorithm actually is that algorithm.

### 3.1 Classify every dither by whether a shader *can* be correct

| Class | Effects | Correct implementation |
|---|---|---|
| **Ordered / point** — parallel-safe | bayer, blue_noise, threshold, random_noise, halftone, line_screen, ordered_variants, custom_matrix | Fragment shader (already correct for bayer; verify the rest) |
| **Error diffusion** — inherently sequential | floyd_steinberg, atkinson, stucki, burkes, jarvis_judice_ninke, sierra, riemersma, error_diffusion_variants | **CPU only.** No shader can be correct |
| **Palette / clustering** — needs global analysis | palette, auto_palette, kmeans | CPU only (k-means over the whole frame) |

### 3.2 Retire the seven fraudulent shaders

Move them to `recycling/` per §2.1 and route those effects to the existing
**exact CPU preview** path, which already renders through the real Rust
implementation and is already wired to a toggle in `PreviewViewport`
("EXACT OUTPUT (CPU)").

The mechanism already exists — `stackRequiresCpuPreview()` currently always
returns `false` because every effect has *some* mapping. Change it to return
`true` when the stack contains a CPU-only effect, so the app auto-selects the
correct backend instead of showing a lie with an amber badge.

### 3.3 Keep the CPU preview interactive

CPU error diffusion on a 4K frame is not interactive at full resolution. Use
the progressive scheme already noted as done in `task.md`:

- Render at 25% scale immediately on parameter change (error diffusion is
  O(w·h), so quarter-scale is ~16× faster).
- Re-render at full resolution on debounce settle.
- Cache the intermediate frame buffer between stack entries so editing the last
  effect does not re-run the whole chain — also already listed as implemented;
  needs verification that it survives this change.

**[NEEDS YOUR CALL]** — if quarter-scale preview latency is still unacceptable
on your hardware, the fallback is a Rayon-parallel *block-wise* error diffusion
(independent tiles with overlap bleed). It is faster but not bit-identical to
the serial result, which reintroduces preview/export divergence. My
recommendation is to measure first and only take this if measurement demands it.

### 3.4 Prove the algorithms are actually distinct

The current tests confirm each dither runs and modifies pixels. None confirm
that Floyd-Steinberg differs from Atkinson. Add:

- **Distinctness test** — every pair of dither algorithms must produce
  different output on the same input. This is the test that would have caught
  the seven-identical-shaders problem.
- **Kernel conformance test** — feed a single mid-gray pixel on a white field
  and assert the error lands in the neighbours with the documented weights
  (7/16 right, 3/16 down-left, 5/16 down, 1/16 down-right for Floyd-Steinberg).
- **Serpentine test** — assert odd rows scan right-to-left.
- **Determinism test** — same input twice, identical output.

### 3.5 Add colour error diffusion — **DONE 2026-07-26 (all three modes)**

Extend `error_diffusion::apply` to diffuse per-channel against a palette rather
than collapsing to luminance. Scope options:

- **(a) Per-channel RGB** — cheapest, keeps colour, gives the classic 8/16-colour
  look. Small change to the existing function.
- **(b) Palette-quantised** — diffuse toward the nearest entry in a chosen
  palette (the app already has `palettePresets.ts` and historical palettes).
  This is what `dither_pie` does and what most users of this genre expect.
- **(c) Both, with a mode parameter** — grayscale / RGB / palette.

**Delivered:** `error_diffusion::apply` is now parameter-driven, exposing
`levels` (2–16), `color_mode` (`grayscale` | `rgb`) and `serpentine` through a
shared `error_diffusion::param_defs()` used by all six kernel effects plus
`error_diffusion_variants`. Previously the function took a `_params` argument
and discarded it, and every caller hardcoded `levels = 2, serpentine = true` —
so the whole family was 1-bit monochrome with no user control.

**Deviation from the recommendation, deliberately:** the plan proposed
defaulting to palette. The default is **grayscale**. Defaulting to anything else
would silently re-render every saved project and the shipped
`dithering.floyd_steinberg` preset in `defaultPresets.ts`, none of which store
parameter values. `effects::dithering::output_stability_tests` pins the default
output of all eight effects by hash to keep it that way; a future change to the
default is a decision that test forces someone to make explicitly.

**(b) palette-quantised — delivered 2026-07-26.** `color_mode` now offers
grayscale / rgb / palette, with `palette_source` selecting between a k-means
palette derived from the frame (default) and one of the bundled historical
palettes via `palette`. `palette_size` (2–64) controls the k-means case.

k-means is the default because a fixed palette forces the user to know which one
suits an image before they can see anything good, whereas a derived one always
lands somewhere reasonable — the same choice `references/dither_pie` makes.
Palette colours are shared with `color::historical_palettes` through new
`palette_names()` / `palette_by_name()` accessors, so the two places a palette is
offered cannot drift apart.

Palette mode is genuinely a different operation from RGB mode, not a
reparameterisation: RGB quantises each channel on its own grid, so reachable
output is a cube; palette mode quantises the colour as a whole and carries the
full three-dimensional error forward. A test asserts output contains *only*
palette colours, which RGB mode cannot satisfy.

An unresolvable palette (fewer distinct colours than requested) degrades to RGB
rather than failing — a dither against an empty palette has no meaning.

**This work surfaced a bug that mattered more than the feature.**
`dithering::kmeans` seeded k-means++ with `rand::thread_rng()`, so the derived
palette differed on every call. Eight other effects had the same defect. See
§3.6.

> **Note on scope:** `dithering.riemersma` was deliberately excluded. It does not
> use `error_diffusion::apply` — it has its own Hilbert-curve traversal with a
> hardcoded binary threshold (`corrected > 127.0`) — so giving it `levels` means
> changing its quantiser and therefore its output at defaults. `serpentine` is
> meaningless for curve-order traversal. It keeps zero parameters, and a test
> asserts that, so nobody advertises controls it cannot honour.

### 3.6 Effect output was not reproducible — **DONE 2026-07-26**

Nine effects drew randomness from `rand::thread_rng()`, which is seeded from the
OS: `dithering::kmeans`, `datamoshing::iframe_removal`, two in
`datamoshing::mv_effects`, three in `datamoshing::profiles`,
`glitch::png_chunk`, and `audio_reactive`.

For a passive render tool this is a correctness bug, not a stylistic choice:

- The preview and the export run the effect separately, so they disagree. The
  user grades against something the exported file will never contain — which
  undercuts the entire preview-accuracy goal this plan is built around.
- Re-exporting the same project produces a different file, so a render cannot be
  reproduced or verified.
- Video output flickers, because every frame re-rolls instead of continuing a
  stable pattern.

The fix keeps the randomness and makes it reproducible. `effects::rng` derives a
seed from the frame content plus an optional user-facing `seed` parameter, so the
same image and seed always give the same result, a different image gives a
different pattern with no user action, and the user can dial the seed to explore
variations and have the chosen one survive an export.

`effects::conformance_tests::every_effect_is_deterministic` runs all 94 effects
twice and requires identical bytes, so this cannot regress silently.

**One deliberate exception.** `sam3_engine.rs` keeps `thread_rng()` for its
32-byte auth handshake token. That is a CSPRNG use where a predictable value
would be a security defect; the call site is commented so a future sweep does not
"fix" it.

---

## 4. Workstream B — shader quality audit

For every shader that stays, decide: exact, honestly-approximate, or replaceable.

### 4.1 Systematic pass

For each of the ~63 remaining shaders, compare the GLSL against the Rust
implementation and classify:

- **Exact** — same algorithm, same units. Mark `accurate: true`. Add a
  numerical parity test (render both, assert per-pixel delta under threshold).
- **Approximate but useful** — different algorithm, right *look*, instant. Keep,
  keep `accurate: false`, and document the divergence in a comment at the
  mapping site so the next person does not have to reverse-engineer it.
- **Approximate and misleading** — looks nothing like the export. Retire the
  shader and route to CPU preview, as with the dithers.

### 4.2 Known candidates for upgrade

- **`analog.tv_glitch`** — Rust models NTSC properly (subcarrier amplitude,
  pre-emphasis, chroma phase noise, chroma loss, scanlines). The shader has a
  single `amount`. Either build a real NTSC shader with those seven uniforms,
  or route to CPU. Currently the preview is a caricature.
- **`analog.vhs`** — four Rust parameters (`tracking_error`, `scan_curve`,
  `slice_size`, `glitch_probability`) have no uniform. Add them.
- **`color.brightness_contrast`** — `colorGrade` has no gamma uniform. Trivial
  to add; would make the effect fully exact.
- **`color.rgb_shift`** — shader models one magnitude + angle; Rust has three
  independent channel offsets. Rewrite the shader to take `vec3` offsets.
- **`pixel_geo.mirror_slices`** — Rust exposes `slice_height`; the shader
  exposes a discrete `mode`. They are unrelated. One of them is wrong.
- **14 effects preview as `pass_through`** — the temporal datamoshing ones are
  defensible (no single-frame representation exists). `composite.overlay` is
  not: compositing a second image is entirely implementable in WebGL.

### 4.3 Parity harness

Extend the existing `tools/` scripts into a repeatable job: render a fixed test
image through both backends for every effect, emit per-effect PSNR/SSIM, and
publish a table. This makes "is the preview accurate?" a measured number rather
than a judgement call, and it makes future regressions obvious.

---

## 5. Workstream C — scope review: keep, fix, demote, cut

Recommendations with rationale. Everything marked **cut** or **demote** is a
product decision and needs your sign-off.

### 5.1 Overlay guides — **DONE 2026-07-26**

Move `crosshairs`, `safe_area`, `rule_of_thirds`, `pixel_grid` from the effect
registry into a **viewport overlay layer** that draws on top of the preview and
is never exported. This is what they are for. If you *want* the option to burn
guides in, that becomes an explicit export checkbox, not four entries in the
same list as Datamosh and VHS.

Net: −4 effects from the browser, clearer mental model, no capability lost.

**Delivered.** Guides now live in `viewportGuides` store state and are drawn by
`src/components/ViewportGuides.tsx` as an SVG overlay, with a four-button toggle
group in the viewport header. There is no code path from that component to the
render pipeline, so the "never exported" property is structural rather than a
flag. Effect count 98 → 94; `mosh-verify` reports 94/94.

One thing the original plan did not account for: **an unknown effect ID is a
hard error in Rust** — `Effect '...' not found` aborts the whole render rather
than skipping the entry. Presets and auto-saved sessions written while the
guides were effects still contain `overlay.*` entries, so removing them from the
registry without a migration would have broken preview and export for any
affected saved work. `src/utils/migrateOverlayGuides.ts` strips those entries on
load and switches on the matching guide; it runs in both restore paths
(`usePresets.loadPreset` and `useProjectSession.restoreSession`). Only *enabled*
entries turn their guide on, since a disabled overlay was not being drawn.

### 5.2 Datamoshing `profile_*` — **RETRACTED. Keep them as effects.**

> **Correction (2026-07-26).** The original recommendation here was wrong. I
> called these "parameter bundles" without reading the implementation.

`profiles.rs` is **875 lines with five distinct `process_frame` and five
distinct `process_video` implementations**. They are not parameter bundles —
they are hand-written multi-phase video pipelines. `GlitchProfile::process_video`
alone does three ordered phases: drop I-frames at an interval, shuffle the
remaining frames in chunks of 4 with a seeded permutation, then run a per-frame
glitch over the reordered result.

A preset is a flat `{ effectId, params }` record. It cannot express "drop, then
shuffle, then glitch, in that order, with state carried between phases."
Demoting these would mean either losing the behaviour or building a
pipeline-composition system to replace something that already works — cost with
no benefit, and a migration risk for every saved project that uses them.

**Decision: keep all five as registry effects.** The only defensible change is
cosmetic: the `Profile: ` name prefix already signals that they are
opinionated combinations rather than primitives, which is accurate.

Net effect count change: 0.

### 5.3 Masking — **consolidate, do not cut**

Six components (`MaskPanel` 19 KB, `MaskListPanel`, `MaskSelector`,
`ManualMaskEditor`, `ManualMaskOverlay`, plus `FrameTimeline`) and a
`mask_isolate` effect. Masking is a genuinely valuable differentiator — the
problem is that responsibility is smeared across six files with overlapping
concerns, not that the feature is bloat.

Plan: audit for actual duplication, consolidate selection UI into one component,
keep editing and overlay separate (they legitimately differ). No capability
removed. Also resolve `mask_isolate`'s missing category prefix with a migration.

### 5.4 `VerificationPanel` — **[NEEDS YOUR CALL]**

This runs the effect self-test suite and is currently one of 12 user-facing
panels. It is a developer tool. Options: (a) hide behind a dev flag,
(b) keep as an "advanced/diagnostics" panel, (c) leave as-is. I lean (a) — a
panel that runs a test harness is confusing in a creative tool — but it is
genuinely useful for field-diagnosing a broken install, which argues for (b).

### 5.5 Anti-bloat gate

Add a test asserting that the number of registered effects matches an explicit
allowlist. New effects then require a deliberate line change, and accidental
duplicates surface in review.

### 5.6 Not bloat — keep as-is

`ProxyPanel` (real workflow need for large media), `TrackPanel`, `AudioPanel`,
`CommandPalette`, `KeyboardShortcutsEditor`, `DockSystem`. These earn their
place.

### 5.7 Repository weight

`sam3_repo/` at the repo root is **133 MB and completely unreferenced** —
`resolve_sam3_repo()` only reads `packages/python-backend/sam3_repo` (74 MB).
The copies have drifted. Recommend archiving the root copy per §2.1.

---

## 6. Workstream D — UI/UX responsiveness and accessibility

- **Per-panel error boundaries.** Ten lazy-loaded panels sit behind one root
  boundary. A chunk that fails to load — the normal outcome when the app is
  open across an update — blanks the whole app instead of one panel. Add a
  boundary with retry per panel.
- **Preview backend must be legible.** With Workstream A the app switches
  between GPU and CPU preview automatically. The badge needs to say which is
  active, why, and what it costs — not just "APPROXIMATE".
- **Focus and keyboard.** `index.css` has 3 focus rules total; 16 of 48
  component files carry any `aria-*`/`role`. With `decorations: false` and
  custom window controls, this needs a real pass: visible focus rings on all
  interactives, correct dialog semantics, logical tab order.
- **Design tokens.** 52 hardcoded hex colours bypass the theme system, so light
  mode is wrong in those components. Sweep to CSS variables.
- **Logging consistency.** 29 raw `console.*` calls bypass `src/utils/logger.ts`;
  240 `println!`/`eprintln!` in production Rust paths, some printing filesystem
  paths. Route through the logger, gate debug output on a flag.

---

## 7. Workstream E — the two remaining release blockers

Unchanged from the audit; both need artifacts I cannot produce.

- **SAM3 sidecar + weights.** Build the sidecar, add `bin/sam3-bridge` to
  `externalBin`, and decide checkpoint delivery — my recommendation is a
  first-run download with a progress UI (the missing item still open in
  `task.md`) rather than bundling multi-GB weights into the installer.
- **Code signing.** Windows certificate + macOS Developer ID and notarization.
  Until then macOS builds will not launch at all.

---

## 8. Sequencing

Ordered so that each stage is verifiable before the next begins.

| Stage | Contents | Gate |
|---|---|---|
| **0** | Guardrails §2: recycling manifest, checkpoint tags, split the interleaved commits | Clean `git status`, full suite green |
| **1** | Dither classification + distinctness/kernel/serpentine tests — **written against current code, expected to fail** | Tests fail, proving they detect the bug |
| **2** | Retire the 7 shaders, route to CPU preview, auto-select backend | Stage 1 tests pass; suite green |
| **3** | Progressive CPU preview + measure latency | Interactive on your hardware |
| **4** | Colour error diffusion (pending §3.5 decision) | Visual review + tests |
| **5** | Shader parity harness + §4.2 upgrades | PSNR table published |
| **6** | Scope changes §5 (pending sign-off) + migrations | Old project files still load |
| **7** | UI/UX and accessibility §6 | Manual keyboard pass |
| **8** | Blockers §7 | Signed installer launches clean |

Stages 1–3 are the core of what you asked for and are independent of every
product decision. They can start as soon as Stage 0 is done.

---

## 9. Decisions needed before I start

1. **§2.3** — was the cleanup pass that moved 16 files to recycling intentional?
   Commit it, or restore some of it?
2. **§3.5** — colour error diffusion: per-channel RGB, palette-quantised, or
   both with a mode selector? (I recommend both.)
3. **§5.1** — move the four overlay guides out of the export stack?
4. **§5.2** — demote the five datamoshing profiles to presets? (Needs a
   migration for existing projects.)
5. **§5.4** — what happens to `VerificationPanel`?
6. **Scope of this pass** — all eight stages, or stop after Stage 4 (dithering
   correct and in colour) and re-evaluate?
