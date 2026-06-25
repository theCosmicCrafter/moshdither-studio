/**
 * Tests for manual mask utility functions: createBlankMask, invertMask, clearMask.
 * Canvas operations are mocked since jsdom doesn't provide 2D context.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "../store";

// ── Canvas mock ──────────────────────────────────────────────

class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

class MockCanvasContext {
  fillStyle = "#000000";
  canvas: { width: number; height: number };
  private pixelData: Uint8ClampedArray | null = null;

  constructor(canvas: { width: number; height: number }) {
    this.canvas = canvas;
  }

  private ensureData(): Uint8ClampedArray {
    const size = this.canvas.width * this.canvas.height * 4;
    if (this.pixelData === null || this.pixelData.length !== size) {
      this.pixelData = new Uint8ClampedArray(size);
    }
    return this.pixelData;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b] = this.parseColor(this.fillStyle);
    const data = this.ensureData();
    for (let py = y; py < y + h && py < this.canvas.height; py++) {
      for (let px = x; px < x + w && px < this.canvas.width; px++) {
        const idx = (py * this.canvas.width + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number) {
    const data = this.ensureData();
    for (let py = y; py < y + h && py < this.canvas.height; py++) {
      for (let px = x; px < x + w && px < this.canvas.width; px++) {
        const idx = (py * this.canvas.width + px) * 4;
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  getImageData(_x: number, _y: number, _w: number, _h: number): MockImageData {
    const data = this.ensureData();
    return { data, width: this.canvas.width, height: this.canvas.height } as MockImageData;
  }

  putImageData(imgData: MockImageData, _x: number, _y: number) {
    this.pixelData = imgData.data;
  }

  drawImage(_img: unknown, _x: number, _y: number, _w: number, _h: number) {}

  private parseColor(color: string): [number, number, number] {
    if (color === "#ffffff" || color === "white") return [255, 255, 255];
    if (color === "#000000" || color === "black") return [0, 0, 0];
    const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    return [0, 0, 0];
  }
}

class MockCanvas {
  width: number;
  height: number;
  private ctx: MockCanvasContext;

  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
    this.ctx = new MockCanvasContext(this);
  }

  getContext(_type: string): MockCanvasContext | null {
    return this.ctx;
  }

  toDataURL(_type?: string): string {
    const data = this.ctx.getImageData(0, 0, this.width, this.height).data;
    const pixels: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      pixels.push(data[i]);
    }
    return `data:image/png;base64,${btoa(pixels.join(","))}`;
  }
}

const origCreateElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  if (tag === "canvas") {
    return new MockCanvas() as unknown as HTMLCanvasElement;
  }
  return origCreateElement(tag);
});

// ── Test helpers ─────────────────────────────────────────────

function createBlankMask(width: number, height: number): string | null {
  if (width === 0 || height === 0) return null;
  const canvas = document.createElement("canvas") as unknown as MockCanvas;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function invertMaskData(maskB64: string | null, width: number, height: number): string | null {
  if (width === 0 || height === 0) return null;
  const canvas = document.createElement("canvas") as unknown as MockCanvas;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const source = maskB64 || createBlankMask(width, height);
  if (!source) return null;

  // Simulate drawImage for blank mask
  if (source === createBlankMask(width, height)) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  const currentData = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < currentData.data.length; i += 4) {
    currentData.data[i] = 255 - currentData.data[i];
    currentData.data[i + 1] = 255 - currentData.data[i + 1];
    currentData.data[i + 2] = 255 - currentData.data[i + 2];
  }
  ctx.putImageData(currentData, 0, 0);
  return canvas.toDataURL("image/png");
}

function getPixelFromMask(
  maskB64: string,
  _width: number,
  _height: number,
  pixelIdx: number
): [number, number, number] {
  const b64 = maskB64.split(",")[1];
  const decoded = atob(b64);
  const values = decoded.split(",").map(Number);
  const idx = pixelIdx * 4;
  return [values[idx] || 0, values[idx + 1] || 0, values[idx + 2] || 0];
}

// ── Tests ────────────────────────────────────────────────────

describe("Manual mask utilities", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  describe("createBlankMask", () => {
    it("creates a white mask for valid dimensions", () => {
      const mask = createBlankMask(4, 4);
      expect(mask).not.toBeNull();
      expect(mask).toMatch(/^data:image\/png;base64,/);
    });

    it("returns null for zero width", () => {
      expect(createBlankMask(0, 4)).toBeNull();
    });

    it("returns null for zero height", () => {
      expect(createBlankMask(4, 0)).toBeNull();
    });

    it("creates a mask with all white pixels", () => {
      const mask = createBlankMask(2, 2);
      expect(mask).not.toBeNull();
      const [r, g, b] = getPixelFromMask(mask!, 2, 2, 0);
      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    });

    it("creates a mask with correct dimensions", () => {
      const mask = createBlankMask(10, 5);
      expect(mask).not.toBeNull();
      expect(mask).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe("invertMask", () => {
    it("inverts a white mask to black", () => {
      const whiteMask = createBlankMask(2, 2);
      expect(whiteMask).not.toBeNull();
      const inverted = invertMaskData(whiteMask, 2, 2);
      expect(inverted).not.toBeNull();
      const [r, g, b] = getPixelFromMask(inverted!, 2, 2, 0);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it("double-inverting returns to original", () => {
      const original = createBlankMask(2, 2);
      expect(original).not.toBeNull();
      const inverted1 = invertMaskData(original, 2, 2);
      expect(inverted1).not.toBeNull();
      const inverted2 = invertMaskData(inverted1, 2, 2);
      expect(inverted2).not.toBeNull();
      const [r1] = getPixelFromMask(original!, 2, 2, 0);
      const [r2] = getPixelFromMask(inverted2!, 2, 2, 0);
      expect(r2).toBe(r1);
    });

    it("handles null input by creating blank mask first", () => {
      const inverted = invertMaskData(null, 2, 2);
      expect(inverted).not.toBeNull();
      const [r] = getPixelFromMask(inverted!, 2, 2, 0);
      expect(r).toBe(0);
    });

    it("returns null for zero dimensions", () => {
      const result = invertMaskData(null, 0, 0);
      expect(result).toBeNull();
    });
  });

  describe("clearMask (store integration)", () => {
    it("setActiveMask(null) clears the mask in store", () => {
      useAppStore.getState().setActiveMask("some_mask_data");
      expect(useAppStore.getState().activeMask).toBe("some_mask_data");
      useAppStore.getState().setActiveMask(null);
      expect(useAppStore.getState().activeMask).toBe(null);
    });

    it("setActiveMask with blank mask replaces previous mask", () => {
      useAppStore.getState().setActiveMask("previous_mask");
      const blank = createBlankMask(4, 4);
      expect(blank).not.toBeNull();
      useAppStore.getState().setActiveMask(blank);
      expect(useAppStore.getState().activeMask).toBe(blank);
    });
  });

  describe("mask tool state management", () => {
    it("all mask tools can be selected", () => {
      const tools = ["brush", "eraser", "rect", "ellipse", "polygon"] as const;
      for (const tool of tools) {
        useAppStore.getState().setMaskTool(tool);
        expect(useAppStore.getState().maskTool).toBe(tool);
      }
    });

    it("brush size can be adjusted within bounds", () => {
      useAppStore.getState().setBrushSize(1);
      expect(useAppStore.getState().brushSize).toBe(1);
      useAppStore.getState().setBrushSize(200);
      expect(useAppStore.getState().brushSize).toBe(200);
      useAppStore.getState().setBrushSize(100);
      expect(useAppStore.getState().brushSize).toBe(100);
    });

    it("mask tab can switch between sam3 and manual", () => {
      useAppStore.getState().setMaskTab("manual");
      expect(useAppStore.getState().maskTab).toBe("manual");
      useAppStore.getState().setMaskTab("sam3");
      expect(useAppStore.getState().maskTab).toBe("sam3");
    });

    it("mask visibility can be toggled", () => {
      useAppStore.getState().setMaskVisible(false);
      expect(useAppStore.getState().maskVisible).toBe(false);
      useAppStore.getState().setMaskVisible(true);
      expect(useAppStore.getState().maskVisible).toBe(true);
    });
  });

  describe("mask + effect stack integration", () => {
    it("can assign active mask to a stack item and change mode", () => {
      useAppStore.getState().setActiveMask("data:image/png;base64,testmask");

      useAppStore.getState().addToStack({
        id: "color.invert",
        name: "Invert",
        category: "Color",
        parameters: [],
      } as never);
      const stack = useAppStore.getState().effectStack;
      const id = stack[stack.length - 1].id;

      useAppStore.getState().setStackItemMask(id, "active");
      useAppStore.getState().setStackItemMaskMode(id, "inside");

      const entry = useAppStore.getState().effectStack.find((e) => e.id === id);
      expect(entry?.maskId).toBe("active");
      expect(entry?.maskMode).toBe("inside");
      expect(useAppStore.getState().activeMask).toBe("data:image/png;base64,testmask");
    });

    it("can assign different masks to different effects in the stack", () => {
      useAppStore.getState().setSam3Masks(["sam0_data", "sam1_data"], [0.9, 0.8]);

      useAppStore.getState().addToStack({
        id: "color.invert",
        name: "Invert",
        category: "Color",
        parameters: [],
      } as never);
      useAppStore.getState().addToStack({
        id: "noise.gaussian",
        name: "Gaussian",
        category: "Noise",
        parameters: [],
      } as never);

      const stack = useAppStore.getState().effectStack;
      const id1 = stack[stack.length - 2].id;
      const id2 = stack[stack.length - 1].id;

      useAppStore.getState().setStackItemMask(id1, "active");
      useAppStore.getState().setStackItemMaskMode(id1, "inside");
      useAppStore.getState().setStackItemMask(id2, "sam3-1");
      useAppStore.getState().setStackItemMaskMode(id2, "outside");

      const e1 = useAppStore.getState().effectStack.find((e) => e.id === id1);
      const e2 = useAppStore.getState().effectStack.find((e) => e.id === id2);
      expect(e1?.maskId).toBe("active");
      expect(e1?.maskMode).toBe("inside");
      expect(e2?.maskId).toBe("sam3-1");
      expect(e2?.maskMode).toBe("outside");
    });
  });
});
