// Worker for sequential error diffusion to avoid blocking the main UI thread

import { colorDistance } from '../math/color-science';

export interface DiffusionPayload {
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  palette: [number, number, number][]; // Array of RGB tuples
  serpentine: boolean;
}

export interface DiffusionResult {
  imageData: Uint8ClampedArray;
}

function findClosestPaletteColor(r: number, g: number, b: number, palette: [number, number, number][]): [number, number, number] {
  let minDistance = Infinity;
  let closestColor = palette[0];

  for (const color of palette) {
    const dist = colorDistance([r, g, b], color);
    if (dist < minDistance) {
      minDistance = dist;
      closestColor = color;
    }
  }
  return closestColor;
}

self.onmessage = (e: MessageEvent<DiffusionPayload>) => {
  const { imageData, width, height, palette, serpentine } = e.data;
  
  // Create a Float32 array for calculations to avoid clipping intermediate errors
  const pixels = new Float32Array(imageData.length);
  for (let i = 0; i < imageData.length; i++) {
    pixels[i] = imageData[i];
  }

  const getPixelIndex = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 0; y < height; y++) {
    const isReverse = serpentine && (y % 2 !== 0);
    
    for (let i = 0; i < width; i++) {
      const x = isReverse ? (width - 1 - i) : i;
      const idx = getPixelIndex(x, y);

      const oldR = pixels[idx];
      const oldG = pixels[idx + 1];
      const oldB = pixels[idx + 2];

      const newColor = findClosestPaletteColor(oldR, oldG, oldB, palette);
      
      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];
      
      // We don't dither alpha, just copy
      pixels[idx + 3] = imageData[idx + 3];

      const errR = oldR - newColor[0];
      const errG = oldG - newColor[1];
      const errB = oldB - newColor[2];

      // Floyd-Steinberg error distribution
      const distributeError = (dx: number, dy: number, factor: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = getPixelIndex(nx, ny);
          pixels[nidx] += errR * factor;
          pixels[nidx + 1] += errG * factor;
          pixels[nidx + 2] += errB * factor;
        }
      };

      const dir = isReverse ? -1 : 1;
      
      // Floyd-Steinberg distribution matrix
      distributeError(dir, 0, 7 / 16);
      distributeError(-dir, 1, 3 / 16);
      distributeError(0, 1, 5 / 16);
      distributeError(dir, 1, 1 / 16);
    }
  }

  // Copy back to Uint8ClampedArray
  const resultData = new Uint8ClampedArray(imageData.length);
  for (let i = 0; i < resultData.length; i++) {
    resultData[i] = Math.min(255, Math.max(0, pixels[i]));
  }

  self.postMessage({ imageData: resultData } as DiffusionResult);
};
