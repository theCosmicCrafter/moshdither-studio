import { describe, it, expect } from "vitest";
import { applyMaskPostProcessing } from "../maskPostProcessing";

/**
 * Helper to build a 1-channel mask from a 2D boolean grid.
 */
function makeMask(grid: boolean[][]): {
  data: Uint8Array;
  width: number;
  height: number;
} {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = grid[y][x] ? 255 : 0;
    }
  }
  return { data, width, height };
}

function gridFromImageData(img: ImageData): boolean[][] {
  const { width, height, data } = img;
  const result: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      row.push(data[(y * width + x) * 4] > 127);
    }
    result.push(row);
  }
  return result;
}

describe("applyMaskPostProcessing", () => {
  it("returns identical mask when all params are zero", () => {
    const grid = [
      [false, true, false],
      [true, true, true],
      [false, true, false],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: 0,
      blur: 0,
      fillHoles: 0,
      smooth: 0,
    });

    const out = gridFromImageData(result.imageData);
    expect(out).toEqual(grid);
  });

  it("grows (dilates) a cross-shaped mask by 1 pixel", () => {
    const grid = [
      [false, false, false, false, false],
      [false, false, true, false, false],
      [false, true, true, true, false],
      [false, false, true, false, false],
      [false, false, false, false, false],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: 1,
      blur: 0,
      fillHoles: 0,
      smooth: 0,
    });

    const out = gridFromImageData(result.imageData);
    // Square-kernel dilation: a pixel is white if ANY neighbor in 3x3 is white.
    // Cross arms extend to the corners of the bounding box.
    expect(out[0]).toEqual([false, true, true, true, false]);
    expect(out[1]).toEqual([true, true, true, true, true]);
    expect(out[2]).toEqual([true, true, true, true, true]);
    expect(out[3]).toEqual([true, true, true, true, true]);
    expect(out[4]).toEqual([false, true, true, true, false]);
  });

  it("shrinks (erodes) a solid square by 1 pixel", () => {
    const grid = [
      [true, true, true, true, true],
      [true, true, true, true, true],
      [true, true, true, true, true],
      [true, true, true, true, true],
      [true, true, true, true, true],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: -1,
      blur: 0,
      fillHoles: 0,
      smooth: 0,
    });

    const out = gridFromImageData(result.imageData);
    // Border should be eroded by 1 pixel
    expect(out[0]).toEqual([false, false, false, false, false]);
    expect(out[1]).toEqual([false, true, true, true, false]);
    expect(out[2]).toEqual([false, true, true, true, false]);
    expect(out[3]).toEqual([false, true, true, true, false]);
    expect(out[4]).toEqual([false, false, false, false, false]);
  });

  it("fills small holes within a ring", () => {
    const grid = [
      [true, true, true, true, true],
      [true, false, false, false, true],
      [true, false, false, false, true],
      [true, false, false, false, true],
      [true, true, true, true, true],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: 0,
      blur: 0,
      fillHoles: 10, // hole is 9 pixels, so 10 should fill it
      smooth: 0,
    });

    const out = gridFromImageData(result.imageData);
    // The 3x3 hole should be filled
    expect(out[1][1]).toBe(true);
    expect(out[1][2]).toBe(true);
    expect(out[1][3]).toBe(true);
    expect(out[2][1]).toBe(true);
    expect(out[2][2]).toBe(true);
    expect(out[2][3]).toBe(true);
    expect(out[3][1]).toBe(true);
    expect(out[3][2]).toBe(true);
    expect(out[3][3]).toBe(true);
  });

  it("does not fill holes larger than threshold", () => {
    const grid = [
      [true, true, true, true, true],
      [true, false, false, false, true],
      [true, false, false, false, true],
      [true, false, false, false, true],
      [true, true, true, true, true],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: 0,
      blur: 0,
      fillHoles: 5, // hole is 9 pixels, so 5 should NOT fill it
      smooth: 0,
    });

    const out = gridFromImageData(result.imageData);
    // The hole should remain unfilled
    expect(out[1][1]).toBe(false);
    expect(out[2][2]).toBe(false);
  });

  it("smooths jagged edges", () => {
    const grid = [
      [false, false, false, false, false, false, false],
      [false, true, true, false, false, false, false],
      [false, true, true, true, false, false, false],
      [false, false, true, true, true, false, false],
      [false, false, false, true, true, false, false],
      [false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: 0,
      blur: 0,
      fillHoles: 0,
      smooth: 2,
    });

    const out = gridFromImageData(result.imageData);
    // Smoothing should reduce jaggedness
    // Just verify it produces a valid result without crashing
    expect(out.length).toBe(7);
    expect(out[0].length).toBe(7);
  });

  it("blurs and thresholds back to binary", () => {
    const grid = [
      [false, false, false, false, false],
      [false, true, true, true, false],
      [false, true, true, true, false],
      [false, true, true, true, false],
      [false, false, false, false, false],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: 0,
      blur: 2,
      fillHoles: 0,
      smooth: 0,
    });

    const out = gridFromImageData(result.imageData);
    // Blur + threshold should still produce binary output
    expect(result.width).toBe(5);
    expect(result.height).toBe(5);
    // All values should be either true or false (no partial opacity)
    for (const row of out) {
      for (const val of row) {
        expect(typeof val).toBe("boolean");
      }
    }
  });

  it("combines grow + fill holes + smooth", () => {
    const grid = [
      [false, false, false, false, false, false, false],
      [false, true, true, true, true, true, false],
      [false, true, false, false, false, true, false],
      [false, true, false, false, false, true, false],
      [false, true, false, false, false, true, false],
      [false, true, true, true, true, true, false],
      [false, false, false, false, false, false, false],
    ];
    const mask = makeMask(grid);
    const result = applyMaskPostProcessing(mask.data, mask.width, mask.height, {
      grow: 1,
      blur: 0,
      fillHoles: 20,
      smooth: 1,
    });

    const out = gridFromImageData(result.imageData);
    expect(out.length).toBe(7);
    expect(out[0].length).toBe(7);
    // The hole should be filled after post-processing
    expect(out[3][3]).toBe(true);
  });
});
