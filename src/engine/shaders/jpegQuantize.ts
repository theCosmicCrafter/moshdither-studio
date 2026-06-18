import { EffectShader } from '../webgl2/types';

export const jpegQuantizeShader: EffectShader = {
  id: 'jpeg_quantize',
  name: 'JPEG Quantize',
  vertexSource: `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 vUv;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      vUv = a_texCoord;
    }
  `,
  fragmentSource: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float quality;
    varying vec2 vUv;

    void main() {
      float block = 8.0 + (1.0 - quality) * 56.0;
      vec2 uv = floor(vUv * resolution / block) * block / resolution;
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: 'quality', type: 'float', default: 0.5 },
  ],
};
