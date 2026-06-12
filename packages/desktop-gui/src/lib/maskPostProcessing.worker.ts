/**
 * Mask Post-Processing WebWorker
 *
 * Offloads heavy pixel operations (grow, blur, fill holes, smooth)
 * from the main thread so the UI stays responsive.
 */

import type {
  MaskPostProcessParams,
  MaskPostProcessResult,
} from "./maskPostProcessing";

// WebWorkers can't import DOM-dependent modules directly, so we inline the
// algorithm using offscreen canvas when available, or manual pixel loops.

interface WorkerRequest {
  id: string;
  maskData: Uint8Array;
  width: number;
  height: number;
  params: MaskPostProcessParams;
}

interface WorkerResponse {
  id: string;
  result?: MaskPostProcessResult;
  error?: string;
}

const workerPostMessage = (
  self as unknown as {
    postMessage(message: unknown, transfer?: Transferable[]): void;
  }
).postMessage.bind(self);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, maskData, width, height, params } = e.data;

  try {
    const result = processMask(maskData, width, height, params);
    const response: WorkerResponse = { id, result };
    workerPostMessage(response, [result.imageData.data.buffer]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const response: WorkerResponse = { id, error: msg };
    workerPostMessage(response);
  }
};

function processMask(
  maskData: Uint8Array,
  w: number,
  h: number,
  params: MaskPostProcessParams,
): MaskPostProcessResult {
  // 1. Grow / Shrink (dilation / erosion)
  let data: Uint8ClampedArray = new Uint8ClampedArray(maskData.length * 4);
  for (let i = 0; i < maskData.length; i++) {
    const v = maskData[i] > 127 ? 255 : 0;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }

  if (params.grow !== 0) {
    data = applyGrowShrink(data, w, h, params.grow);
  }

  // 2. Fill holes
  if (params.fillHoles > 0) {
    data = applyFillHoles(data, w, h, params.fillHoles);
  }

  // 3. Smooth edges
  if (params.smooth > 0) {
    data = applySmoothEdges(data, w, h, params.smooth);
  }

  // 4. Blur (manual box blur since no canvas in worker)
  if (params.blur > 0) {
    data = applyBoxBlur(data, w, h, params.blur);
    data = thresholdImageData(data, 128);
  }

  return {
    imageData: new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), w, h),
    width: w,
    height: h,
  };
}

function applyGrowShrink(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  growVal: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src);
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
            allWhite = false;
            continue;
          }
          const nidx = (ny * w + nx) * 4;
          const isWhite = src[nidx] > 128;
          if (isWhite) {
            hasWhite = true;
          } else {
            allWhite = false;
          }
        }
      }

      const val = growVal > 0 ? (hasWhite ? 255 : 0) : allWhite ? 255 : 0;
      dst[idx] = val;
      dst[idx + 1] = val;
      dst[idx + 2] = val;
      dst[idx + 3] = 255;
    }
  }
  return dst;
}

function applyFillHoles(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  minArea: number,
): Uint8ClampedArray {
  const data = src;
  const visited = new Uint8Array(w * h);
  const filled = new Uint8ClampedArray(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;

      const pixelIdx = idx * 4;
      const isWhite = data[pixelIdx] > 128;

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

  return filled;
}

function applySmoothEdges(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  smoothVal: number,
): Uint8ClampedArray {
  // Simple box blur then threshold
  const blurred = applyBoxBlur(src, w, h, smoothVal);
  return thresholdImageData(blurred, 128);
}

function applyBoxBlur(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src.length);
  const r = Math.max(1, Math.floor(radius));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          sum += src[(ny * w + nx) * 4];
          count++;
        }
      }

      const avg = Math.round(sum / count);
      const idx = (y * w + x) * 4;
      dst[idx] = avg;
      dst[idx + 1] = avg;
      dst[idx + 2] = avg;
      dst[idx + 3] = 255;
    }
  }

  return dst;
}

function thresholdImageData(
  src: Uint8ClampedArray,
  threshold: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src);
  for (let i = 0; i < dst.length; i += 4) {
    const val = dst[i] > threshold ? 255 : 0;
    dst[i] = val;
    dst[i + 1] = val;
    dst[i + 2] = val;
    dst[i + 3] = 255;
  }
  return dst;
}

