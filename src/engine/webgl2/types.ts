export interface EffectShader {
  id: string;
  name: string;
  vertexSource: string;
  fragmentSource: string;
  uniforms: UniformDef[];
  /** True when the shader's own math reads u_time/u_frame to produce a
   * continuously-changing image (motion, flicker, scrolling noise) even
   * with a static source and no playback. The live-preview render loop uses
   * this to decide whether it needs to keep re-rendering every frame, or can
   * render once and stop -- most effects (dithering, color, pixel geometry)
   * produce identical output every frame for a static image and gain
   * nothing from a perpetual 60fps loop. Omit (or false) for those. */
  animated?: boolean;
}

export interface UniformDef {
  name: string;
  type: "float" | "vec2" | "vec3" | "vec4" | "sampler2D" | "int" | "bool";
  default: number | number[] | boolean | string;
}

export interface RenderPass {
  shaderId: string;
  inputTexture: string;
  outputFramebuffer: string;
  uniforms: Record<string, number | number[] | boolean | string>;
  maskB64?: string | null;
  maskMode?: "inside" | "outside" | "alpha";
}

export const FULLSCREEN_QUAD_VERT = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 vUv;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    vUv = a_texCoord;
  }
`;
