import { describe, it, expect } from "vitest";
import { floodFill, floodFillCanvas } from "../floodFill";

/**
 * Helper to build an ImageData from a 2D boolean grid.
 * true = white (255), false = black (0)
 */
function makeImageData(grid: boolean[][]): ImageData {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = grid[y][x] ? 255 : 0;
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function gridFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
): boolean[][] {
  const result: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      row.push(mask[y * width + x] > 0);
    }
    result.push(row);
  }
  return result;
}

describe("floodFill", () => {
  it("fills a solid white region from the center (4-way)", () => {
    const grid = [
      [false, false, false, false, false],
      [false, true, true, true, false],
      [false, true, true, true, false],
      [false, true, true, true, false],
      [false, false, false, false, false],
    ];
    const img = makeImageData(grid);
    const result = floodFill(img, 2, 2, { connectivity: 4, tolerance: 0 });

    expect(result.width).toBe(5);
    expect(result.height).toBe(5);
    expect(result.filledPixels).toBe(9);

    const filled = gridFromMask(result.mask, 5, 5);
    expect(filled[0]).toEqual([false, false, false, false, false]);
    expect(filled[1]).toEqual([false, true, true, true, false]);
    expect(filled[2]).toEqual([false, true, true, true, false]);
    expect(filled[3]).toEqual([false, true, true, true, false]);
    expect(filled[4]).toEqual([false, false, false, false, false]);
  });

  it("fills diagonally connected region with 8-way connectivity", () => {
    const grid = [
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ];
    const img = makeImageData(grid);
    const result = floodFill(img, 0, 0, { connectivity: 8, tolerance: 0 });

    // At tolerance 0, black pixels (0,0,0) won't match white (255,255,255).
    // 8-way connectivity connects the three diagonal white pixels.
    expect(result.filledPixels).toBe(3);
  });

  it("fills only 4-way connected region with 4-way connectivity", () => {
    const grid = [
      [true, false, true],
      [false, false, false],
      [true, false, true],
    ];
    const img = makeImageData(grid);
    const result = floodFill(img, 0, 0, { connectivity: 4, tolerance: 0 });

    // 4-way: only the single corner pixel, no diagonal connection
    expect(result.filledPixels).toBe(1);
  });

  it("respects tolerance and fills similar colors", () => {
    // Create a gradient from 100 to 200
    const width = 10;
    const height = 1;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let x = 0; x < width; x++) {
      const v = 100 + x * 10; // 100, 110, 120, ..., 190
      const i = x * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    const img = new ImageData(data, width, height);

    // Seed at pixel 0 (value 100), tolerance 25
    // Should fill pixels with values 100-125 (pixels 0, 1, 2)
    const result = floodFill(img, 0, 0, { tolerance: 25, connectivity: 4 });
    expect(result.filledPixels).toBe(3);
  });

  it("respects maxArea limit", () => {
    const grid = [
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ];
    const img = makeImageData(grid);
    const result = floodFill(img, 0, 0, { maxArea: 5, tolerance: 0 });

    expect(result.filledPixels).toBe(5);
  });

  it("throws on out-of-bounds seed point", () => {
    const img = makeImageData([[true]]);
    expect(() => floodFill(img, -1, 0)).toThrow("out of bounds");
    expect(() => floodFill(img, 0, -1)).toThrow("out of bounds");
    expect(() => floodFill(img, 1, 0)).toThrow("out of bounds");
    expect(() => floodFill(img, 0, 1)).toThrow("out of bounds");
  });

  it("fills all matching-color pixels at zero tolerance", () => {
    const grid = [
      [false, false],
      [false, true],
    ];
    const img = makeImageData(grid);
    const result = floodFill(img, 0, 0, { tolerance: 0 });
    // Seed is black (0,0,0); other black pixels match at tolerance 0.
    // Only the white pixel does not match. So 3 pixels filled.
    expect(result.filledPixels).toBe(3);
  });
});

describe("floodFillCanvas", () => {
  it("fills from a canvas element", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3;
    canvas.height = 3;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 3, 3);
    ctx.fillStyle = "black";
    ctx.fillRect(1, 1, 1, 1);

    const result = floodFillCanvas(canvas, 0, 0, { tolerance: 0 });
    expect(result.filledPixels).toBe(8); // all white except center black
  });
});
