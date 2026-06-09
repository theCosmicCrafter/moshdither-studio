/**
 * Generates an ordered dither threshold matrix (Bayer matrix).
 * Recursive calculation:
 * M_{2N} = (1 / 4(2N)^2) * [ 4M_N,       4M_N + 2 ]
 *                          [ 4M_N + 3,   4M_N + 1 ]
 * 
 * To avoid floating point math during generation, we generate the unnormalized integer matrix,
 * then return it along with the divisor (which is the area, N^2).
 */

export function generateBayerMatrix(size: number): { matrix: number[][], divisor: number } {
  // Only powers of 2 are supported for standard Bayer matrices.
  if ((size & (size - 1)) !== 0 || size < 2) {
    throw new Error("Size must be a power of 2 (e.g., 2, 4, 8, 16)");
  }

  // Base 2x2 matrix
  let current: number[][] = [
    [0, 2],
    [3, 1]
  ];

  let currentSize = 2;

  while (currentSize < size) {
    const nextSize = currentSize * 2;
    const next: number[][] = Array.from({ length: nextSize }, () => new Array(nextSize).fill(0));

    for (let y = 0; y < currentSize; y++) {
      for (let x = 0; x < currentSize; x++) {
        const val = current[y][x] * 4;
        
        // Top-left: 4M_N
        next[y][x] = val;
        // Top-right: 4M_N + 2
        next[y][x + currentSize] = val + 2;
        // Bottom-left: 4M_N + 3
        next[y + currentSize][x] = val + 3;
        // Bottom-right: 4M_N + 1
        next[y + currentSize][x + currentSize] = val + 1;
      }
    }

    current = next;
    currentSize = nextSize;
  }

  return {
    matrix: current,
    divisor: size * size
  };
}
