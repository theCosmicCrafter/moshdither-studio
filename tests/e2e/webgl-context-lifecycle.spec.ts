import { chromium, expect, test } from "@playwright/test";

/**
 * Browsers allow only a fixed number of live WebGL contexts (16 in Chrome) and
 * force-lose the OLDEST once that cap is passed. PreviewViewport creates one
 * context per mount and remounts whenever its dock panel moves, so a destroy()
 * that freed GL objects but not the context itself leaked one per remount --
 * eventually the browser killed the context the visible preview was drawing
 * with and the preview went black.
 *
 * These run against a browser launched with SwiftShader rather than the shared
 * `page` fixture so the result does not depend on the host having a usable GPU.
 */
test.setTimeout(120000);

const SWIFTSHADER = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

async function withPage<T>(fn: (page: import("@playwright/test").Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ args: SWIFTSHADER });
  try {
    const page = await browser.newPage();
    await page.goto("http://localhost:1420/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("header", { timeout: 20000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

test("destroying a WebGLContext releases the context, not just its objects", async () => {
  const result = await withPage((page) =>
    page.evaluate(async () => {
      const { WebGLContext } = (await import(
        "/src/engine/webgl2/WebGLContext.ts"
      )) as unknown as { WebGLContext: new (c: HTMLCanvasElement) => { destroy(): void } };

      const canvases: HTMLCanvasElement[] = [];
      // More cycles than the browser's context cap, so a leak is unambiguous.
      for (let i = 0; i < 24; i++) {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        canvases.push(c);
        new WebGLContext(c).destroy();
      }
      await new Promise((r) => setTimeout(r, 500));

      const stillLive = canvases.filter((c) => {
        const gl = c.getContext("webgl2") as WebGL2RenderingContext | null;
        return gl !== null && !gl.isContextLost();
      }).length;
      return { created: canvases.length, stillLive };
    }),
  );

  expect(result.created).toBe(24);
  // Before the fix this was 16 -- the cap -- with the browser having evicted
  // the 8 oldest contexts to stay under it.
  expect(result.stillLive).toBe(0);
});

test("destroy() does not fire the caller's context-lost callback", async () => {
  // destroy() loses the context deliberately. If it did so before detaching the
  // listeners, PreviewViewport would react to its own teardown by flipping to
  // the CPU fallback and posting "WebGL context lost" on the way out.
  const lostCalls = await withPage((page) =>
    page.evaluate(async () => {
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
    }),
  );

  expect(lostCalls).toBe(0);
});
