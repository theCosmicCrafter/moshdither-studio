import { convertFileSrc } from "../../lib/tauri";
import { cubeToFlatLutImageData, parseCubeLut } from "../../utils/parseLut";
import { WebGLContext } from "../webgl2/WebGLContext";

export interface LUTPreset {
  name: string;
  url: string;
}

export const LUT_PRESETS: LUTPreset[] = [
  // Instagram-style presets
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
  // Film / Movie looks
  { name: "Analog Film 01", url: "/lut/analog_film_01.png" },
  { name: "Dramatic 01", url: "/lut/dramatic_01.png" },
  { name: "Motion Picture 01", url: "/lut/motion_picture_01.png" },
  { name: "High Contrast 01", url: "/lut/high_contrast_01.png" },
  { name: "CinePrint 160T", url: "/lut/cineprint_160t.png" },
  { name: "CinePrint 250D", url: "/lut/cineprint_250d.png" },
  { name: "CinePrint 500T", url: "/lut/cineprint_500t.png" },
  { name: "Kodak 250D", url: "/lut/kodak_250d.png" },
  { name: "28 Days Later", url: "/lut/movie_28_days.png" },
  { name: "300", url: "/lut/movie_300.png" },
  { name: "3:10 to Yuma", url: "/lut/movie_yuma.png" },
  // Cinematic / Creative
  { name: "Cinematica 01", url: "/lut/cinematica_01.png" },
  { name: "Hollywood Tones", url: "/lut/hollywood_tones.png" },
  { name: "Back to the Future", url: "/lut/back_to_future.png" },
  { name: "Futuristic 01", url: "/lut/futuristic_01.png" },
  { name: "Sci-Fi 01", url: "/lut/sci_fi_01.png" },
  { name: "Midnight", url: "/lut/midnight.png" },
  { name: "Cyber Night", url: "/lut/cyber_night.png" },
  { name: "Vintage Action", url: "/lut/vintage_action.png" },
  { name: "Vintage Blockbuster", url: "/lut/vintage_blockbuster.png" },
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
    // Defensive: ensure LUT images are not flipped by leftover UNPACK_FLIP_Y state.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
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

/// Load a custom LUT from disk. PNGs use the asset protocol directly;
/// .cube files are parsed and converted to a 512×512 preview texture.
export async function loadCustomLUT(
  filePath: string
): Promise<{ previewUrl: string; filePath: string }> {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") {
    return { previewUrl: convertFileSrc(filePath), filePath };
  }
  if (ext === "cube") {
    const response = await fetch(convertFileSrc(filePath));
    if (!response.ok) {
      throw new Error(`Failed to read .cube file: ${response.statusText}`);
    }
    const text = await response.text();
    const parsed = parseCubeLut(text);
    const imageData = cubeToFlatLutImageData(parsed);

    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create 2D canvas context");
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))),
        "image/png"
      );
    });
    const previewUrl = URL.createObjectURL(blob);
    return { previewUrl, filePath };
  }
  throw new Error(`Unsupported LUT extension: ${ext ?? "none"}`);
}
