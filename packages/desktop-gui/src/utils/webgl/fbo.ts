/**
 * Framebuffer / Texture pair factory.
 *
 * Based on glsl-playground/src/renderer.js createFramebufferTexturePair()
 * Creates a properly-configured FBO + texture for offscreen rendering.
 */

export interface FramebufferTexturePair {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/**
 * Create a framebuffer and backing texture with standard post-processing
 * parameters: RGBA8, LINEAR filtering, CLAMP_TO_EDGE wrapping.
 */
export function createFramebufferTexturePair(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  options?: {
    internalFormat?: number;
    format?: number;
    type?: number;
    minFilter?: number;
    magFilter?: number;
    wrapS?: number;
    wrapT?: number;
  },
): FramebufferTexturePair {
  const {
    internalFormat = gl.RGBA,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    minFilter = gl.LINEAR,
    magFilter = gl.LINEAR,
    wrapS = gl.CLAMP_TO_EDGE,
    wrapT = gl.CLAMP_TO_EDGE,
  } = options ?? {};

  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create texture for FBO");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    format,
    type,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) {
    gl.deleteTexture(texture);
    throw new Error("Failed to create framebuffer");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }

  return { framebuffer, texture, width, height };
}

/**
 * Resize an existing FBO/texture pair to new dimensions.
 * Deletes old texture, creates new one, re-attaches to framebuffer.
 */
export function resizeFramebufferTexturePair(
  gl: WebGL2RenderingContext,
  pair: FramebufferTexturePair,
  newWidth: number,
  newHeight: number,
  options?: {
    internalFormat?: number;
    format?: number;
    type?: number;
    minFilter?: number;
    magFilter?: number;
    wrapS?: number;
    wrapT?: number;
  },
): FramebufferTexturePair {
  // Delete old texture
  gl.deleteTexture(pair.texture);

  const {
    internalFormat = gl.RGBA,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    minFilter = gl.LINEAR,
    magFilter = gl.LINEAR,
    wrapS = gl.CLAMP_TO_EDGE,
    wrapT = gl.CLAMP_TO_EDGE,
  } = options ?? {};

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    newWidth,
    newHeight,
    0,
    format,
    type,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);

  gl.bindFramebuffer(gl.FRAMEBUFFER, pair.framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(pair.framebuffer);
    gl.deleteTexture(texture);
    throw new Error(`Resized framebuffer incomplete: 0x${status.toString(16)}`);
  }

  return { framebuffer: pair.framebuffer, texture, width: newWidth, height: newHeight };
}

/**
 * Dispose of a framebuffer/texture pair, freeing GPU resources.
 */
export function disposeFramebufferTexturePair(
  gl: WebGL2RenderingContext,
  pair: FramebufferTexturePair,
): void {
  if (pair.framebuffer) {
    gl.deleteFramebuffer(pair.framebuffer);
  }
  if (pair.texture) {
    gl.deleteTexture(pair.texture);
  }
}
