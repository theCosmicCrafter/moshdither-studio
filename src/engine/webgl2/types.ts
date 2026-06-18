export interface EffectShader {
  id: string;
  name: string;
  vertexSource: string;
  fragmentSource: string;
  uniforms: UniformDef[];
}

export interface UniformDef {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D' | 'int' | 'bool';
  default: number | number[] | boolean;
}

export interface RenderPass {
  shaderId: string;
  inputTexture: string;
  outputFramebuffer: string;
  uniforms: Record<string, number | number[] | boolean>;
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
