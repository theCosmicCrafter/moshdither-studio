import { chromium, expect, test } from "@playwright/test";

/**
 * A canvas has exactly ONE WebGL context for its whole lifetime, and losing it
 * is permanent -- a later canvas.getContext("webgl2") returns the same dead
 * object rather than a fresh one.
 *
 * PreviewViewport's init effect re-runs against the same canvas element
 * (StrictMode double-invokes it in dev; it also re-runs when its dependencies
 * change). A destroy() that called WEBGL_lose_context.loseContext() therefore
 * dispatched `webglcontextlost` a tick later, by which point the re-initialised
 * context had already registered its listeners on that canvas -- so the NEW
 * context received the OLD one's loss event, marked itself dead, and skipped
 * every subsequent render. That shipped briefly and blacked out the preview on
 * every launch.
 *
 * NO AUTOMATED GUARD EXISTS FOR THAT REGRESSION. It reproduces only in the
 * running app under WebView2. SwiftShader implements WEBGL_lose_context
 * differently, and a synthetic construct/destroy/construct sequence passes here
 * whether or not the bug is present -- verified in both directions, with the
 * canvas both attached to and detached from the document. A test asserting
 * otherwise would ratify the bug rather than catch it, so it was removed rather
 * than left in place looking like cover.
 *
 * To recognise a recurrence, look for this in `npm run tauri:dev` output at
 * startup:
 *
 *     [WebGLContext] WebGL context lost
 *     [Preview] WebGL context lost
 *     [EffectChain] render skipped: WebGL context lost   (repeating forever)
 *
 * The test below covers a narrower property that IS reproducible here. It runs
 * against a browser launched with SwiftShader rather than the shared `page`
 * fixture, so the result does not depend on the host having a usable GPU.
 */
test.setTimeout(120000);

const SWIFTSHADER = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

test("destroy() does not fire the caller's context-lost callback", async () => {
  // Teardown must stay silent: if it reported a lost context, PreviewViewport
  // would flip itself to the CPU fallback and post "WebGL context lost" on the
  // way out of a perfectly healthy unmount.
  const browser = await chromium.launch({ args: SWIFTSHADER });
  try {
    const page = await browser.newPage();
    await page.goto("http://localhost:1420/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("header", { timeout: 20000 });

    const lostCalls = await page.evaluate(async () => {
      const { WebGLContext } = (await import(
        "/src/engine/webgl2/WebGLContext.ts"
      )) as unknown as {
        WebGLContext: new (
          c: HTMLCanvasElement,
          cb?: { onContextLost?: () => void },
        ) => { destroy(): void };
      };

      let calls = 0;
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      new WebGLContext(c, { onContextLost: () => { calls++; } }).destroy();
      await new Promise((r) => setTimeout(r, 300));
      return calls;
    });

    expect(lostCalls).toBe(0);
  } finally {
    await browser.close();
  }
});
