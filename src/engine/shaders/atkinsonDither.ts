import { EffectShader } from '../webgl2/types';

export const atkinsonDitherShader: EffectShader = {
  id: 'atkinson_dither',
  name: 'Atkinson Dither',
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
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float levels = 4.0;
      float q = floor(lum * levels + 0.5) / levels;
      gl_FragColor = vec4(vec3(q), color.a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.5 },
  ],
};
