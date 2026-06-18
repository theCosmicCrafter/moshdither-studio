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
      float noise = (rand(vUv) - 0.5) * amount;
      float t = step(0.5 - noise, lum);
      gl_FragColor = vec4(vec3(t), color.a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.5 },
  ],
};
