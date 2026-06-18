import { EffectShader } from '../webgl2/types';

export const solarizeShader: EffectShader = {
  id: 'solarize',
  name: 'Solarize',
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
    uniform float threshold;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;
      c.r = c.r > threshold ? 1.0 - c.r : c.r;
      c.g = c.g > threshold ? 1.0 - c.g : c.g;
      c.b = c.b > threshold ? 1.0 - c.b : c.b;
      gl_FragColor = vec4(c, color.a);
    }
  `,
  uniforms: [
    { name: 'threshold', type: 'float', default: 0.5 },
  ],
};
