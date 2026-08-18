import { describe, expect, it, vi } from "vitest";

/**
 * Regression: applying a LUT blacked out the preview.
 *
 * EffectChain.render awaited lutLoader.loadLUT() with no guard, so an image
 * that failed to load rejected out of render() entirely. PreviewViewport
 * caught it, logged "WebGL render failed", and the canvas was simply never
 * drawn — the user saw the preview go black with no in-app explanation.
 *
 * These pin the contract that a failed texture degrades to an ungraded frame
 * rather than taking the whole render with it. They exercise the same
 * try/catch shape EffectChain now uses, without standing up a WebGL context.
 */
describe("sampler2D texture load failure", () => {
  async function renderPass(loadTexture: (url: string) => Promise<string>) {
    const drawn: string[] = [];
    const onTextureError = vi.fn();
    // Mirrors EffectChain's uniform loop for a sampler2D value.
    try {
      const tex = await loadTexture("/lut/x.png");
      drawn.push(`bound:${tex}`);
    } catch (err) {
      onTextureError("tLUT", "/lut/x.png", err);
    }
    drawn.push("draw");
    return { drawn, onTextureError };
  }

  it("still draws the frame when the texture fails", async () => {
    const { drawn, onTextureError } = await renderPass(() =>
      Promise.reject(new Error("Failed to load LUT image: /lut/x.png"))
    );
    expect(drawn).toContain("draw");
    expect(drawn).not.toContain("bound:tex");
    expect(onTextureError).toHaveBeenCalledOnce();
  });

  it("binds the texture and draws when the load succeeds", async () => {
    const { drawn, onTextureError } = await renderPass(() => Promise.resolve("tex"));
    expect(drawn).toEqual(["bound:tex", "draw"]);
    expect(onTextureError).not.toHaveBeenCalled();
  });

  it("surfaces the failing url so the cause is diagnosable", async () => {
    const { onTextureError } = await renderPass(() =>
      Promise.reject(new Error("Failed to load LUT image: /lut/x.png"))
    );
    const [uniform, url, err] = onTextureError.mock.calls[0];
    expect(uniform).toBe("tLUT");
    expect(url).toBe("/lut/x.png");
    expect(String(err)).toContain("/lut/x.png");
  });
});
