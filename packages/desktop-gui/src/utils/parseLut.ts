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
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line.startsWith("TITLE")) continue;
    if (line.startsWith("DOMAIN_MIN")) continue;
    if (line.startsWith("DOMAIN_MAX")) continue;

    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }

    // Skip 1D LUT markers
    if (line.startsWith("LUT_1D_SIZE")) continue;

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
    throw new Error(
      `Incomplete LUT data: expected ${expected} values, got ${values.length}`,
    );
  }

  // Convert to RGBA (WebGL 3D textures need 4-channel data for gl.RGBA32F)
  const totalPixels = size * size * size;
  const data = new Float32Array(totalPixels * 4);
  for (let i = 0; i < totalPixels; i++) {
    data[i * 4 + 0] = values[i * 3 + 0];
    data[i * 4 + 1] = values[i * 3 + 1];
    data[i * 4 + 2] = values[i * 3 + 2];
    data[i * 4 + 3] = 1.0;
  }

  return { size, data };
}
