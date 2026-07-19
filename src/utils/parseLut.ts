/**
 * Parse a .cube LUT file into a Float32Array suitable for upload to a WebGL 3D texture.
 *
 * Supports the standard Adobe / Resolve .cube format:
 *   LUT_3D_SIZE <N>
 *   <R> <G> <B>
 *   ...
 *
 * Returns { size, data } where data is RGBA Float32Array (R varies fastest).
 */
export interface ParsedLut {
  size: number;
  data: Float32Array;
}

export function parseCubeLut(text: string): ParsedLut {
  const lines = text.split(/\r?\n/);

  let size = 0;
  const domainMin = [0.0, 0.0, 0.0];
  const domainMax = [1.0, 1.0, 1.0];
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line.startsWith("TITLE")) continue;

    if (line.startsWith("DOMAIN_MIN")) {
      const parts = line.split(/\s+/).slice(1);
      for (let i = 0; i < 3; i++) {
        const v = parseFloat(parts[i]);
        if (!isNaN(v)) domainMin[i] = v;
      }
      continue;
    }

    if (line.startsWith("DOMAIN_MAX")) {
      const parts = line.split(/\s+/).slice(1);
      for (let i = 0; i < 3; i++) {
        const v = parseFloat(parts[i]);
        if (!isNaN(v)) domainMax[i] = v;
      }
      continue;
    }

    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }

    // 1D LUTs are not supported
    if (line.startsWith("LUT_1D_SIZE")) {
      throw new Error("1D .cube LUTs are not supported");
    }

    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        values.push(r, g, b);
      }
    }
  }

  if (size === 0) {
    throw new Error("LUT_3D_SIZE not found in .cube file");
  }

  const expected = size * size * size * 3;
  if (values.length < expected) {
    throw new Error(`Incomplete LUT data: expected ${expected} values, got ${values.length}`);
  }

  const totalPixels = size * size * size;
  const data = new Float32Array(totalPixels * 4);
  const range = [
    Math.max(domainMax[0] - domainMin[0], 1e-6),
    Math.max(domainMax[1] - domainMin[1], 1e-6),
    Math.max(domainMax[2] - domainMin[2], 1e-6),
  ];
  for (let i = 0; i < totalPixels; i++) {
    data[i * 4 + 0] = (values[i * 3 + 0] - domainMin[0]) / range[0];
    data[i * 4 + 1] = (values[i * 3 + 1] - domainMin[1]) / range[1];
    data[i * 4 + 2] = (values[i * 3 + 2] - domainMin[2]) / range[2];
    data[i * 4 + 3] = 1.0;
  }

  return { size, data };
}

/// Sample a parsed 3D .cube LUT with trilinear interpolation.
/// `data` is in R-fastest, G, B order as produced by `parseCubeLut`.
export function sampleCubeLut(
  parsed: ParsedLut,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const { size, data } = parsed;
  const maxIdx = size - 1;

  const rPos = Math.max(0, Math.min(maxIdx, r * maxIdx));
  const gPos = Math.max(0, Math.min(maxIdx, g * maxIdx));
  const bPos = Math.max(0, Math.min(maxIdx, b * maxIdx));

  const r0 = Math.floor(rPos);
  const g0 = Math.floor(gPos);
  const b0 = Math.floor(bPos);
  const r1 = Math.min(r0 + 1, maxIdx);
  const g1 = Math.min(g0 + 1, maxIdx);
  const b1 = Math.min(b0 + 1, maxIdx);

  const fr = rPos - r0;
  const fg = gPos - g0;
  const fb = bPos - b0;

  const idx = (br: number, bg: number, bb: number) => ((bb * size + bg) * size + br) * 4;

  function read(c: number, br: number, bg: number, bb: number): number {
    return data[idx(br, bg, bb) + c];
  }

  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c000 = read(c, r0, g0, b0);
    const c100 = read(c, r1, g0, b0);
    const c010 = read(c, r0, g1, b0);
    const c110 = read(c, r1, g1, b0);
    const c001 = read(c, r0, g0, b1);
    const c101 = read(c, r1, g0, b1);
    const c011 = read(c, r0, g1, b1);
    const c111 = read(c, r1, g1, b1);

    const c00 = c000 * (1 - fr) + c100 * fr;
    const c10 = c010 * (1 - fr) + c110 * fr;
    const c01 = c001 * (1 - fr) + c101 * fr;
    const c11 = c011 * (1 - fr) + c111 * fr;

    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;

    out[c] = c0 * (1 - fb) + c1 * fb;
  }
  return out;
}

/// Resample a parsed 3D .cube LUT into a 512×512 RGBA ImageData that matches
/// the PNG LUT layout used by the WebGL pipeline (8×8 grid of 64×64 tiles).
export function cubeToFlatLutImageData(parsed: ParsedLut): ImageData {
  const width = 512;
  const height = 512;
  const tileSize = 64;
  const tileCount = 8;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tileRow = Math.floor(y / tileSize);
      const tileCol = Math.floor(x / tileSize);
      const bIndex = tileRow * tileCount + tileCol;

      const b = bIndex / (tileSize - 1);
      const r = (x % tileSize) / (tileSize - 1);
      const g = (y % tileSize) / (tileSize - 1);

      const [sr, sg, sb] = sampleCubeLut(parsed, r, g, b);

      const i = (y * width + x) * 4;
      pixels[i + 0] = Math.max(0, Math.min(255, sr * 255));
      pixels[i + 1] = Math.max(0, Math.min(255, sg * 255));
      pixels[i + 2] = Math.max(0, Math.min(255, sb * 255));
      pixels[i + 3] = 255;
    }
  }

  return new ImageData(pixels, width, height);
}
