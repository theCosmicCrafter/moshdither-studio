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

## State: shippable

`npm run gate` passes 8/8 (verified 2026-08-22). Both installers build clean:

| Build | Command | Output |
|---|---|---|
| With SAM3 | `npm run tauri:build` | NSIS + MSI, ~2.9 GB sidecar |
| Without SAM3 | `npm run tauri:build:no-sam3` | NSIS 156 MB + MSI 185 MB |

---

## Closed this session

**The black preview — root-caused and fixed.** `WebGLContext.destroy()` freed GL
objects but never released the context; browsers cap live contexts at 16 and
force-lose the oldest, so every preview panel remount leaked one until the
browser killed the visible preview's context. Fixed with `loseContext()` in
`destroy()`, after listener removal. Proven with a SwiftShader Chromium harness
(24 cycles: 16 live before → 0 after). Full write-up and the four earlier wrong
diagnoses: [`docs/devlogs/2026-08-22-webgl-context-leak.md`](devlogs/2026-08-22-webgl-context-leak.md).
Regression cover: `tests/e2e/webgl-context-lifecycle.spec.ts`.

Earlier in the session: video export was totally broken (temp file lost the
destination extension) and now works; FFmpeg mid-write failures report FFmpeg's
own message instead of `os error 109`; the empty command palette; silent gate
failures and stale-binary false greens; non-deterministic LUT thumbnails; and
the whole SAM3 packaging chain — SAM3 is verified working end-to-end over its
real protocol (handshake → `auth_ok`, `load_image` → 1600x1216,
`text_prompt` → 3 hits, top score 0.924).

---

## Open

1. **Confirm the black preview is gone in a real build.** The fix is proven at
   the unit level but has not been exercised by a human in the installed app.
   Reproduction recipe: move/dock/undock the Preview panel a dozen or more times,
   then check the preview is still live. This is the one item that wants your
   hands rather than mine.
2. **Mask controls** (mode selector, invert, clear, brush) are untested — they
   need a live SAM3 mask to drive them.
3. **`composite.overlay`** defaults to identity until an overlay is selected.
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
