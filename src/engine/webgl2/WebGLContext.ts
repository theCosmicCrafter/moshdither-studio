export interface WebGLContextCallbacks {
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export class WebGLContext {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private programs: Map<string, WebGLProgram> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();
  private framebuffers: Map<string, WebGLFramebuffer> = new Map();
  private contextLost = false;
  private onContextLost?: () => void;
  private onContextRestored?: () => void;

  constructor(canvas: HTMLCanvasElement, callbacks?: WebGLContextCallbacks) {
    this.canvas = canvas;
    this.onContextLost = callbacks?.onContextLost;
    this.onContextRestored = callbacks?.onContextRestored;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored, false);
  }

  private handleContextLost = (e: Event) => {
    // Prevent the browser's default behavior so the context can be restored.
    e.preventDefault();
    if (this.contextLost) return;
    this.contextLost = true;
    console.error("[WebGLContext] WebGL context lost");
    this.onContextLost?.();
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    console.log("[WebGLContext] WebGL context restored — reinitializing state");
    this.reset();
    this.onContextRestored?.();
  };

  /**
   * Drop all cached GL resources. Call this after the context is restored so
   * previously allocated textures/buffers/programs are not reused.
   */
  reset() {
    this.programs.clear();
    this.textures.clear();
    this.framebuffers.clear();
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  isContextLost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  getGL(): WebGL2RenderingContext {
    return this.gl;
  }

  private ensureContext() {
    if (this.isContextLost()) {
      throw new Error("WebGL context is lost");
    }
  }

  createShader(type: number, source: string): WebGLShader {
    this.ensureContext();
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
  }

  getOrCreateProgram(name: string, vertSrc: string, fragSrc: string): WebGLProgram {
    this.ensureContext();
    if (this.programs.has(name)) return this.programs.get(name)!;
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    // Bind attribute locations BEFORE linking so they match FullscreenQuad's VAO (0=pos, 1=texCoord)
    gl.bindAttribLocation(program, 0, "a_position");
    gl.bindAttribLocation(program, 1, "a_texCoord");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    this.programs.set(name, program);
    return program;
  }

  createTexture(name: string, width: number, height: number, data?: Uint8Array): WebGLTexture {
    this.ensureContext();
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data || null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.textures.set(name, tex);
    return tex;
  }

  getTexture(name: string): WebGLTexture | undefined {
    return this.textures.get(name);
  }

  createFramebuffer(name: string, texture: WebGLTexture): WebGLFramebuffer {
    this.ensureContext();
    const gl = this.gl;
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Framebuffer incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.framebuffers.set(name, fb);
    return fb;
  }

  getFramebuffer(name: string): WebGLFramebuffer | undefined {
    return this.framebuffers.get(name);
  }

  resize(width: number, height: number) {
    if (this.isContextLost()) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost, false);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored, false);
    const gl = this.gl;
    this.programs.forEach((p) => gl.deleteProgram(p));
    this.textures.forEach((t) => gl.deleteTexture(t));
    this.framebuffers.forEach((f) => gl.deleteFramebuffer(f));
    this.programs.clear();
    this.textures.clear();
    this.framebuffers.clear();
  }
}
