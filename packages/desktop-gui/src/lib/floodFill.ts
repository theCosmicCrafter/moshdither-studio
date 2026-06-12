/**
 * Flood Fill Algorithm for Mask Generation
 *
 * Standalone utility for generating masks by flood-filling from a seed point.
 * Used for Magic Wand / Bucket Fill mask creation in the Viewport.
 */

export interface FloodFillOptions {
  /** 4-way or 8-way connectivity */
  connectivity?: 4 | 8;
  /** Tolerance for color similarity (0-255) */
  tolerance?: number;
  /** Maximum fill area in pixels */
  maxArea?: number;
}

export interface FloodFillResult {
  mask: Uint8Array; // 1 byte per pixel, 0 or 255
  width: number;
  height: number;
  filledPixels: number;
}

/**
 * Flood fill a region in an image starting from a seed point.
 *
 * @param imageData  RGBA image data to sample from
 * @param seedX      Start X coordinate
 * @param seedY      Start Y coordinate
 * @param options    Fill options
 */
export function floodFill(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  options: FloodFillOptions = {},
): FloodFillResult {
  const { width, height, data } = imageData;
  const connectivity = options.connectivity ?? 4;
  const tolerance = options.tolerance ?? 32;
  const maxArea = options.maxArea ?? width * height;

  if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height) {
    throw new Error(`Seed point (${seedX}, ${seedY}) is out of bounds`);
  }

  const seedIdx = (seedY * width + seedX) * 4;
  const seedR = data[seedIdx];
  const seedG = data[seedIdx + 1];
  const seedB = data[seedIdx + 2];

  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [seedY * width + seedX];
  let filledPixels = 0;

  function colorMatches(x: number, y: number): boolean {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const dr = Math.abs(r - seedR);
    const dg = Math.abs(g - seedG);
    const db = Math.abs(b - seedB);
    return dr <= tolerance && dg <= tolerance && db <= tolerance;
  }

  const directions4 = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];
  const directions8 = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const directions = connectivity === 8 ? directions8 : directions4;

  while (stack.length > 0 && filledPixels < maxArea) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const x = idx % width;
    const y = Math.floor(idx / width);

    if (!colorMatches(x, y)) continue;

    mask[idx] = 255;
    filledPixels++;

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nidx = ny * width + nx;
      if (!visited[nidx]) {
        stack.push(nidx);
      }
    }
  }

  return { mask, width, height, filledPixels };
}

/**
 * Flood fill on a canvas element (convenience wrapper).
 */
export function floodFillCanvas(
  canvas: HTMLCanvasElement,
  seedX: number,
  seedY: number,
  options?: FloodFillOptions,
): FloodFillResult {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return floodFill(imageData, seedX, seedY, options);
}
