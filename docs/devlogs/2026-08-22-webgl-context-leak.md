# 2026-08-22 — The black preview was a leaked WebGL context

## Symptom

"I closed the app after applying the LUT, the preview went black." Reported
repeatedly, never reliably reproducible by hand, and it survived four separate
"fixes" that were each derived from reading source rather than from evidence:

1. `crossOrigin`/CORS on the LUT image (`1c23136`)
2. A texture-unit collision in `EffectChain` (`dbf6003`)
3. An early return on `originalDataUrl`
4. Restoring effect params on session reload

All four were wrong. They are listed here because the pattern — a plausible
source-level story shipped without a reproduction — is what cost the time, not
any one of the diagnoses.

## What it actually was

`WebGLContext.destroy()` deleted every program, texture and framebuffer it had
cached, then returned. It never released the **context**. A canvas holds its
WebGL context until garbage collection, and browsers cap how many may be live at
once — 16 in Chrome — force-losing the **oldest** once that cap is passed.

`PreviewViewport` constructs one context per mount. It remounts whenever its
flexlayout dock panel is moved, docked, undocked or maximised (and twice at
startup, from React StrictMode's double mount in dev). Every remount leaked one
context. After enough of them the browser killed the context the *visible*
preview was drawing with, `onContextLost` fired, and the preview went black and
fell back to the CPU path.

This is why it correlated with "after applying a LUT" only loosely: what mattered
was the accumulated number of panel remounts in the session, not the LUT.

## How it was proven

Headless Chromium has no WebGL, which is why this never showed up in E2E. Running
Chromium with SwiftShader (`--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`) supplies a software GL stack, and Vite already
serves the module, so the real class can be exercised in-page:

    for (let i = 0; i < 24; i++) { new WebGLContext(canvas).destroy(); }

Before the fix: **8 contexts force-lost by the browser, 16 still live.**
After the fix: **0 still live.**

## The fix

`destroy()` now ends with:

    this.gl.getExtension("WEBGL_lose_context")?.loseContext();

Ordering matters. `destroy()` removes the `webglcontextlost` /
`webglcontextrestored` listeners first, so losing the context deliberately does
not invoke our own `onContextLost` callback — otherwise teardown would flip the
component to the CPU fallback and post "WebGL context lost" on its way out.

## Regression cover

`tests/e2e/webgl-context-lifecycle.spec.ts`, two tests:

- 24 create/destroy cycles leave **0** live contexts (a leak shows up as 16)
- `destroy()` does not fire the caller's `onContextLost` callback

Both launch their own SwiftShader Chromium instead of using the shared `page`
fixture, so they do not depend on the host having a usable GPU.

## Worth knowing next time

- **Headless Chromium has no WebGL.** Any renderer bug is invisible to E2E
  unless the browser is launched with SwiftShader. That single flag set is what
  unblocked a bug that had resisted several sessions.
- The Tauri mock's `convertFileSrc` returns `/mock-file/<path>`, which 404s.
  `page.route("**/mock-file/**", r => r.fulfill({ path: realImage }))` gives the
  WebGL chain genuine pixels to work on.
- Do not call `readPixels` or `drawImage` against the app's live context from a
  test — under SwiftShader it crashes the renderer process, which reads exactly
  like an app crash and sent this investigation sideways for a while.
