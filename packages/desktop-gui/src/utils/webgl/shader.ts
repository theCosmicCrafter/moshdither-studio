/**
 * Shader compilation utilities with fallback support.
 *
 * Based on glsl-playground/src/renderer.js
 * - createProgramFromSources: compiles vertex + fragment with error handling
 * - compileBrokenShader: creates a safe fallback so canvas never goes black
 * - sanitizeShaderSource: strips BOM characters before compilation
 */

export interface ShaderSources {
  vertex: string;
  fragment: string;
}

export class ShaderCompileError extends Error {
  public readonly stage: "vertex" | "fragment" | "link";
  public readonly log: string;
  public readonly source: string;

  constructor(
    stage: "vertex" | "fragment" | "link",
    log: string,
    source: string,
  ) {
    super(`Shader ${stage} error: ${log}`);
    this.stage = stage;
    this.log = log;
    this.source = source;
  }
}

/**
 * Strip BOM characters and trim shader source before compilation.
 */
export function sanitizeShaderSource(src: string): string {
  return src.replace(/^\uFEFF/, "").trim();
}

function compileSingleShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new ShaderCompileError(
      type === gl.VERTEX_SHADER ? "vertex" : "fragment",
      "Failed to create shader object",
      source,
    );
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Unknown error";
    gl.deleteShader(shader);
    throw new ShaderCompileError(
      type === gl.VERTEX_SHADER ? "vertex" : "fragment",
      log,
      source,
    );
  }

  return shader;
}

/**
 * Compile a vertex + fragment shader pair and link into a program.
 * Throws ShaderCompileError on failure.
 */
export function createProgramFromSources(
  gl: WebGL2RenderingContext,
  vertexSrc: string,
  fragmentSrc: string,
): WebGLProgram {
  const vs = compileSingleShader(
    gl,
    gl.VERTEX_SHADER,
    sanitizeShaderSource(vertexSrc),
  );
  const fs = compileSingleShader(
    gl,
    gl.FRAGMENT_SHADER,
    sanitizeShaderSource(fragmentSrc),
  );

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new ShaderCompileError("link", "Failed to create program object", "");
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  // Clean up shaders (program retains compiled copies)
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Unknown link error";
    gl.deleteProgram(program);
    throw new ShaderCompileError("link", log, fragmentSrc);
  }

  return program;
}

/**
 * Create a safe "broken" fallback program that renders a solid color.
 * Used when user shader compilation fails so the canvas never goes black.
 */
const FALLBACK_VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FALLBACK_FRAGMENT = `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.8, 0.1, 0.1, 1.0); // Error red
}`;

export function compileBrokenShader(
  gl: WebGL2RenderingContext,
): WebGLProgram | null {
  try {
    return createProgramFromSources(gl, FALLBACK_VERTEX, FALLBACK_FRAGMENT);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shader Program Cache
// ---------------------------------------------------------------------------

const programCache = new Map<string, WebGLProgram>();

function hashShaderPair(vertexSrc: string, fragmentSrc: string): string {
  // Simple hash: first 64 chars of each + lengths
  const v = sanitizeShaderSource(vertexSrc);
  const f = sanitizeShaderSource(fragmentSrc);
  return `${v.length}-${f.length}-${v.slice(0, 64)}-${f.slice(0, 64)}`;
}

/**
 * Get or create a compiled WebGLProgram keyed by (vertex, fragment) source.
 * Programs persist until explicitly cleared — useful for effect toggling where
 * the same shader is compiled repeatedly.
 */
export function getOrCreateProgram(
  gl: WebGL2RenderingContext,
  vertexSrc: string,
  fragmentSrc: string,
): WebGLProgram {
  const key = hashShaderPair(vertexSrc, fragmentSrc);
  let prog = programCache.get(key);
  if (!prog || !gl.isProgram(prog)) {
    prog = createProgramFromSources(gl, vertexSrc, fragmentSrc);
    programCache.set(key, prog);
  }
  return prog;
}

/** Clear the global shader program cache. Call on context loss / app quit. */
export function clearProgramCache(): void {
  programCache.clear();
}

/** Delete a single cached program and remove it from the cache. */
export function deleteCachedProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): void {
  for (const [key, prog] of programCache) {
    if (prog === program) {
      programCache.delete(key);
      break;
    }
  }
  gl.deleteProgram(program);
}

/**
 * Cached uniform location lookup to avoid repeated getUniformLocation calls.
 */
export class UniformCache {
  private cache = new Map<
    WebGLProgram,
    Map<string, WebGLUniformLocation | null>
  >();

  getLocation(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
  ): WebGLUniformLocation | null {
    let programCache = this.cache.get(program);
    if (!programCache) {
      programCache = new Map();
      this.cache.set(program, programCache);
    }
    let loc = programCache.get(name);
    if (loc === undefined) {
      loc = gl.getUniformLocation(program, name);
      programCache.set(name, loc);
    }
    return loc;
  }

  clear(): void {
    this.cache.clear();
  }

  deleteProgram(program: WebGLProgram): void {
    this.cache.delete(program);
  }
}

/**
 * Convenience setters using the uniform cache.
 */
export function setUniform1f(
  gl: WebGL2RenderingContext,
  cache: UniformCache,
  program: WebGLProgram,
  name: string,
  val: number,
): void {
  const loc = cache.getLocation(gl, program, name);
  if (loc !== null) gl.uniform1f(loc, val);
}

export function setUniform1i(
  gl: WebGL2RenderingContext,
  cache: UniformCache,
  program: WebGLProgram,
  name: string,
  val: number,
): void {
  const loc = cache.getLocation(gl, program, name);
  if (loc !== null) gl.uniform1i(loc, val);
}

export function setUniform2f(
  gl: WebGL2RenderingContext,
  cache: UniformCache,
  program: WebGLProgram,
  name: string,
  x: number,
  y: number,
): void {
  const loc = cache.getLocation(gl, program, name);
  if (loc !== null) gl.uniform2f(loc, x, y);
}
