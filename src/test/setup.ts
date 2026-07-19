import "@testing-library/jest-dom";

// jsdom does not provide ImageData; provide a minimal polyfill for tests
// that exercise LUT/pixel utilities.
if (!globalThis.ImageData) {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data;
      this.width = width;
      this.height = height ?? data.length / (width * 4);
    }
  }
  // @ts-expect-error Polyfilling browser API in jsdom.
  globalThis.ImageData = ImageDataPolyfill;
}
