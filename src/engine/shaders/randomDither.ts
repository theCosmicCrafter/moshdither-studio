import { EffectShader } from '../webgl2/types';

export const randomDitherShader: EffectShader = {
  id: 'random_dither',
  name: 'Random Dither',
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

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      // Rust (random_noise.rs) perturbs luminance by a per-pixel random
      // value spanning the FULL [0, 255] range before thresholding at the
      // midpoint -- equivalent to +/-0.5 in this shader's normalized [0,1]
      // luma space. The previous '* amount' alone only reached +/-0.25 at
      // amount's default of 0.5; the extra *2.0 restores the full range at
      // that same default.
      float noise = (rand(vUv) - 0.5) * amount * 2.0;
      float t = step(0.5 - noise, lum);
      gl_FragColor = vec4(vec3(t), color.a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.5 },
  ],
};
