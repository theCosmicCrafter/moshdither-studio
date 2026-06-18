import { EffectShader } from '../webgl2/types';

export const waveDistortShader: EffectShader = {
  id: 'wave_distort',
  name: 'Wave Distort',
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
    uniform float amount;
    uniform float frequency;
    uniform float time;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      uv.x += sin(uv.y * frequency + time) * amount * 0.05;
      uv.y += cos(uv.x * frequency + time) * amount * 0.05;
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.5 },
    { name: 'frequency', type: 'float', default: 10.0 },
    { name: 'time', type: 'float', default: 0.0 },
  ],
};
