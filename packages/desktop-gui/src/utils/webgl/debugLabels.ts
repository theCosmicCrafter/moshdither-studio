/**
 * WebGL debug labels for Spector.js / browser DevTools.
 *
 * Uses EXT_debug_marker (available in Chrome/Firefox) to name
 * shader groups so they show up with human-readable names in
 * debugging tools. Also stores labels on objects as metadata.
 */

interface DebugLabeled {
  __debugLabel?: string;
}

let _labelExt: {
  pushGroupMarkerEXT: (name: string) => void;
  popGroupMarkerEXT: () => void;
} | null = null;

export function initDebugLabels(gl: WebGL2RenderingContext): void {
  _labelExt = gl.getExtension(
    "EXT_debug_marker",
  ) as unknown as typeof _labelExt;
}

/**
 * Label a WebGL object for debugging tools.
 * Falls back silently if no debug extension is available.
 */
export function labelObject(
  object:
    | WebGLProgram
    | WebGLShader
    | WebGLTexture
    | WebGLFramebuffer
    | WebGLBuffer
    | WebGLVertexArrayObject,
  name: string,
): void {
  (object as DebugLabeled).__debugLabel = name;
}

/**
 * Get the debug label of a WebGL object (our own metadata if no native ext).
 */
export function getObjectLabel(
  object:
    | WebGLProgram
    | WebGLShader
    | WebGLTexture
    | WebGLFramebuffer
    | WebGLBuffer
    | WebGLVertexArrayObject,
): string | undefined {
  return (object as DebugLabeled).__debugLabel;
}

/**
 * Push a debug group marker (for GPU trace tools).
 */
export function pushDebugGroup(name: string): void {
  _labelExt?.pushGroupMarkerEXT(name);
}

/**
 * Pop a debug group marker.
 */
export function popDebugGroup(): void {
  _labelExt?.popGroupMarkerEXT();
}
