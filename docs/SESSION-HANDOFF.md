# Session Handoff

Living pass-down note. Update it at the end of every session and commit it.
It lives in `docs/` on purpose: the previous handoff sat in `outputs/`, which is
gitignored, so it never travelled with the branch.

**Last updated:** 2026-09-08 · branch `Cosmic/upbeat-golick-68081b` · PR #49

---

## Read this first

- **A STALE INSTALL WILL WASTE YOUR SESSION. This has now cost two of them.**
  `%LOCALAPPDATA%\MoshDither Studio\` is a *separate copy* of the app; editing
  the repo and running `tauri:dev` does NOT change it. Symptoms reported as app
  bugs -- "panels won't move", "preview is broken", "still black" -- were an
  install from the day before, missing every fix made since. Before believing any
  desktop-app bug report, check the dates:

      Get-Item "$env:LOCALAPPDATA\MoshDither Studio\moshdither-studio.exe" | Select LastWriteTime
      git log -1 --format=%cd

  If the exe is older than the fix, rebuild and reinstall before debugging
  anything. "Works in the browser but not the app" is this, until proven
  otherwise -- it is not a WebView2 quirk.
  A companion trap: the NSIS uninstaller does NOT remove `sam3-bridge.exe`, so a
  stale sidecar survives an uninstall/reinstall cycle. Check for it by hand.


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

## State: builds, runs, and is ready to publish

`npm run gate` passes all 9 gates and `npm run tauri:build:no-sam3` exits 0,
producing NSIS ~156 MB + MSI ~185 MB. Version is **0.2.0**.

**SAM3 now works in an installed app** (as of 2026-09-08). It is a
*downloadable add-on* rather than part of the installer, because the sidecar is
2.9 GB and no Windows installer format takes a file over 2 GiB -- WiX answers
`LGHT0263`, NSIS fails to mmap it. Both measured. See
`src-tauri/src/sam3_addon.rs`.

To publish the add-on: `npm run build:sam3-sidecar`, then
`node scripts/publish-sam3-addon.mjs --upload`. The script splits both assets
into GitHub-sized parts, hashes them, writes the manifest and uploads via `gh`.
**The sidecar's SHA-256 is compiled into the app** (`EXPECTED_SIDECAR_SHA256`);
change the sidecar and you must update that constant and ship an app release,
by design -- a remote manifest must never decide which executable runs.

**Datamoshing no longer needs system Python** (as of 2026-09-08). It used to
shell out to `mosh_cli.py`, which needs an interpreter AND numpy; the installer
shipped neither, so `find_python()` fell back to whatever `python.exe` was on
PATH. That exists on a developer machine and on almost no user's, so the app's
signature feature was developer-only and nobody noticed. There is now a 24 MB
`mosh-cli` sidecar (`npm run build:mosh-sidecar`) in `externalBin`, verified end
to end against a real clip with no system Python involved.

**What is self-contained.** The core app is: all five sidecars (`ffmpeg`,
`ffprobe`, `ffgac`, `ffedit`, `mosh-cli`), the 35 LUTs, the Python backend and
the icons are all bundled. Effects, dithering, glitch, datamoshing, LUTs and
export need nothing from the internet.

## Session 2026-09-09 (later): release-readiness audit, and the export crash found

Asked directly: *"Is this production ready? Is this a finished product?"* A
seven-dimension read-only audit ran with adversarial verification (113 agents;
59 completed before the run hit usage credits, so 52 of the serious findings
carry a verdict and the rest carry evidence only). **106 distinct findings**,
11 of them blockers. Raw data: `evals/reports/audit-2026-09-09.md`.

**The export crash is explained and fixed.** `export_video` duplicates a still
image's one decoded frame `duration x fps` times to animate it -- and the
memory plan never saw it, because `probe_frame_count` reports 0 for a still, so
`plan_decode` planned for ONE frame, found it comfortably inside the budget and
chose native resolution. A 4032x3024 phone photo is 48.8 MB per frame; the
default 10 s at 30 fps is 300 of them = **14.6 GB**, and the per-effect rayon
collect doubles it. A failed Rust allocation ABORTS rather than panicking,
which is exactly why the log stopped after "Decoded 1 frames" with no panic
recorded. Fixed on both sides: `plan_decode_for_frames` plans against the count
the still becomes, and the clone itself is capped against half the budget
whatever the plan said. Pinned by `still_memory_plan_tests`.

**Also fixed in this batch (all verified in the source first):**

| What | Was |
|---|---|
| **Exports of non-16:9 footage were distorted** | The encoder ran a bare `scale=W:H`, which ignores source aspect. A 640x1146 vertical clip exported at "1080p HD" was squashed **3.2x horizontally** -- measured, not inferred. Now `force_original_aspect_ratio=decrease` + `pad`, verified against real FFmpeg |
| Long clips silently truncated / downscaled | The backend emitted `warning` and `downscaled_to` on `export-progress`; the UI destructured `{stage, progress, message}` and dropped both. Now surfaced, and kept on screen in a dismissible banner rather than a status line that scrolls away |
| **Open Project wiped the stack before validating** | `clearStack()` ran, then a `setTimeout` rebuilt with no shape check and no try/catch, and "Project loaded" was reported regardless. A file containing `{}` destroyed the open stack and threw a tick later. Now validated first, rebuilt in memory, applied as ONE undoable `replaceStack` |
| **"No mask" effects came out masked in exports** | Rust falls back to the global mask for any effect without its own; the Export panel was the ONLY caller that passed `activeMask` there (preview, Save Image and the batch queue all pass null), so an effect deliberately set to "No mask" was masked in the file and nowhere else |
| Datamosh modes had no knobs | `applyFfglitch(..., {}, ...)` at both call sites. `mosh_cli.py` had been parsing 30+ parameters the whole time. Now one table (`src/lib/ffglitchModes.ts`) drives controls, defaults, clamping and presets |
| Datamosh **preview** was broken for every mode | It passed `"params": null`, and `mosh_cli.py`'s first `params.get()` raised `'NoneType' object has no attribute 'get'`. Proven by running the sidecar directly; guarded now on both sides |
| Keyframe easing unreachable | Right-click a diamond: five easings and Delete |
| Mask undo covered only Clear/Invert | A store-level mask history; brush and eraser strokes, shapes, Clear and Invert all undo, capped at 30 |
| "Lock Aspect Ratio" wrote to the store and nothing read it | Wired to the export box (`src/utils/exportDimensions.ts`); works correctly *because* the encoder now letterboxes |
| "Use Proxy" checkbox wired to nothing | Recycled. It could not have worked: the video preview REQUIRES a proxy, so there was nothing to turn off |
| Tracks panel created layers nothing rendered | Recycled; store state kept for project-file compatibility |
| **The app-smoke gate's panic detection was dead code** | `$before` and `$log` were pipelines assigned to nothing, so `$log` was always null and the PANIC scan could never run -- the gate only checked "did it stay alive 20s". It also never rebuilt a stale exe, so it smoke-tested whatever binary was on disk. Both fixed |

**Method note for next time:** `cargo check` passes code that `cargo clippy -D
warnings` rejects. Run clippy before claiming a batch is clean; a gate run was
burned on a redundant cast.

## Session 2026-09-09 (late): UX fallacy sweep -- what changed and what is left

Driven by the owner's framing: "if there's a better, user-friendly,
industry-standard way of doing something, let's do it that way." A 5-dimension
audit ran with adversarial verification; every load-bearing claim was then
re-verified by hand before acting, because several earlier "findings" had been
my own tooling bugs.

**Fixed (all gated 10/10, committed):**

| What | Was |
|---|---|
| Every video treated as **10 seconds** | `getMediaMetadata` ran on open but only fed the metadata DISPLAY; `duration` sat at the store default, so playback stopped at 0:10 and an export with no out-point trimmed to 10s. Now set in `refreshPreview` |
| Console windows on datamosh export | Rust spawns were guarded; `mosh_cli.py` / `basic_modes.py` spawn ffmpeg THEMSELVES. Both now pass `CREATE_NO_WINDOW`; `scripts/check-no-console-windows.mjs` runs in prebuild and catches both languages |
| Preview mode choice | Gone. WebGL while interacting, exact CPU frame 450 ms after idle. Canvas now stays MOUNTED (the ternary unmounted it and a canvas gets one WebGL context for life -- black screen on play) |
| FFglitch modes invisible until export | `preview_ffglitch` moshes a 2s segment (1-2s per mode, cached); section labelled "Bitstream datamosh -- applied after your effects" |
| Mosh dropdown: 13 of 33, two of them broken | 25 verified-working modes, grouped |
| `ffglitchMode` + 7 export settings were component-local `useState` | In the store; `ffglitchMode` rides in presets (optional field, old libraries still load) |
| Recorded keyboard shortcuts did nothing | Editor writes palette ids (`undo`), handler switched on `edit:undo`; handler now falls through to the command registry |
| Save/Open Project only as Ctrl+S/O | In the File menu. `openProject` also never LOADED the media -- `mediaReloadToken` in the store now lets any path ask AppLayout to |
| Mask Clear/Invert destroyed work with no way back | One-step Undo |
| Proxy panel's output went nowhere | `proxyPath` had no readers; panel now feeds `proxyUrl` |
| Gate flaked on this machine | vitest pool capped at half the cores; app-smoke gate now sets `$LASTEXITCODE` explicitly instead of inheriting the previous gate's |

| **Timeline is a transport strip now**, not a dock panel | Pinned under the workspace; preview owns the centre column; keyframe diamonds (click = jump, right-click = delete), draggable in/out handles, dimmed trim. `LAYOUT_VERSION` 3 discards old saved layouts |
| **Timeline** (asked "what is it for, it seems clunky") | Stills played at **2x** -- three loops advanced `currentTime`; now `usePlaybackEngine` is the only clock, at the clip's real fps (`mediaFps` from ffprobe). In/out snapped to whole seconds; palette "Set in/out point" set 0/300 and "Play / pause" toggled audio; scrub drag died off the 16 px bar; `<video>` ignored in/out while playing and was offset by the in point; speed selector never reached the `<video>`; clip-length box overwrote a video's probed duration. All fixed; `docs/PRODUCT-REVIEW.md` §3 has the table and the redesign recommendation |

**Still open -- verified real, not yet fixed:**

- **7 of 8 tomato modes** (`bloom overlap jiggle void reverse invert random`)
  produce 0 bytes on real footage: the corrupted AVI has no decodable frame.
  Works on the 480x270 fixture, fails on every real clip at every size tried,
  so content-dependent. Inside vendored Tomato Automosh. They now fail with a
  sentence instead of a traceback, and are removed from the dropdown.
- **FFglitch mode parameters** are hardcoded `{}` at the call site; no mode's
  knobs are reachable. `combine`/`motion_transfer` need a second input with
  no UI to supply it.
- **Tracks panel** creates entries nothing renders or exports. Left in place;
  removing it from the rail is a product call.
- **Export crash (0xc0000374 heap corruption)** -- still not reproduced. NEW
  LEAD: this machine sits at 107 GB of a 110 GB Windows COMMIT limit
  (ComfyUI alone 12 GB) with 36 GB physical free; a gate run hit `rust_oom`.
  Windows refuses allocations at the commit limit regardless of free RAM, and
  export allocates hundreds of MB at once. Test: export with ComfyUI closed.
  Fix: raise the pagefile (16 GB on a 94 GB box).
- Undo still does not cover mask BRUSH STROKES, only Clear/Invert.
- Keyframe easing is always linear; no UI changes it. (Keyframes themselves
  are now visible and editable on the transport strip.)

## Verification: what has actually been exercised (2026-09-09)

Measured with `mosh-verify`, not read. Re-run any of these before a release.

| What | Result |
|---|---|
| `verify-all` | 99/99 effects, 0 failures |
| `render-all` on a photographic image | 99/99 render, 0 errors |
| Default calibration (measured) | 0 blacked out, 0 blown out, 0 flat |
| `animate-all` (still photo -> video) | 98/99 animate; `frame_hold` static by design |
| `audio-render` with a synthetic 120 BPM bake | 8/8 render; all 8 vary over time, 5 spike on beats |
| `render-luts` | 35/35, none blowing out |
| `test-all` | 49/49 |
| Export formats | 13/13 encoded and verified on disk (Rust test) |
| Video containers in | 8/8 decode (Rust test) |
| Still formats in | 11/11 decode; avif and dds REMOVED, no decoder exists |

**Use a photographic test image, not `tests/fixtures/test-image.png`.** That
fixture is a saturated colour chart -- 46% of its channels are pinned at 255 --
which makes `artistic.solarize` look like it blacks the frame out when it is
behaving correctly. It also hid the bloom white-out, because the chart's
aggregate is darker. The generator for a photographic image is in the session
scratchpad; regenerate one rather than trusting the chart for calibration work.

Still untested, honestly: individual parameter VALUES (only defaults were
swept), SAM3 segmentation quality (the add-on is not published yet), and
anything requiring real-world footage.

## Release checklist — what is left, and it is all human

Nothing below is blocked on code. Each is an action on the maintainer's own
accounts or hardware, which is why it is not done.

1. **Push the branch and open/merge the PR.** Outward-facing; never done
   without an explicit ask.
2. **Publish the SAM3 add-on** (~6 GB, one time):
   `npm run build:sam3-sidecar` then `node scripts/publish-sam3-addon.mjs --upload`.
   Then confirm `EXPECTED_SIDECAR_SHA256` in `src-tauri/src/sam3_addon.rs`
   matches what the script prints, and ship an app release if it changed.
3. **GPL corresponding source.** Attach the two tarballs named in
   `THIRD-PARTY-NOTICES.md` to the same GitHub release as the installer. This is
   a real obligation, not a nicety.
4. **Code signing.** Needs a purchased Authenticode certificate. Until then
   SmartScreen warns on first run; README says so plainly rather than hiding it.
5. **Optional: re-enable the updater.** Needs a published `latest.json` and a
   `TAURI_SIGNING_PRIVATE_KEY`. Restore the `plugins.updater` block in
   `tauri.conf.json` and the menu entry in `Toolbar.tsx` together.

Known, accepted: `src-tauri/Cargo.lock` is gitignored, so release builds are not
byte-reproducible. Pre-existing choice, left alone.

**What is not.**

1. *The SAM3 add-on has to be published once.* The mechanism is done and
   tested; the ~6 GB upload is a human step (see above). Until it is uploaded,
   the in-app installer reports that the asset list is unreachable and tells the
   user to build the sidecar locally instead.
   NOTE: `src-tauri/target/release/sam3-bridge.exe` is a STALE 297 MB CPU-only
   build from 2026-08-21 that cannot load the model. It is not bundled. Do not
   copy it into `src-tauri/bin/`.
2. *A fresh clone cannot build -- HALF FIXED (2026-09-05).* The four FFmpeg /
   FFglitch binaries are gitignored and were never committed, so losing
   `src-tauri/bin/` made the project unbuildable. `npm run fetch:external` now
   re-obtains them, pinned by `src-tauri/bin/SIDECARS.json` to the exact
   known-good versions (FFmpeg 8.0-essentials, FFglitch 0.10.2) and verified by
   SHA-256 before anything is installed. Proven by deleting a binary and
   recovering it byte-identically.
   STILL OPEN: `packages/python-backend/sam3_repo` is gitignored and needs a
   PATCHED clone (`weights_only=False`); see `docs/SAM3_SETUP.md`. Nothing
   automates that yet.
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

*Cause 2 — REGRESSION I INTRODUCED, now reverted.* A `loseContext()` call was
added to `WebGLContext.destroy()` to fix a context leak. It made things strictly
worse: a canvas has exactly ONE WebGL context for its lifetime, `loseContext()`
is permanent, and PreviewViewport's init effect re-runs against the SAME canvas
(StrictMode in dev, and on any dependency change). The loss event fires a tick
LATER, by which time the re-initialised context has registered its listeners on
that canvas -- so the new context receives the old one's loss event and marks
itself dead. Result: a guaranteed black preview on every launch, confirmed in
`tauri:dev` output. Reverted; the leak is documented in the source as unfixed.
No automated guard exists -- SwiftShader implements WEBGL_lose_context
differently and a synthetic repro passes either way (verified in both
directions). Recognise a recurrence by this at startup:
`[WebGLContext] WebGL context lost` / `[Preview] WebGL context lost` /
`[EffectChain] render skipped` repeating.

*Original cause 2 — leaked WebGL contexts (STILL PRESENT, unfixed).* `WebGLContext.destroy()` freed GL
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

**Panels can now be rearranged.** `defaultLayout.ts` locked the centre (Preview)
and bottom (Timeline) tabsets with `enableDrop/enableDrag/enableDivide: false`.
The centre is the largest region of the window and the obvious place to aim a
panel, so dragging one there did nothing -- drag started, drop indicator drew,
drop refused. Confirmed by driving the layout directly: dropping Stack onto
Preview left the model byte-identical. Both zones now accept drops, drags and
divides; both tabs keep `enableClose: false` so they cannot be lost. NOTE the
drop itself is HTML5 drag-and-drop, which synthetic events cannot trigger --
verifying a rearrange end-to-end needs a real mouse.

**Effect names in the browser fallback were the shader's name.** `deriveName` in
`browserFallback.ts` returned the SHADER name for any effect whose shader was not
`pass_through`. Twelve datamoshing effects share `temporalDatamoshing` and all
read "Temporal Datamoshing"; 29 of 96 mapped effects showed a duplicated name.
Names now derive from the effect ID, with category-qualification for genuine
collisions (`pixel_geo.pixelate` vs `audio_reactive.pixelate`). This list is only
used when `__TAURI_INTERNALS__` is absent, so seeing it in the DESKTOP app would
mean the app had fallen back and lost its Rust backend -- worth checking if it
recurs there.

Earlier in the session: video export was totally broken (temp file lost the
destination extension) and now works; FFmpeg mid-write failures report FFmpeg's
own message instead of `os error 109`; the empty command palette; silent gate
failures and stale-binary false greens; non-deterministic LUT thumbnails; and
the whole SAM3 packaging chain — SAM3 is verified working end-to-end over its
real protocol (handshake → `auth_ok`, `load_image` → 1600x1216,
`text_prompt` → 3 hits, top score 0.924).

---

## Verifying export formats (read before trusting a format change)

`output_spec()` has unit tests, and they are NOT enough on their own: they
assert on the struct's fields, not that FFmpeg accepts the arguments those
fields produce. Image-sequence export shipped broken underneath a fully green
suite for exactly that reason -- the muxer rejects a fixed output filename, and
nothing in the tests ever ran FFmpeg.

Run the real argument sets against the bundled binary after touching a format:

    ffmpeg -f rawvideo -pix_fmt rgba -s 64x64 -r 30 -i raw.rgba            <the args output_spec builds> -y out.<ext>

Confirmed working this way on 2026-08-23: gif, apng, webp (single file), and
png/jpeg sequences (30 frames in, 30 files out).

## The `0x80070002` webview error is a restart race, not a defect

`ERROR tauri_runtime_wry: failed to create webview: 0x80070002 (file not found)`
appears at startup and the app then works normally. Investigated 2026-08-23 and
CLOSED as benign. Do not re-chase it without new evidence.

What was ruled out, each by experiment rather than reasoning:

- `transparent: true` -- error still occurs with it set to false.
- The window's `"url": "index.html"` -- error still occurs with it removed.
- Orphaned WebView2 processes from a previous run -- none belonged to this app.
- A missing WebView2 runtime -- v151.0.4129.101 is installed.

What settled it: `setup()` now logs which webviews exist, and a run that emitted
NO error reported `webviews: ["main"]` -- so the webview is created either way.
Then a genuinely clean launch (no prior instance, ten seconds of quiet first)
produced no error at all, while every single occurrence had followed a kill or a
dev hot-restart.

So the first creation attempt races a previous instance's WebView2 state and
Tauri recovers. The precise internals -- which file the loader cannot find --
remain unidentified; what is established is WHEN it happens and that nothing is
lost when it does. It is unrelated to the 0xc0000005 crash.

## Logging: how a failure reaches the log file

Fixed 2026-08-23 after a reported export failure left a log holding only three
startup lines. Four separate faults, each of which hid the next:

1. Release builds detach the console, so `console.error` went nowhere.
2. ~40 sites call `setStatusMessage` and NEVER the logger, so failures were UI
   text only.
3. The bridge between them matched PROSE, and the first message written after it
   shipped ("The original file is no longer available") matched none of its
   words. Neither did "WebGL context lost".
4. `export_video` validated its arguments BEFORE its first tracing call, so a
   rejected path returned with no trace at all.

`setStatusMessage(msg, level?)` now takes an explicit level. **Pass
`"error"` when reporting a failure** -- the regex that remains is only a net for
sites that do not, and widening it is a losing game ("No masks found for prompt"
cannot be matched robustly). Frontend warn/error forward to the Rust log through
`log_frontend`; uncaught errors and unhandled rejections are captured too.

Logs live at `~/.moshdither/logs/`, newest 20 kept, path available from
`get_log_path`.

## E2E is now gated, because it was the hole

`npm run gate` runs Playwright as gate 9 (~6.5 min; excluded from `-Quick`).
Before this, seven gates could pass while the app crashed on launch under the
Tauri mock -- which is exactly what a close-guard change did, undetected, and it
also let a real dock bug sit failing in the suite. If a change touches anything
the app renders, the gate now proves the app still renders.

## Adversarial audit, 2026-08-23

Hunting one specific class: **controls and messages that do not mean what they
say.** Every bug found this session was that shape, never a crash.

ALL FIVE FINDINGS ARE NOW FIXED:

1. **Pause now pauses.** Shader time is always the timeline's time; it used to
   fall back to `performance.now()` while stopped, so animated effects ran
   identically in both transport states. A paused preview now shows the frame
   under the playhead -- the same frame export writes.
2. **The app starts stopped.** `isPlaying` defaulted to true.
3. **`composite.overlay` and `color.lut_grading`** show an inline banner while
   waiting on a file selection, instead of silently behaving like a disabled
   effect. Driven by REQUIRES_SELECTION so a third case is one table entry.
4. **`datamoshing.beat_hold` / `beat_smear`** now have conversion-table entries.
   A missing entry is not the same as pass_through: it pushed the whole stack
   onto the slow CPU preview path. Every registered effect is now mapped.
5. **The seven unused Tauri commands** are documented in place above
   `invoke_handler` in lib.rs -- what each was for and why it is unwired -- so a
   later audit does not read them as broken. They are IPC surface for no
   benefit; drop the registration (not the function) if that trade sours.

CHECKED AND CLEAN -- do not re-audit these without new evidence:

- Every frontend `invoke()` resolves to a registered command. No runtime-missing
  commands.
- Every effect parameter declared in Rust is actually read. (An early grep said
  otherwise; it missed the `f32_param(params, "id", default)` helper
  indirection. False positive.)
- No `todo!()` / `unimplemented!()` in shipping code.
- No empty click handlers.
- All 169 store fields are read somewhere outside the store.
- Every panel in the registry is reachable, via the layout or the rail.

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
