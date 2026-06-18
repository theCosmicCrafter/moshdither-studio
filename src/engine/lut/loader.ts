import { WebGLContext } from "../webgl2/WebGLContext";

export interface LUTPreset {
  name: string;
  url: string;
}

export const LUT_PRESETS: LUTPreset[] = [
  { name: "Amatorka", url: "/lut/amatorka.png" },
  { name: "Brannan", url: "/lut/brannan.png" },
  { name: "Earlybird", url: "/lut/earlybird.png" },
  { name: "Etikate", url: "/lut/etikate.png" },
  { name: "Gotham", url: "/lut/gotham.png" },
  { name: "Hefe", url: "/lut/hefe.png" },
  { name: "Inkwell", url: "/lut/inkwell.png" },
  { name: "Kelvin", url: "/lut/kelvin.png" },
  { name: "Lofi", url: "/lut/lofi.png" },
  { name: "Nashville", url: "/lut/nashville.png" },
  { name: "Sutro", url: "/lut/sutro.png" },
  { name: "Toaster", url: "/lut/toaster.png" },
  { name: "Walden", url: "/lut/walden.png" },
  { name: "X-Pro", url: "/lut/xpro.png" },
];

export class LUTLoader {
  private gl: WebGL2RenderingContext;
  private cache: Map<string, WebGLTexture> = new Map();

  constructor(ctx: WebGLContext) {
    this.gl = ctx.getGL();
  }

  async loadLUT(url: string): Promise<WebGLTexture> {
    if (this.cache.has(url)) return this.cache.get(url)!;

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    // Validate dimensions - must be 512x512 for 64^3 LUT
    if (img.width !== 512 || img.height !== 512) {
      console.warn(
        `LUT ${url} has unexpected dimensions: ${img.width}x${img.height}. Expected 512x512.`
      );
    }

    const tex = this.createTextureFromImage(img);
    this.cache.set(url, tex);
    return tex;
  }

  private createTextureFromImage(img: HTMLImageElement): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  clearCache() {
    const gl = this.gl;
    this.cache.forEach((t) => gl.deleteTexture(t));
    this.cache.clear();
  }
}
