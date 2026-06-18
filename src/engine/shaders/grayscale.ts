import { EffectShader } from '../webgl2/types';

export const grayscaleShader: EffectShader = {
  id: 'grayscale',
  name: 'Grayscale',
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
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(vec3(gray), color.a);
    }
  `,
  uniforms: [],
};
