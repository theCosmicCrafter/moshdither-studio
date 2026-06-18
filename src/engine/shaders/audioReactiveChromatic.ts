import { EffectShader } from '../webgl2/types';

export const audioReactiveChromaticShader: EffectShader = {
  id: 'audioReactiveChromatic',
  name: 'Audio Reactive Chromatic',
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
    uniform float u_flux;
    uniform float u_maxShift;
    uniform vec2 u_direction;

    varying vec2 vUv;

    void main() {
      float shift = u_flux * u_maxShift;
      vec2 dir = normalize(u_direction);
      if (length(dir) == 0.0) dir = vec2(1.0, 0.0);
      vec2 offset = dir * shift;

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;

      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
  uniforms: [
    { name: 'u_flux', type: 'float', default: 0.0 },
    { name: 'u_maxShift', type: 'float', default: 0.03 },
    { name: 'u_direction', type: 'vec2', default: [1.0, 0.0] },
  ],
};
