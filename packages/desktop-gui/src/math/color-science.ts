// Implements math-correct color science from didder (Go) and dithers (Rust)

export function srgbToLinear(c: number): number {
  const norm = c / 255.0;
  return norm <= 0.04045 
   ? norm / 12.92 
    : Math.pow((norm + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 
   ? c * 12.92 
    : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(s * 255)));
}

// CIE 1931 human perceived luminance calculation
export function perceivedLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function colorDistance(c1: [number, number, number], c2: [number, number, number]): number {
  const r1 = srgbToLinear(c1[0]);
  const g1 = srgbToLinear(c1[1]);
  const b1 = srgbToLinear(c1[2]);
  
  const r2 = srgbToLinear(c2[0]);
  const g2 = srgbToLinear(c2[1]);
  const b2 = srgbToLinear(c2[2]);
  
  // Perceptually-weighted Euclidean distance
  return Math.sqrt(
    0.2126 * Math.pow(r1 - r2, 2) +
    0.7152 * Math.pow(g1 - g2, 2) +
    0.0722 * Math.pow(b1 - b2, 2)
  );
}
