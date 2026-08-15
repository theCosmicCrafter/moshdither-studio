import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LUTLoader } from "./loader";
import type { WebGLContext } from "../webgl2/WebGLContext";

// jsdom has no real WebGL2 implementation, so LUTLoader is exercised against
// a minimal hand-built mock of the handful of gl calls it actually makes.
// LUTLoader only ever calls `ctx.getGL()`, so a fake satisfying that one
// method is sufficient -- no need to construct a real WebGLContext (which
// would itself try to acquire a webgl2 context from a canvas jsdom can't
// provide).
function createFakeGl() {
  let nextTextureId = 1;
  const deleteTexture = vi.fn();
  const gl = {
    createTexture: vi.fn(() => ({ __id: nextTextureId++ }) as unknown as WebGLTexture),
    deleteTexture,
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    TEXTURE_2D: 0,
    RGBA: 0,
    UNSIGNED_BYTE: 0,
    TEXTURE_MIN_FILTER: 0,
    TEXTURE_MAG_FILTER: 0,
    LINEAR: 0,
    TEXTURE_WRAP_S: 0,
    TEXTURE_WRAP_T: 0,
    CLAMP_TO_EDGE: 0,
    UNPACK_FLIP_Y_WEBGL: 0,
  };
  return { gl: gl as unknown as WebGL2RenderingContext, deleteTexture };
}

// Real Image loading never completes in jsdom (no network/decoder), so
// onload is fired manually from the src setter to keep loadLUT()'s awaited
// promise resolving like a real browser would, just synchronously enough
// for tests.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 512;
  height = 512;
  crossOrigin = "";
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe("LUTLoader", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches a loaded texture and reuses it on a repeat load", async () => {
    const { gl } = createFakeGl();
    const loader = new LUTLoader({ getGL: () => gl } as unknown as WebGLContext);

    const first = await loader.loadLUT("/lut/preset-a.png");
    const second = await loader.loadLUT("/lut/preset-a.png");

    expect(second).toBe(first);
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
  });

  it("evicts the least-recently-used texture once the cache exceeds its bound", async () => {
    const { gl, deleteTexture } = createFakeGl();
    const loader = new LUTLoader({ getGL: () => gl } as unknown as WebGLContext);
    const LUT_CACHE_MAX = 48;

    for (let i = 0; i < LUT_CACHE_MAX; i++) {
      await loader.loadLUT(`/lut/preset-${i}.png`);
    }
    expect(deleteTexture).not.toHaveBeenCalled();

    // One more load should push the cache over its bound and evict the
    // oldest (least-recently-used) entry: preset-0.
    await loader.loadLUT("/lut/preset-overflow.png");
    expect(deleteTexture).toHaveBeenCalledTimes(1);

    // preset-0 was evicted, so re-loading it must create a fresh texture
    // rather than reusing a cached one.
    const createCallsBefore = (gl.createTexture as ReturnType<typeof vi.fn>).mock.calls.length;
    await loader.loadLUT("/lut/preset-0.png");
    expect((gl.createTexture as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      createCallsBefore + 1
    );
  });

  it("touching a cached entry protects it from eviction as the least-recently-used", async () => {
    const { gl } = createFakeGl();
    const loader = new LUTLoader({ getGL: () => gl } as unknown as WebGLContext);
    const LUT_CACHE_MAX = 48;

    await loader.loadLUT("/lut/preset-0.png");
    for (let i = 1; i < LUT_CACHE_MAX; i++) {
      await loader.loadLUT(`/lut/preset-${i}.png`);
    }
    // Re-touch preset-0 so preset-1 becomes the new least-recently-used.
    await loader.loadLUT("/lut/preset-0.png");

    await loader.loadLUT("/lut/preset-overflow.png");

    const createCallsBefore = (gl.createTexture as ReturnType<typeof vi.fn>).mock.calls.length;
    await loader.loadLUT("/lut/preset-0.png");
    expect((gl.createTexture as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      createCallsBefore
    );
  });

  it("revokes a blob: URL when it is evicted from the cache", async () => {
    const { gl } = createFakeGl();
    const loader = new LUTLoader({ getGL: () => gl } as unknown as WebGLContext);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const LUT_CACHE_MAX = 48;

    await loader.loadLUT("blob:http://localhost/custom-lut-0");
    for (let i = 1; i < LUT_CACHE_MAX; i++) {
      await loader.loadLUT(`/lut/preset-${i}.png`);
    }
    expect(revokeSpy).not.toHaveBeenCalled();

    await loader.loadLUT("/lut/preset-overflow.png");
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost/custom-lut-0");

    revokeSpy.mockRestore();
  });

  it("does not revoke a non-blob URL when it is evicted from the cache", async () => {
    const { gl } = createFakeGl();
    const loader = new LUTLoader({ getGL: () => gl } as unknown as WebGLContext);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const LUT_CACHE_MAX = 48;

    for (let i = 0; i < LUT_CACHE_MAX; i++) {
      await loader.loadLUT(`/lut/preset-${i}.png`);
    }
    await loader.loadLUT("/lut/preset-overflow.png");

    expect(revokeSpy).not.toHaveBeenCalled();
    revokeSpy.mockRestore();
  });

  it("clearCache deletes all textures and revokes any blob: URLs", async () => {
    const { gl, deleteTexture } = createFakeGl();
    const loader = new LUTLoader({ getGL: () => gl } as unknown as WebGLContext);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    await loader.loadLUT("/lut/preset-a.png");
    await loader.loadLUT("blob:http://localhost/custom-lut-b");

    loader.clearCache();

    expect(deleteTexture).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost/custom-lut-b");

    revokeSpy.mockRestore();
  });
});
