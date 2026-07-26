# Production Readiness Audit — MoshDither Studio

**Date:** 2026-07-25
**Commit:** `9b21d31` (working tree dirty — 11 modified files uncommitted)
**Scope:** Full-stack adversarial audit — Rust backend, React frontend, effect wiring, design system, packaging, distribution.
**Method:** Independent re-execution of the entire toolchain on the Windows host, plus static cross-referencing of the Rust effect registry against the frontend preview layer.

---

> **Remediation status — updated 2026-07-26.** See §0 below. P0-2 and every
> P1 item are now fixed and covered by tests. P0-1 (SAM3 sidecar + weights) and
> P0-3 (code signing) remain open because they need build artifacts and
> certificates rather than code changes.

---

## 0. Remediation log

| ID | Item | Status | Evidence |
|---|---|---|---|
| P0-1 | SAM3 sidecar + model weights | ❌ **Open** | Needs `npm run build:sam3-sidecar`, an `externalBin` entry, and a checkpoint delivery decision |
| P0-2 | 27 effects with dead preview params | ✅ Fixed | `effectConverter.ts` rewritten; `effectConverter.wiring.test.ts` (8 assertions) now fails on drift |
| P0-3 | Unsigned Windows/macOS bundles | ❌ **Open** | Needs certificates + notarization credentials |
| P1-1 | `validate_project_path` blocklist dead on Windows | ✅ Fixed | Delegates to `path_guard::validate_io_path`; 7 new tests in `commands::project_path_tests` |
| P1-2 | `read_file`/`save_file` TOCTOU | ✅ Fixed | Both now operate on the returned `PathBuf` |
| P1-3 | UNC paths accepted | ✅ Fixed | `path_guard` rejects `Prefix::UNC`/`VerbatimUNC`; covered by `test_rejects_unc_paths` |
| P1-4 | `composite.overlay` claimed accurate preview | ✅ Fixed | Marked `accurate: false`; a test now forbids any `pass_through` mapping claiming accuracy |
| P1-5 | No reduced-motion / photosensitivity handling | ✅ Fixed | `@media (prefers-reduced-motion: reduce)` block in `index.css`; advisory in `OnboardingModal` |
| P2-1 | Test suite not hermetic | ✅ Fixed | `test.env.NODE_ENV = "test"` in `vite.config.ts`; 1008/1008 pass with ambient `NODE_ENV=production` |
| P2-2 | Only root error boundary | ❌ Open | Per-panel boundaries not yet added |
| P2-3 | No unsaved-changes guard on close | ❌ Open | Autosave still the only protection |
| P2-4 | Dirty working tree | ⚠️ Still dirty | Substantially larger now — a concurrent cleanup pass removed ~2,190 lines |

### Verification after remediation

| Check | Result |
|---|---|
| `cargo test --lib` | ✅ 449 / 449 (was 441 — 7 new path-guard tests + 1) |
| `cargo clippy --all-targets --all-features -- -D warnings` | ✅ clean |
| `cargo fmt -- --check` | ✅ clean (was failing on `lib.rs`; reformatted) |
| `mosh-verify verify-all` | ✅ 98 / 98 |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 warnings (fixed unused `err` in `useProjectSession.ts`) |
| `npx vitest run` **with ambient `NODE_ENV=production`** | ✅ 1008 / 1008 |
| `npm run build` | ✅ built |
| `playwright tests/e2e/app-launch.spec.ts` | ✅ 4 / 4 |
| Effect coverage | ✅ 98 / 98 Rust effects mapped; 66 honestly marked `accurate: false` |

### Additional issues found and fixed during remediation

- **`mask_isolate` has no category prefix.** Every other effect id is
  `<category>.<effect>`; this one is bare. Left as-is because project files
  serialize effect ids verbatim and renaming needs a migration — now documented
  inline at the mapping site.
- **`dithering.halftone`'s colour transform could never fire.** It compared the
  `rustParam` argument against *uniform* names (`colLight`), so the branch was
  unreachable. Removed along with the three non-existent `col_*` keys.
- **`audio_reactive.bass_pulse` divided sensitivity by 100**, pinning the
  preview at ~0.01 against a shader default of 1.0 and making the effect
  invisible. Rust `sensitivity` and shader `u_intensity` are the same kind of
  multiplier; the divisor is gone.
- **`cargo fmt` was failing** on an unformatted `println!` in `lib.rs`.
- **`tsconfig.json` excluded node types**, so any test needing `node:fs` failed
  type-checking. Added `"node"` to `compilerOptions.types`.
- **`/outputs/` was not gitignored.**

### Newly surfaced, still open

- **`sam3_repo/` at the repo root is 133 MB of dead weight.**
  `resolve_sam3_repo()` only ever looks at
  `packages/python-backend/sam3_repo` (74 MB). The two copies have drifted in
  size, so the root one is stale as well as unused.
- **240 `println!`/`eprintln!` calls in production Rust paths.** Harmless on a
  windowed Windows build (no console attached) but noisy, and some print
  filesystem paths.
- **29 raw `console.*` calls** bypass the project's own `src/utils/logger.ts`.
- **Accessibility is still thin**: 16 of 48 component files carry any
  `aria-*`/`role`, and `index.css` has 3 focus rules total. 52 hardcoded hex
  colours remain in components (down from 95 after the cleanup pass).

---

## Verdict (original, 2026-07-25)

**Not production ready. Ship-blocked on three issues.**

The engineering fundamentals are genuinely strong — 441 Rust tests, 1026 frontend tests, clean clippy under `-D warnings`, zero `npm audit` / `cargo audit` vulnerabilities, only 27 `unwrap`/`expect` calls in production Rust, no shell interpolation in any subprocess call. That is a better baseline than most shipping desktop apps.

What blocks release is not code quality. It is that **a marquee feature does not work off the developer's machine**, **half the effect sliders silently do nothing in the live preview**, and **nothing is code-signed**. Each is independently fixable; none require architectural change.

---

## 1. Verification results (independently re-run, not taken from HANDOFF.md)

| Check | Result | Notes |
|---|---|---|
| `cargo test --lib` | ✅ 441 / 441 | 1.81s |
| `cargo clippy --all-targets --all-features -- -D warnings` | ✅ clean | |
| `cargo fmt -- --check` | ✅ clean | |
| `cargo audit` | ✅ 0 vulns | 18 allowed warnings (unmaintained/unsound transitive deps; `glib 0.18.5` RUSTSEC-2024-0429) |
| `npx tsc --noEmit` | ✅ clean | |
| `npm run lint` | ✅ 0 warnings | |
| `npm audit` | ✅ 0 vulns | |
| `npm run build` | ✅ built in 1.02s | 2497 modules, sensible chunking |
| `mosh-verify verify-all` | ✅ 98 / 98 effects | crash / output / anim / mask-in / mask-out all pass |
| `playwright tests/e2e/app-launch.spec.ts` | ✅ 4 / 4 | incl. "no console errors on launch" |
| `npm run test` (vitest) | ⚠️ **229 failed / 1024** | environment-dependent — see P2-1 |

The vitest failure is **not** a code regression. `NODE_ENV=production` is set globally in the host environment, so React resolves to `react.production.min.js`, where `act()` throws. Re-running with `NODE_ENV=test` gives **1026 / 1026 passing**. The bug is that the test config does not pin its own environment — see P2-1.

---

## 2. P0 — Release blockers

### P0-1. SAM3 segmentation is non-functional in a packaged build

`scripts/verify-external-bins.mjs` reports on this machine:

```
[verify-external-bins] SAM3 sidecar not built; using dev Python interpreter:
    C:\Users\richk\CascadeProjects\moshdither-studio\sam3_env\Scripts\python.exe
[verify-external-bins] tauri.conf.json does not list bin/sam3-bridge (dev fallback to sam3_env)
```

Two independent failures stack here:

1. **No sidecar binary.** `sam3_engine.rs::Sam3Engine::new()` calls `locate_sam3_binary()` first, and on failure falls back to `<project_root>/sam3_env/Scripts/python.exe`. On an end-user machine there is no project root and no `sam3_env`, so every SAM3 command fails. `bin/sam3-bridge` is also absent from `tauri.conf.json → bundle.externalBin`, so even a built sidecar would not be packaged.
2. **No model weights.** `models/sam3/` contains only `.gitkeep` (0 bytes). `tauri.conf.json` bundles `"../models": "models"` — an empty directory. `resolve_checkpoint_path()` will find nothing.

The error paths themselves are well-written (descriptive `AppError::Generic` messages, no panic), so this degrades rather than crashes. But every SAM3 entry point — text prompt, point prompt, box prompt, auto-mask, video predictor — is dead in a shipped build.

**Fix:** run `npm run build:sam3-sidecar`, add `bin/sam3-bridge` to `externalBin`, and decide checkpoint strategy — bundling multi-GB weights into the installer is usually wrong; a first-run download with progress UI is better. Note `task.md` still lists *"Implement progress bar event interception for model downloads"* as unchecked, which is exactly the missing piece.

### P0-2. 27 effects have parameters that are silently dead in the live preview

This is the answer to "are all the effects wired and doing the correct things." They are wired at the *effect* level — all 97 Rust effects have a `rustToWebGL` mapping and all 70 shaders are registered. They are **not** correctly wired at the *parameter* level.

`stackToRenderPasses()` iterates `Object.entries(mapping.paramMap)` and reads `entry.params[rustParam]`. When a `paramMap` key is not an actual Rust parameter ID, the lookup returns `undefined`, the `continue` fires, and the uniform is never set — so the shader silently keeps its compiled-in default. The user drags a slider, the preview does not move, but the export changes. **Preview and export diverge with no warning.**

Verified examples:

| Effect | Rust parameter | `paramMap` key | Consequence |
|---|---|---|---|
| `pixel_geo.wave_distort` | `amplitude` | `amount` | Amplitude slider inert; shader pinned at `amount = 0.5` |
| `artistic.posterize` | `bits` | `levels` | Bits slider inert; shader pinned at `levels = 4.0`. Also a unit mismatch — `levels = 2^bits` |
| `pixel_geo.anaglyph` | `shift` | `amount` | Shift slider inert |
| `pixel_geo.block_shift` | `max_shift` | `amount` | Max-shift slider inert |
| `analog.ghosting` | `intensity`, `offset` | `amount` | Both sliders inert |
| `analog.scan_drift` | `amplitude`, `frequency` | `amount` | Both sliders inert |
| `analog.tv_glitch` | 7 params incl. `video_noise`, `chroma_loss` | `amount` | All 7 inert |
| `analog.vhs` | `tracking_error`, `slice_size`, `scan_curve`, `glitch_probability` | — | Not forwarded |
| `noise.uniform` / `noise.gaussian` | `range` / `std_dev` | `amount` | Inert |
| `color.rgb_shift` | `g_shift`, `b_shift` | — | Only R channel drives the preview |
| `color.brightness_contrast` | `gamma` | — | Gamma inert |
| `artistic.grayscale` | `intensity` | — | Inert |
| `dithering.halftone` | `screen_angle` | — | Inert; 4 dead keys (`amount`, `col_dark`, `col_light`, `col_white`) |

Full machine-generated list: 27 effects marked *accurate* with mis-wired parameters, plus 20 more among the `accurate: false` set (lower impact — those already show the APPROXIMATE badge).

Separately, **9 effects map a parameter onto a uniform the shader does not declare** — e.g. `color.invert` maps `intensity → "amount"`, but `invert.ts` has `uniforms: []`. The write goes nowhere.

**Why the test suite missed it:** `effectConverter.e2e.test.ts` validates the mapping table's internal shape, not its agreement with the Rust `ParameterDef` IDs or the shader `uniforms` arrays. Both are machine-checkable.

**Fix:** correct the mappings, then add a test that fails on drift. The audit script used to produce the table above is reproducible and can be dropped into CI — it needs only `ParameterDef { id: … }` from the Rust sources, `uniforms: [{ name: … }]` from the shader modules, and `rustToWebGL` from the converter.

### P0-3. Nothing is code-signed

```jsonc
"macOS":   { "signingIdentity": null, "entitlements": null },
"windows": { "certificateThumbprint": null, "signCommand": null }
```

With `bundle.targets: "all"` and `createUpdaterArtifacts: true`:

- **Windows:** unsigned NSIS/MSI → SmartScreen "unrecognized app" on every install until reputation accrues.
- **macOS:** `hardenedRuntime: true` with no signing identity and no notarization → Gatekeeper refuses to launch. The build is effectively undistributable on macOS.
- **Updater:** the `pubkey` is set and points at a GitHub releases `latest.json`. Unless `TAURI_SIGNING_PRIVATE_KEY` is wired into the release pipeline, no update can ever be published, and `check_update` will fail against a non-existent endpoint. Confirm that failure surfaces as a quiet no-op, not a startup error dialog.

---

## 3. P1 — Should fix before release

### P1-1. `validate_project_path()` system-directory blocklist is dead code on Windows

`read_file` / `save_file` are exposed IPC commands. Their guard, `commands.rs::validate_project_path()`, canonicalizes the path and then tests:

```rust
let canonical_str = canonical.to_string_lossy().to_lowercase();
let blocked_prefixes = &["c:\\windows\\", "c:\\program files\\", …];
```

`std::fs::canonicalize` on Windows returns an extended-length path. Verified empirically on this host:

```
CANON = \\?\C:\Windows\System32\drivers\etc\hosts
starts_with("c:\\windows\\") = false
```

Every prefix in the list is unreachable on the primary target platform. The blocklist has also never been exercised — there is **no test anywhere in the tree that references `validate_project_path`**, which is precisely why this survived.

Residual severity is limited by the extension allowlist (`.moshdither`, `.json`), the size cap, and the hidden-file rejection — so the realistic exposure is reading any `.json` on the system (`C:\ProgramData\**\config.json` files routinely hold tokens) and writing `.json` anywhere the user can write. Not catastrophic, but the control is entirely non-functional.

**Fix:** delete `validate_project_path`'s hand-rolled blocklist and delegate to `path_guard::validate_io_path`, which handles this correctly via `Component` iteration rather than string prefixes. Keep the extension allowlist on top. Add tests.

### P1-2. `read_file` / `save_file` use the unvalidated path string (TOCTOU)

```rust
validate_project_path(&path, true)?;
std::fs::write(&path, contents)          // ← raw `path`, not the canonicalized result
```

The validator canonicalizes internally but discards the result; the I/O then runs against the original string. A symlink or directory junction swapped between the two calls redirects the write. Same pattern in `read_file`. Low likelihood on a single-user desktop, trivial to close — return the `PathBuf` from the validator and operate on it, as `export_video` and `apply_ffglitch` already correctly do.

### P1-3. `path_guard` allows the entire user home directory, and does not block UNC paths

Two observations on `path_guard.rs`, which is otherwise well-constructed:

- `allowed_roots()` includes `USERPROFILE` / `HOME`, and `is_system_path()` short-circuits to `false` for anything beneath them. This is a deliberate documented tradeoff (users keep media anywhere), and it is the right call for *media* paths. It is the wrong call for `read_file`, whose blast radius under that policy includes `~/.ssh/id_rsa`, `~/.aws/credentials`, and browser profile data. The extension allowlist is currently the only thing standing between a webview compromise and those files — make that intentional rather than incidental.
- `is_system_path()` consumes `Component::Prefix` before checking. For a UNC path, the prefix swallows `\\server\share` entirely, so `\\attacker\share\out.mp4` is accepted as an export target. On Windows, merely touching a remote UNC path leaks NetNTLM credentials to that host. Reject `Component::Prefix(UNC | VerbatimUNC)` explicitly.

### P1-4. `composite.overlay` renders nothing and does not warn

```jsonc
"composite.overlay": { shaderId: "pass_through", paramMap: {} }
```

14 of 97 effects intentionally preview as `pass_through` — reasonable for temporal datamoshing effects that have no meaningful single-frame representation. 13 of those are correctly marked `accurate: false`, which lights the amber **APPROXIMATE** badge in `PreviewViewport`. `composite.overlay` is the exception: it is treated as accurate, so the badge stays green and reads **LIVE PREVIEW** while the overlay, its blend mode, and its opacity do nothing on screen. The user's only signal that the effect works is exporting the file.

**Fix:** mark it `accurate: false` at minimum. Better: distinguish "approximate" from "no preview available" in the badge — those are materially different promises to the user.

### P1-5. No `prefers-reduced-motion` support, and no photosensitivity safeguard

Searching `src/`, `docs/`, and `README.md` for `prefers-reduced-motion`, `photosensit`, `epilep`, or `strobe` returns **zero matches**. `index.css` defines 9 animations and the app's entire purpose is generating strobing, flashing, high-contrast glitch imagery — TV glitch, scan drift, beat-synced pulsing, frame-rate manipulation.

This is the one finding that is a user-safety issue rather than a polish issue. A glitch-art tool is close to a worst case for photosensitive epilepsy, and the app currently offers neither an OS-level reduced-motion honor nor a first-run advisory. `OnboardingModal.tsx` already exists and is the natural place for the advisory; a `@media (prefers-reduced-motion: reduce)` block covering the 9 keyframe animations plus the beat-pulse indicators covers the rest.

---

## 4. P2 — Fix soon

### P2-1. The test suite is not hermetic

`vitest.config` (in `vite.config.ts`) does not pin `NODE_ENV`. With `NODE_ENV=production` in the ambient environment — which is the case on this machine, and is common on CI runners and build agents — React resolves to its production build and **229 tests fail** on `act(...) is not supported in production builds of React`. With `NODE_ENV=test`, all 1026 pass.

A green suite that depends on an unset ambient variable is not a reliable gate.

**Fix:** add `test: { env: { NODE_ENV: "test" } }` or an equivalent `define` to the Vitest config. Separately, `NODE_ENV=production` being set globally on the dev machine is worth clearing — it also affects `npm install` dependency resolution.

### P2-2. Only the app root has an error boundary

`ErrorBoundary` wraps `<AppLayout>` in `App.tsx` and nowhere else. All ten panels are `React.lazy()` chunks rendered inside a `<Suspense>` in `FloatingWindow.tsx` — but Suspense catches pending, not rejected. A chunk that fails to load (which is the *normal* outcome when a user has the app open across an update that replaces hashed asset filenames) throws to the root boundary and blanks the entire application, not the one panel.

**Fix:** wrap each lazy panel in its own boundary with a retry affordance.

### P2-3. No unsaved-changes guard on window close

No `beforeunload` handler, and `lib.rs`'s `WindowEvent::CloseRequested` handler only shuts down the SAM3 engine before closing. `useProjectSession.ts` autosaves to `localStorage` under `moshdither_autosave_v1`, so work is recoverable — but the user gets no confirmation prompt and no indication that recovery happened.

### P2-4. Working tree is dirty

11 modified files uncommitted, including `src-tauri/src/sam3_engine.rs` (56 lines changed), `src/store/index.ts`, `src/utils/effectConverter.ts`, and four test files. Whatever is verified here is not what is in `HEAD`. Commit or stash before cutting a build.

---

## 5. P3 — Polish

- **Design tokens:** 95 hardcoded hex colors across `src/components/**/*.tsx` against 301 CSS custom properties in `index.css`. Concentrated in `GraffitiBackground.tsx` (13), `KeyboardShortcutsEditor.tsx` (11), `ErrorBoundary.tsx` (8), `AudioPanel/index.tsx` (8), `CommandPalette.tsx` (7). These bypass the theme system, so light mode and any future theme will be wrong in those components.
- **Keyboard accessibility:** only 16 of 50 component files contain any `aria-label`, `aria-labelledby`, or `role`. `index.css` has 3 `:focus` / `:focus-visible` rules total. With `decorations: false` and a custom `WindowControls`, keyboard-only operation needs an explicit pass.
- **Chunk-naming regex misses three panels.** The `manualChunks` matcher in `vite.config.ts` requires a trailing separator, so it only matches directory-style panels. `MaskPanel.tsx`, `ProxyPanel.tsx`, and `TrackPanel.tsx` are flat files and fall through to default chunking — visible in the build output as `MaskPanel-Wn5zkK3h.js` rather than `panel-maskpanel-*.js`. Cosmetic; splitting still works.
- **`audio_reactive.*` effects report `output:0` under `mosh-verify`** — they pass the crash check but produce no output delta without audio data. Expected, but the verifier cannot currently distinguish "correctly inert" from "broken."
- **`task.md` has 3 unchecked items**, one of which (model-download progress) is on the P0-1 critical path.

---

## 6. Adversarial brainstorm — what breaks in the field

| Scenario | Current behavior | Severity |
|---|---|---|
| User installs on a clean machine and clicks any SAM3 feature | Fails — no sidecar, no weights, no `sam3_env` | **Critical** |
| User drags the Amplitude slider on Wave Distort | Preview frozen; export differs. Reads as "the app is broken" | **High** |
| User downloads the Windows installer | SmartScreen block on first run | **High** |
| User downloads the macOS build | Gatekeeper refuses to launch | **High** |
| User leaves the app open across an auto-update | Lazy panel chunk 404s → whole app blanks | Medium |
| User adds a Composite Overlay | Nothing visible, badge says LIVE PREVIEW | Medium |
| Photosensitive user opens the app | No warning, no reduced-motion honor | Medium |
| CI runs with `NODE_ENV=production` | 229 tests fail; a real regression would be invisible in the noise | Medium |
| Webview compromise (malicious `.cube` LUT, XSS) | Can read/write any `.json` anywhere; can export to a UNC path and leak NetNTLM | Medium |
| User closes the window mid-edit | Silent close; autosave recovers on relaunch but nothing says so | Low |
| Export target on a full disk / removable drive removed mid-export | Unverified — worth a manual test | Unknown |
| Two exports triggered simultaneously | Correctly serialized by `export_semaphore` | ✅ handled |
| SAM3 bridge crashes mid-session | `cleanup_stale_sam3_bridge()` reaps the zombie on next init | ✅ handled |
| Poisoned mutex on registry/SAM3/frame lock | Explicitly tested, maps to error | ✅ handled |

---

## 7. Recommended order

**Before any public build**

1. Build and bundle the SAM3 sidecar; add `bin/sam3-bridge` to `externalBin`; decide and implement the checkpoint delivery path (P0-1)
2. Fix the 27 mis-wired `paramMap` entries and the 9 phantom uniforms; add the drift test to CI (P0-2)
3. Configure Windows and macOS signing + notarization; verify the updater key is present in the release pipeline (P0-3)
4. Pin `NODE_ENV=test` in the Vitest config (P2-1) — do this first, it makes everything else trustworthy
5. Commit the working tree (P2-4)

**Before wide distribution**

6. Replace `validate_project_path`'s blocklist with `path_guard::validate_io_path`; add tests (P1-1)
7. Operate on validated `PathBuf`s in `read_file` / `save_file` (P1-2)
8. Block UNC prefixes in `path_guard` (P1-3)
9. `prefers-reduced-motion` + first-run photosensitivity advisory (P1-5)
10. Mark `composite.overlay` as approximate; split the badge into "approximate" vs "no preview" (P1-4)

**Next iteration**

11. Per-panel error boundaries with retry (P2-2)
12. Close confirmation + visible autosave-recovery indicator (P2-3)
13. Design-token sweep and a keyboard/focus accessibility pass (P3)

---

## Appendix — reproducing the parameter-wiring audit

The mismatch table in P0-2 was produced by cross-referencing three sources that should agree but are never checked against each other:

1. `ParameterDef { id: "…" }` blocks in `src-tauri/src/effects/**/*.rs`, attributed to the nearest preceding `id: "<category>.<effect>"`
2. `uniforms: [{ name: "…" }]` arrays in `src/engine/shaders/*.ts`
3. The `rustToWebGL` table in `src/utils/effectConverter.ts`

An effect is correctly wired when every `paramMap` **key** is a real Rust `ParameterDef` ID, every `paramMap` **value** is a declared shader uniform, and every non-path Rust parameter appears as a key. Encoding those three assertions as a test converts this from a one-off audit into a permanent guard.
