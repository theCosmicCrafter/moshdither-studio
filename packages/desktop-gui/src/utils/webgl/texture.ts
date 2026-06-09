/**
 * Texture utilities for MoshDither Studio.
 *
 * Based on glsl-playground/src/textureManager.js
 * - resizeImage: downscale oversized textures before GPU upload
 * - uploadImageToTexture: safe texture upload with flip-y
 */

/**
 * Downscale an image (as data URL) to a maximum dimension before GPU upload.
 * Returns a Promise resolving to a new data URL or the original if no resize needed.
 */
export function resizeImage(dataURL: string, maxSize = 512): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxSize && height <= maxSize) {
        resolve(dataURL);
        return;
      }
      const scale = Math.min(maxSize / width, maxSize / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataURL);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

/**
 * Upload an image/video element to a WebGL texture with standard parameters.
 */
export function uploadImageToTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  source: HTMLImageElement | HTMLVideoElement | ImageBitmap,
  options?: {
    flipY?: boolean;
    wrapS?: number;
    wrapT?: number;
    minFilter?: number;
    magFilter?: number;
  },
): void {
  const {
    flipY = true,
    wrapS = gl.CLAMP_TO_EDGE,
    wrapT = gl.CLAMP_TO_EDGE,
    minFilter = gl.LINEAR,
    magFilter = gl.LINEAR,
  } = options ?? {};

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY ? 1 : 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
  gl.bindTexture(gl.TEXTURE_2D, null);
}
