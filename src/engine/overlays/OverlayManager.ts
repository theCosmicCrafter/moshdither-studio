import { WebGLContext } from "../webgl2/WebGLContext";

export interface OverlayPreset {
  name: string;
  url: string;
}

export const OVERLAY_PRESETS: OverlayPreset[] = [
  { name: "Film Burn", url: "/overlays/burn.mp4" },
  { name: "Dust", url: "/overlays/dust.mp4" },
  { name: "VHS Static", url: "/overlays/vhs-static.mp4" },
];

export type BlendMode = "normal" | "screen" | "multiply" | "overlay" | "lighten" | "colordodge";

export class OverlayManager {
  private gl: WebGL2RenderingContext;
  private videos: Map<string, HTMLVideoElement> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();

  constructor(ctx: WebGLContext) {
    this.gl = ctx.getGL();
  }

  async loadOverlay(url: string): Promise<WebGLTexture> {
    if (this.textures.has(url)) return this.textures.get(url)!;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.oncanplay = () => resolve();
      video.onerror = reject;
      if (video.readyState >= 3) resolve();
    });

    video.play();
    this.videos.set(url, video);

    const tex = this.gl.createTexture()!;
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      video
    );
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);

    this.textures.set(url, tex);
    return tex;
  }

  updateTextures() {
    const gl = this.gl;
    this.videos.forEach((video, url) => {
      const tex = this.textures.get(url);
      if (!tex) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
    });
  }

  getVideo(url: string): HTMLVideoElement | undefined {
    return this.videos.get(url);
  }

  getTexture(url: string): WebGLTexture | undefined {
    return this.textures.get(url);
  }

  destroy() {
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    this.videos.forEach((v) => {
      v.pause();
      v.src = "";
    });
    this.textures.clear();
    this.videos.clear();
  }
}
