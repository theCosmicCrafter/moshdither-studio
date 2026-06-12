/**
 * Mask Post-Processing Pipeline
 *
 * Extracted from TRIX_ reference code. Applies grow/shrink, blur,
 * fill holes, and smooth edges to binary masks using Canvas 2D ops.
 *
 * All operations run on ImageData (Uint8ClampedArray) so they can be
 * easily moved to a WebWorker.
 */

export interface MaskPostProcessParams {
  /** Positive = grow (dilate), negative = shrink (erode) in pixels */
  grow: number;
  /** Gaussian-like blur radius in pixels */
  blur: number;
  /** Fill holes smaller than this area (in pixels) */
  fillHoles: number;
  /** Smooth edges by blurring + thresholding (px) */
  smooth: number;
}

export interface MaskPostProcessResult {
  imageData: ImageData;
  width: number;
  height: number;
}

/**
 * Apply the full post-processing pipeline to a mask.
 *
 * @param maskData  1-byte-per-pixel mask (0 or 255)
 * @param width     mask width
 * @param height    mask height
 * @param params    grow/blur/fill/smooth parameters
 */
export function applyMaskPostProcessing(
  maskData: Uint8Array,
  width: number,
  height: number,
  params: MaskPostProcessParams,
): MaskPostProcessResult {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Convert 1-channel mask to RGBA ImageData
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < maskData.length; i++) {
    const v = maskData[i] > 127 ? 255 : 0;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

  // Build a work canvas at the same size
  const workCanvas = document.createElement("canvas");
  workCanvas.width = width;
  workCanvas.height = height;
  const workCtx = workCanvas.getContext("2d")!;

  // 1. Grow / Shrink (dilation / erosion)
  if (params.grow !== 0) {
    applyGrowShrink(ctx, params.grow, width, height);
  }

  // Copy current state to work canvas
  workCtx.clearRect(0, 0, width, height);
  workCtx.drawImage(canvas, 0, 0);

  // 2. Fill holes
  if (params.fillHoles > 0) {
    applyFillHoles(workCtx, params.fillHoles, width, height);
  }

  // 3. Smooth edges
  if (params.smooth > 0) {
    applySmoothEdges(workCtx, params.smooth, width, height);
  }

  // 4. Blur
  const destCanvas = document.createElement("canvas");
  destCanvas.width = width;
  destCanvas.height = height;
  const destCtx = destCanvas.getContext("2d")!;

  if (params.blur > 0) {
    destCtx.filter = `blur(${params.blur}px)`;
    destCtx.drawImage(workCanvas, 0, 0);
    destCtx.filter = "none";

    // Threshold blurred result back to binary
    const blurredData = destCtx.getImageData(0, 0, width, height);
    thresholdImageData(blurredData, 128);
    destCtx.putImageData(blurredData, 0, 0);
  } else {
    destCtx.drawImage(workCanvas, 0, 0);
  }

  const result = destCtx.getImageData(0, 0, width, height);
  return { imageData: result, width, height };
}

/** Grow (dilate) or shrink (erode) a mask */
function applyGrowShrink(
  ctx: CanvasRenderingContext2D,
  growVal: number,
  w: number,
  h: number,
): void {
  if (growVal === 0) return;

  const src = ctx.getImageData(0, 0, w, h);
  const dst = new Uint8ClampedArray(src.data);
  const radius = Math.abs(growVal);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      let hasWhite = false;
      let allWhite = true;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) {
            // Out-of-bounds counts as black for erosion
            allWhite = false;
            continue;
          }
          const nidx = (ny * w + nx) * 4;
          const isWhite = src.data[nidx] > 128;
          if (isWhite) {
            hasWhite = true;
          } else {
            allWhite = false;
          }
        }
      }

      const val =
        growVal > 0
          ? hasWhite
            ? 255
            : 0 // dilate: white if ANY neighbor is white
          : allWhite
            ? 255
            : 0; // erode: white only if ALL neighbors are white

      dst[idx] = val;
      dst[idx + 1] = val;
      dst[idx + 2] = val;
      dst[idx + 3] = 255;
    }
  }

  ctx.putImageData(new ImageData(dst, w, h), 0, 0);
}

/** Fill holes smaller than minArea pixels */
function applyFillHoles(
  ctx: CanvasRenderingContext2D,
  minArea: number,
  w: number,
  h: number,
): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const visited = new Uint8Array(w * h);
  const filled = new Uint8ClampedArray(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;

      const pixelIdx = idx * 4;
      const isWhite = data[pixelIdx] > 128;

      // Flood fill this region
      const region: number[] = [];
      const stack = [idx];
      let touchesBorder = false;

      while (stack.length > 0) {
        const ci = stack.pop()!;
        if (visited[ci]) continue;
        visited[ci] = 1;
        region.push(ci);

        const cx = ci % w;
        const cy = Math.floor(ci / w);
        if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) {
          touchesBorder = true;
        }

        // 4-way neighbors
        const neighbors = [ci - 1, ci + 1, ci - w, ci + w];
        for (const ni of neighbors) {
          if (ni < 0 || ni >= w * h) continue;
          if (visited[ni]) continue;
          const nPixelIdx = ni * 4;
          const nIsWhite = data[nPixelIdx] > 128;
          if (nIsWhite === isWhite) {
            stack.push(ni);
          }
        }
      }

      // If this is a black (hole) region not touching border and smaller than threshold, fill it
      if (!isWhite && !touchesBorder && region.length <= minArea) {
        for (const ci of region) {
          const pi = ci * 4;
          filled[pi] = 255;
          filled[pi + 1] = 255;
          filled[pi + 2] = 255;
          filled[pi + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(new ImageData(filled, w, h), 0, 0);
}

/** Smooth edges by blurring + thresholding */
function applySmoothEdges(
  ctx: CanvasRenderingContext2D,
  smoothVal: number,
  w: number,
  h: number,
): void {
  if (smoothVal <= 0) return;

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w;
  blurCanvas.height = h;
  const blurCtx = blurCanvas.getContext("2d")!;

  blurCtx.filter = `blur(${smoothVal}px)`;
  blurCtx.drawImage(ctx.canvas, 0, 0);
  blurCtx.filter = "none";

  const imgData = blurCtx.getImageData(0, 0, w, h);
  thresholdImageData(imgData, 128);

  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(imgData, 0, 0);
}

function thresholdImageData(imgData: ImageData, threshold: number): void {
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] > threshold ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
}
