import { EffectShader } from '../webgl2/types';

export const audioReactivePixelateShader: EffectShader = {
  id: 'audioReactivePixelate',
  name: 'Audio Reactive Pixelate',
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
    uniform float u_energy;
    uniform float u_minBlock;
    uniform float u_maxBlock;

    varying vec2 vUv;

    void main() {
      float blockSize = mix(u_minBlock, u_maxBlock, u_energy);
      if (blockSize <= 1.0) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 res = vec2(1920.0, 1080.0); // approx; real uniform preferred
      vec2 block = blockSize / res;
      vec2 uv = floor(vUv / block) * block + block * 0.5;
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: 'u_energy', type: 'float', default: 0.0 },
    { name: 'u_minBlock', type: 'float', default: 2.0 },
    { name: 'u_maxBlock', type: 'float', default: 64.0 },
  ],
};
