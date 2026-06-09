import { describe, it, expect, vi } from "vitest";
import {
  sanitizeShaderSource,
  clearProgramCache,
  deleteCachedProgram,
  ShaderCompileError,
} from "../shader";

describe("sanitizeShaderSource", () => {
  it("strips BOM characters", () => {
    const src = "\uFEFFvoid main() {}";
    expect(sanitizeShaderSource(src)).toBe("void main() {}");
  });

  it("trims whitespace", () => {
    const src = "  void main() {}  \n";
    expect(sanitizeShaderSource(src)).toBe("void main() {}");
  });
});

describe("ShaderCompileError", () => {
  it("stores stage, log, and source", () => {
    const err = new ShaderCompileError("fragment", "bad syntax", "void main()");
    expect(err.stage).toBe("fragment");
    expect(err.log).toBe("bad syntax");
    expect(err.source).toBe("void main()");
    expect(err.message).toContain("bad syntax");
  });
});

describe("Program cache", () => {
  it("clears without error", () => {
    clearProgramCache();
    expect(true).toBe(true);
  });

  it("deleteCachedProgram handles missing program", () => {
    const fakeGl = {
      deleteProgram: vi.fn(),
    } as unknown as WebGL2RenderingContext;
    const fakeProgram = {} as WebGLProgram;
    // Should not throw even if program not in cache
    expect(() => deleteCachedProgram(fakeGl, fakeProgram)).not.toThrow();
  });
});
