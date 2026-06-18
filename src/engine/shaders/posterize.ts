import { EffectShader } from '../webgl2/types';

export const posterizeShader: EffectShader = {
  id: 'posterize',
  name: 'Posterize',
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
    uniform float levels;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float l = max(levels, 1.0);
      vec3 posterized = floor(col.rgb * l) / l;
      gl_FragColor = vec4(posterized, col.a);
    }
  `,
  uniforms: [
    { name: 'levels', type: 'float', default: 4.0 },
  ],
};
