import { describe, expect, it } from "vitest";
import { cubeToFlatLutImageData, parseCubeLut, sampleCubeLut } from "./parseLut";

function identityCube(size: number): string {
  const lines: string[] = [
    'TITLE "Identity"',
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];
  const max = size - 1;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        lines.push(`${r / max} ${g / max} ${b / max}`);
      }
    }
  }
  return lines.join("\n");
}

describe("parseCubeLut", () => {
  it("parses a 3D identity cube", () => {
    const parsed = parseCubeLut(identityCube(4));
    expect(parsed.size).toBe(4);
    expect(parsed.data.length).toBe(4 * 4 * 4 * 4);
  });

  it("rejects 1D LUTs", () => {
    const text = "LUT_1D_SIZE 16\n0.0 0.0 0.0\n";
    expect(() => parseCubeLut(text)).toThrow("1D");
  });

  it("rejects incomplete data", () => {
    const text = "LUT_3D_SIZE 3\n0.0 0.0 0.0\n";
    expect(() => parseCubeLut(text)).toThrow("Incomplete");
  });

  it("applies DOMAIN_MIN/MAX scaling", () => {
    const size = 2;
    const lines = [
      `LUT_3D_SIZE ${size}`,
      "DOMAIN_MIN 0.0 0.0 0.0",
      "DOMAIN_MAX 2.0 2.0 2.0",
      "2.0 1.0 0.0",
      "2.0 1.0 0.0",
      "2.0 1.0 0.0",
      "2.0 1.0 0.0",
      "2.0 1.0 0.0",
      "2.0 1.0 0.0",
      "2.0 1.0 0.0",
      "2.0 1.0 0.0",
    ];
    const parsed = parseCubeLut(lines.join("\n"));
    expect(parsed.data[0]).toBe(1.0);
    expect(parsed.data[1]).toBe(0.5);
    expect(parsed.data[2]).toBe(0.0);
  });
});

describe("sampleCubeLut", () => {
  it("returns the original color from an identity cube", () => {
    const parsed = parseCubeLut(identityCube(8));
    const [r, g, b] = sampleCubeLut(parsed, 0.25, 0.5, 0.75);
    expect(r).toBeCloseTo(0.25, 2);
    expect(g).toBeCloseTo(0.5, 2);
    expect(b).toBeCloseTo(0.75, 2);
  });
});

describe("cubeToFlatLutImageData", () => {
  it("produces a 512x512 RGBA image", () => {
    const parsed = parseCubeLut(identityCube(4));
    const image = cubeToFlatLutImageData(parsed);
    expect(image.width).toBe(512);
    expect(image.height).toBe(512);
    expect(image.data.length).toBe(512 * 512 * 4);
  });

  it("preserves identity mapping at the tile centers", () => {
    const parsed = parseCubeLut(identityCube(8));
    const image = cubeToFlatLutImageData(parsed);

    // Pick a tile for blue ≈ 0.5 (tile index 32 out of 63 gives b ≈ 0.51).
    const tileSize = 64;
    const tileCol = 0;
    const tileRow = 4;
    // Center of the tile, quarter from the left, three quarters from the top:
    // r = 0.25, g = 0.75, b = tileIndex / 63.
    const x = tileCol * tileSize + Math.floor(0.25 * (tileSize - 1));
    const y = tileRow * tileSize + Math.floor(0.75 * (tileSize - 1));
    const i = (y * 512 + x) * 4;

    const r = image.data[i + 0] / 255;
    const g = image.data[i + 1] / 255;
    const b = image.data[i + 2] / 255;

    expect(r).toBeCloseTo(0.25, 1);
    expect(g).toBeCloseTo(0.75, 1);
    expect(b).toBeCloseTo(32 / 63, 1);
  });
});
