/**
 * GPU capability detection and graceful degradation.
 *
 * Detects WebGL2 support, GPU memory, renderer string,
 * and provides fallback recommendations.
 */

export interface GPUInfo {
  renderer: string;
  vendor: string;
  unmaskedRenderer: string;
  unmaskedVendor: string;
  maxTextureSize: number;
  maxViewportDims: [number, number];
  maxRenderbufferSize: number;
  maxVertexAttribs: number;
  maxVertexUniforms: number;
  maxFragmentUniforms: number;
  supportsFloatTextures: boolean;
  supportsHalfFloatTextures: boolean;
  supportsWebGL2: boolean;
  maxSamples: number; // MSAA samples
}

let _cachedGPUInfo: GPUInfo | null = null;

function getDebugInfo(gl: WebGL2RenderingContext | WebGLRenderingContext): GPUInfo {
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");

  const renderer = dbg
    ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "unknown"
    : (gl.getParameter(gl.RENDERER) as string) || "unknown";

  const vendor = dbg
    ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "unknown"
    : (gl.getParameter(gl.VENDOR) as string) || "unknown";

  const isWebGL2 = gl instanceof WebGL2RenderingContext;

  return {
    renderer: (gl.getParameter(gl.RENDERER) as string) || "unknown",
    vendor: (gl.getParameter(gl.VENDOR) as string) || "unknown",
    unmaskedRenderer: renderer,
    unmaskedVendor: vendor,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxViewportDims: [
      gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.[0] ?? 0,
      gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.[1] ?? 0,
    ],
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number,
    maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number,
    maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number,
    supportsFloatTextures: isWebGL2
      ? true
      : !!gl.getExtension("OES_texture_float"),
    supportsHalfFloatTextures: isWebGL2
      ? true
      : !!gl.getExtension("OES_texture_half_float"),
    supportsWebGL2: isWebGL2,
    maxSamples: isWebGL2 ? gl.getParameter(gl.MAX_SAMPLES) as number : 0,
  };
}

/**
 * Detect GPU capabilities. Caches result after first call.
 */
export function detectGPU(): GPUInfo | null {
  if (_cachedGPUInfo) return _cachedGPUInfo;

  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl2") ||
    canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl");
  if (!gl) {
    return null;
  }

  _cachedGPUInfo = getDebugInfo(gl as WebGL2RenderingContext);
  return _cachedGPUInfo;
}

/**
 * Check if the GPU supports the features needed by MoshDither.
 */
export function checkGPUSupport(): {
  supported: boolean;
  warnings: string[];
  recommendedQuality: "full" | "reduced" | "software";
} {
  const info = detectGPU();
  const warnings: string[] = [];

  if (!info) {
    return {
      supported: false,
      warnings: ["WebGL is not supported in this browser."],
      recommendedQuality: "software",
    };
  }

  if (!info.supportsWebGL2) {
    warnings.push("WebGL 2 is not available. Some effects may be disabled.");
  }

  if (info.maxTextureSize < 4096) {
    warnings.push(
      `GPU max texture size (${info.maxTextureSize}) may limit 4K preview quality.`,
    );
  }

  // Detect low-end GPUs by renderer string heuristics
  const lowerRenderer = info.unmaskedRenderer.toLowerCase();
  const isIntegrated =
    lowerRenderer.includes("intel") ||
    lowerRenderer.includes("iris") ||
    lowerRenderer.includes("uhd");
  const isSoftware = lowerRenderer.includes("llvmpipe") || lowerRenderer.includes("swiftshader");

  if (isSoftware) {
    warnings.push("Software renderer detected. Performance will be very limited.");
    return {
      supported: true,
      warnings,
      recommendedQuality: "software",
    };
  }

  if (isIntegrated && info.maxTextureSize < 8192) {
    warnings.push("Integrated GPU detected. Proxy media recommended for 4K+ footage.");
    return {
      supported: true,
      warnings,
      recommendedQuality: "reduced",
    };
  }

  return {
    supported: true,
    warnings,
    recommendedQuality: "full",
  };
}

/**
 * Estimate available GPU memory (very rough heuristic based on renderer).
 */
export function estimateGPUMemoryMB(): number | null {
  const info = detectGPU();
  if (!info) return null;

  const r = info.unmaskedRenderer.toLowerCase();
  if (r.includes("rtx") || r.includes("geforce")) {
    if (r.includes("4090") || r.includes("4080")) return 16384;
    if (r.includes("4070") || r.includes("3090")) return 12288;
    if (r.includes("4060") || r.includes("3070")) return 8192;
    return 6144;
  }
  if (r.includes("amd") || r.includes("radeon")) {
    if (r.includes("7900")) return 20480;
    if (r.includes("6900")) return 16384;
    return 8192;
  }
  if (r.includes("apple")) {
    if (r.includes("m3 max")) return 36864;
    if (r.includes("m3")) return 18432;
    if (r.includes("m2")) return 10240;
    return 8192;
  }
  if (r.includes("intel") || r.includes("iris")) return 2048;
  return 4096;
}
