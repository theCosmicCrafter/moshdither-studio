import { WebGLContext } from "./WebGLContext";

export class MediaUploader {
  private gl: WebGL2RenderingContext;

  constructor(ctx: WebGLContext) {
    this.gl = ctx.getGL();
  }

  async uploadImage(url: string): Promise<WebGLTexture> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    return this.createTextureFromImage(img);
  }

  createTextureFromImage(
    img: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ): WebGLTexture {
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

  async uploadVideo(url: string): Promise<HTMLVideoElement> {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.oncanplay = () => resolve();
      video.onerror = reject;
      video.src = url;
    });
    video.play();
    return video;
  }

  updateVideoTexture(tex: WebGLTexture, video: HTMLVideoElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
