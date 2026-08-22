# Session Handoff

Living pass-down note. Update it at the end of every session and commit it.
It lives in `docs/` on purpose: the previous handoff sat in `outputs/`, which is
gitignored, so it never travelled with the branch.

**Last updated:** 2026-08-22 · branch `Cosmic/upbeat-golick-68081b` · PR #49

---

## Read this first

- **CI is meaningless here.** Every check on PR #49 fails with "The job was not
  started because recent account payments have failed." This is a free-plan
  account with billing deliberately off. Red CI says nothing about the code.
  **Local gates (`npm run gate`) are the only real signal, and they cover
  Windows only.** Do not suggest enabling billing.
- **Never delete anything.** Removals go to `recycling/<YYYY-MM-DD>_<reason>/`
  with a row in `recycling/MANIFEST.md`. (`recycling/` is gitignored — local by
  design.)
- Feature branches only; conventional commits.

---

## State: builds and runs; not yet distributable

`npm run gate` passes 8/8 and `npm run tauri:build:no-sam3` exits 0
(both verified 2026-08-22), producing NSIS 156 MB + MSI 185 MB.

**What is self-contained.** The core app is: all four FFmpeg-family sidecars
(`ffmpeg`, `ffprobe`, `ffgac`, `ffedit`), the 35 LUTs, the Python backend and the
icons are all bundled. Effects, dithering, glitch, LUTs and export need nothing
from the internet.

**What is not.**

1. *SAM3 needs two large pieces neither of which ships.* `npm run tauri:build`
   REFUSES in a clean worktree because no `sam3-bridge-*` binary exists in
   `src-tauri/bin/` -- deliberate, so a broken sidecar cannot ship silently. Build
   it with `setup:sam3-env` then `build:sam3-sidecar` (~2.9 GB, needs the CUDA
   torch env). Separately, `models/` is empty: the 3.21 GB checkpoint downloads on
   first use from a GATED HuggingFace repo, so an end user needs their own HF
   account and access approval. Not a shippable first-run for strangers.
   NOTE: `src-tauri/target/release/sam3-bridge.exe` is a STALE 297 MB CPU-only
   build from 2026-08-21 that cannot load the model. It is not bundled. Do not
   copy it into `src-tauri/bin/`.
2. *A fresh clone cannot build.* The four FFmpeg binaries are gitignored and
   there is no script that fetches them -- `verify-external-bins.mjs` only
   checks. `packages/python-backend/sam3_repo` is likewise gitignored and needs a
   PATCHED clone (`weights_only=False`); see `docs/SAM3_SETUP.md`.
3. *Not code-signed.* `bundle.windows.certificateThumbprint` is null, so
   SmartScreen warns on every install.
4. *The updater is configured but dead.* A pubkey and a GitHub releases endpoint
   are set, but with no `TAURI_SIGNING_PRIVATE_KEY` the overlay disables updater
   artifacts -- and since Actions never runs on this account by choice, nothing
   will ever publish `latest.json`. Shipping a live updater endpoint that never
   serves anything is worse than shipping none; decide before any public release.

Version is still `0.1.0`.

---

## Closed this session

**The black preview had two independent causes. Both are fixed.**

*Cause 1 — LUTs stacked instead of swapping.* `addLUTEffect` appended a new
entry on every click, while the tile said "Apply <name>" and the status bar said
"LUT applied: <name>" in the singular. Each LUT grades the output of the one
before it, so browsing the library compounded them: on the test image (mean luma
124.8) four clicks on Gotham gave **2.5** — a black screen. Clicking a library
tile now swaps the current look in place, keeping any strength the user has
dialled in. Deliberate stacking is still available by duplicating the entry in
the effect stack. Measured first: no *single* LUT blacks out — the darkest of
the 35 lands at 0.65x source, and all 35 are correctly 512x512 — so lowering the
default strength would have weakened every look while leaving the real cause in
place.

*Cause 2 — leaked WebGL contexts.* `WebGLContext.destroy()` freed GL
objects but never released the context; browsers cap live contexts at 16 and
force-lose the oldest, so every preview panel remount leaked one until the
browser killed the visible preview's context. Fixed with `loseContext()` in
`destroy()`, after listener removal. Proven with a SwiftShader Chromium harness
(24 cycles: 16 live before → 0 after). Full write-up and the four earlier wrong
diagnoses: [`docs/devlogs/2026-08-22-webgl-context-leak.md`](devlogs/2026-08-22-webgl-context-leak.md).
Regression cover: `tests/e2e/webgl-context-lifecycle.spec.ts`.

**Effect default-strength audit (99 effects).** All 99 rendered at their
defaults across four reference images (studio portrait, landscape, mountain,
repo test frame) with `mosh-verify render-all`, then ranked by mean per-channel
delta, luminance correlation and share of pixels changed. Agreed bar: a default
must read unmistakably as the effect; destructive effects should leave the
subject recognisable. One outright defect found and fixed --
`dithering.line_screen` inked by brightness instead of darkness, rendering every
image as its own tonal negative (correlation -0.60, now +0.56); see
[`docs/devlogs/2026-08-22-effect-default-audit.md`](devlogs/2026-08-22-effect-default-audit.md).
Contact sheet artifact: https://claude.ai/code/artifact/4479ae94-69b9-410f-af89-0f32b4bbc241

Four proposals are open and deliberately NOT applied (see "Open" below).

Earlier in the session: video export was totally broken (temp file lost the
destination extension) and now works; FFmpeg mid-write failures report FFmpeg's
own message instead of `os error 109`; the empty command palette; silent gate
failures and stale-binary false greens; non-deterministic LUT thumbnails; and
the whole SAM3 packaging chain — SAM3 is verified working end-to-end over its
real protocol (handshake → `auth_ok`, `load_image` → 1600x1216,
`text_prompt` → 3 hits, top score 0.924).

---

## Open

1. **Confirm the black preview is gone in a real build.** Both fixes are proven
   at the unit level but neither has been exercised by a human in the installed
   app. Two recipes, one per cause: (a) click through a dozen LUT tiles and check
   the image still reads — the effect stack should hold exactly one LUT entry;
   (b) move/dock/undock the Preview panel a dozen or more times and check the
   preview is still live. This is the one item that wants your hands, not mine.
2. **Consider marking the active LUT tile.** With swap semantics there is exactly
   one live look, but nothing in the gallery shows which. Not built — it is a
   design call, not a defect.
3. **Effect default retunes: reviewed and CLOSED, nothing changed.** The owner's
   rule is that an effect operating as designed is left alone; only output that
   is destroyed beyond being usable art gets touched. Under that rule all four
   proposals were declined, and two speculative edits were reverted:
   - `datamoshing.shuffle` -- `chunk_size` cannot fix it. `process_frame` does a
     *global* shuffle (`chunks.swap(i, j)` across the whole buffer), so a chunk
     from row 10 can land at row 500 at any chunk size. Raising 5 -> 20 was tried
     and still produced noise. Making it recognisable means changing the
     algorithm to a local/windowed shuffle -- a redesign, not a default. Left
     alone: a shuffle that shuffles is working.
   - `glitch.crc_mismatch`, `glitch.macroblock_glitch`, `analog.ghosting`: quiet
     but correct. Being faint is not breakage.
   - The 14 dithering effects and `dithering.custom_matrix` (`bayer2`): left
     alone. A 2x2 Bayer matrix is coarse *by nature*; that is the effect working.
     A `bayer2 -> bayer4` edit was made and reverted -- judging "is this usable
     art" from a dithered frame is the owner's call, not an agent's, and
     blockiness was being misread as breakage.

   The lesson: of 99 effects, exactly one had a defect that survives review, and
   it was the one identified by a *measurement* (negative correlation) rather
   than by an opinion about how the output looked.
4. **Mask controls** (mode selector, invert, clear, brush) are untested — they
   need a live SAM3 mask to drive them.
5. **`composite.overlay`** defaults to identity until an overlay is selected.
   Correct behaviour, but it lands the user on a control that appears to do
   nothing. Worth a placeholder or a disabled state.

---

## Testing notes that cost real time

- **Headless Chromium has no WebGL.** Renderer bugs are invisible to E2E unless
  Chromium is launched with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- The Tauri mock's `convertFileSrc` returns a `/mock-file/<path>` URL that 404s.
  Route it to a real file to give the WebGL chain genuine pixels:
  `page.route("**/mock-file/**", r => r.fulfill({ path: realImage }))`.
- Do **not** call `readPixels`/`drawImage` on the app's live GL context from a
  test — under SwiftShader that crashes the renderer and looks like an app crash.
- Flexlayout panel tabs are matched by `.flexlayout__tab_button`, and by
  `getByRole("tab")` only in some layouts — prefer the class.
- Never pipe a command whose exit code matters through `tail`/`head`; you get
  the pipe's status, not the command's.
- A "gate failure" with a burst of unrelated errors is usually resource
  contention from a concurrent PyInstaller/Rust build, not a regression. Re-run
  it alone before believing it.
