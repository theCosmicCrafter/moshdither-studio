import { EffectShader } from '../webgl2/types';

export const pixelateShader: EffectShader = {
  id: 'pixelate',
  name: 'Pixelate',
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
    uniform float blockSize;
    varying vec2 vUv;

    void main() {
      vec2 block = vec2(blockSize) / resolution;
      vec2 uv = floor(vUv / block) * block + block * 0.5;
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: 'blockSize', type: 'float', default: 8.0 },
  ],
};
