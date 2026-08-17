/**
 * Tests for EffectChain's labelled GL error checkpoint.
 *
 * PreviewViewport calls gl.getError() once at the end of a frame, so a fault
 * arrives as a bare "WebGL error after render: 1282" with nothing identifying
 * which operation produced it — 741 such lines in a single session, all
 * unactionable. `ckpt` names the failing stage instead. These tests pin the
 * behaviour that makes it useful: it decodes the enum, attributes the label,
 * and reports a recurring fault once rather than every frame.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EffectChain } from "../EffectChain";
import type { WebGLContext } from "../WebGLContext";

const NO_ERROR = 0;
const INVALID_OPERATION = 0x0502;

/**
 * Minimal GL stub: `getError` is what the test is about; the rest is only what
 * FullscreenQuad's constructor calls while building its geometry buffers.
 */
function makeGl(errors: number[]) {
  return {
    NO_ERROR,
    getError: vi.fn(() => (errors.length ? errors.shift()! : NO_ERROR)),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
  };
}

function makeChain(errors: number[]) {
  const gl = makeGl(errors);
  const ctx = { getGL: () => gl } as unknown as WebGLContext;
  const chain = new EffectChain(ctx, 64, 64);
  // ckpt is private by design; exercising it directly is the point of the test.
  const ckpt = (label: string) =>
    (chain as unknown as { ckpt: (l: string) => void }).ckpt(label);
  return { gl, ckpt };
}

describe("EffectChain GL checkpoint", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("says nothing when the checkpoint is clean", () => {
    const { ckpt } = makeChain([NO_ERROR]);
    ckpt("useProgram(bayer)");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("names both the GL enum and the stage that produced it", () => {
    const { ckpt } = makeChain([INVALID_OPERATION]);
    ckpt("draw to fb_a (maskBlend)");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const msg = String(errorSpy.mock.calls[0][0]);
    // The two facts a bare "1282" was missing.
    expect(msg).toContain("INVALID_OPERATION");
    expect(msg).toContain("draw to fb_a (maskBlend)");
  });

  it("reports a recurring fault once, not once per frame", () => {
    const { ckpt } = makeChain([INVALID_OPERATION, INVALID_OPERATION, INVALID_OPERATION]);
    ckpt("draw to screen (bayer)");
    ckpt("draw to screen (bayer)");
    ckpt("draw to screen (bayer)");

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("still distinguishes different stages failing", () => {
    const { ckpt } = makeChain([INVALID_OPERATION, INVALID_OPERATION]);
    ckpt("useProgram(bayer)");
    ckpt("draw to screen (bayer)");

    expect(errorSpy).toHaveBeenCalledTimes(2);
    const labels = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(labels.some((m) => m.includes("useProgram(bayer)"))).toBe(true);
    expect(labels.some((m) => m.includes("draw to screen (bayer)"))).toBe(true);
  });
});
