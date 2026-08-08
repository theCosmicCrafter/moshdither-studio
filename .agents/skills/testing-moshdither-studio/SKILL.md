---
name: testing-moshdither-studio
description: Drive the moshdither-studio Vite app from Playwright when the Rust Tauri backend is unavailable. Covers seeding media/effects and asserting WebGL uniforms for preview/export parity checks.
---

## When to use this skill
Use this when you need end-to-end/browser tests of moshdither-studio effects, especially when `cargo`/`rustc` are not installed and the real Rust backend cannot run. It applies to any PR that changes `src/utils/effectConverter.ts` or the WebGL preview pipeline.

## Setup
- `npm run dev` starts the Vite app at `http://localhost:1420`.
- Playwright Chromium is available via the project's `playwright` dependency.
- Dismiss the onboarding modal by seeding `localStorage.setItem("onboardingDismissed", "true")` before `page.goto("/")`.
- A test image (e.g. `test-gradient.png`) can be loaded by base64 into the store.

## Seeding app state from Playwright
The browser fallback effect list (`src/lib/browserFallback.ts`) derives `ParameterDef` from shader uniforms, so effect parameters render as sliders without the Rust `options` metadata. To test a real Rust-style Select (or other custom metadata), seed `allEffects` directly:

```ts
await page.evaluate(async (dataUrl: string) => {
  const { useAppStore } = await import("/src/store/index.ts");
  const { loadMediaFromBase64 } = await import("/src/lib/tauri.ts");
  const store = useAppStore.getState();

  store.setAllEffects([
    {
      id: "dithering.bayer",
      name: "Bayer Dither",
      category: "dithering",
      media_type: "image",
      parameters: [
        { id: "matrix_size", name: "Matrix Size", type: "select", default: 1, options: ["2", "4", "8", "16"] },
      ],
    },
  ]);

  await loadMediaFromBase64(dataUrl);
  store.setMediaInfo({ width: 256, height: 256 });
  store.setMediaLoaded(true);
  store.setIsVideo(false);
  store.setFilePath("test-image.png");
  store.setOriginalDataUrl(dataUrl);
  store.setPreviewDataUrl(dataUrl);
  store.setEffectStack([
    {
      id: "stack-1",
      effectId: "dithering.bayer",
      effectName: "Bayer Dither",
      params: { matrix_size: 1 },
      enabled: true,
      maskId: null,
      maskMode: "inside",
    },
  ]);
  store.selectStackItem("stack-1");
}, testImageBase64);
```

## Asserting WebGL uniforms
The preview pipeline calls `stackToRenderPasses` from `src/utils/effectConverter.ts` to build the render passes and uniforms. You can import it inside `page.evaluate` and inspect `passes[0].uniforms`:

```ts
const scale = await page.evaluate(async () => {
  const { stackToRenderPasses } = await import("/src/utils/effectConverter.ts");
  const { useAppStore } = await import("/src/store/index.ts");
  const passes = stackToRenderPasses(useAppStore.getState().effectStack);
  return passes[0]?.uniforms.scale;
});
```

## Gotchas
- `isTauriAvailable()` checks `globalThis.__TAURI_INTERNALS__`. No mock is needed if you seed the store directly; the browser fallback path will use the seeded media.
- `PreviewViewport` re-renders continuously when effects are present. Screenshot comparisons should be treated as visual evidence, not exact pixel assertions, because sub-pixel timing can produce small differences.
- The `stackToRenderPasses` function is the source of truth for the WebGL `scale`/`matrix_size` transform and should be asserted directly.
- For legacy string tests, set `effectStack[x].params.matrix_size` to the desired string and re-read the uniform. Do not rely on the `<select>` `onChange` path for strings that are not valid option labels.

## Devin Secrets Needed
None.
