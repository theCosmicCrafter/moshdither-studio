import { EffectShader } from '../webgl2/types';

export const ditherHalftoneShader: EffectShader = {
  id: 'dither_halftone',
  name: 'Dither Halftone',
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
    uniform vec3 colLight;
    uniform vec3 colDark;
    uniform vec3 colWhite;
    uniform float scale;
    uniform float amount;
    varying vec2 vUv;

    void main() {
      vec4 orig = texture2D(tDiffuse, vUv);
      float size = scale;
      float dSize = size * 3.0;

      float x = mod(gl_FragCoord.x, dSize);
      float y = mod(gl_FragCoord.y, dSize);
      float d = 0.0;
      if (x < size) {
        if (y < size) d = 0.0;
        else if (y < size * 2.0) d = 0.5;
        else d = 0.75;
      } else if (x < size * 2.0) {
        if (y < size) d = 0.25;
        else if (y < size * 2.0) d = 0.75;
        else d = 0.5;
      } else {
        if (y < size) d = 0.5;
        else if (y < size * 2.0) d = 0.25;
        else d = 1.0;
      }

      float luma = dot(orig.rgb, vec3(0.299, 0.587, 0.114));
      vec3 color = mix(colDark, colLight, smoothstep(d - 0.1, d + 0.1, luma));
      color = mix(color, colWhite, smoothstep(d + 0.4, d + 0.6, luma));
      gl_FragColor = vec4(mix(orig.rgb, color, amount), orig.a);
    }
  `,
  uniforms: [
    { name: 'scale', type: 'float', default: 4.0 },
    { name: 'amount', type: 'float', default: 1.0 },
    { name: 'colLight', type: 'vec3', default: [0.8, 0.8, 0.8] },
    { name: 'colDark', type: 'vec3', default: [0.1, 0.1, 0.1] },
    { name: 'colWhite', type: 'vec3', default: [1.0, 1.0, 1.0] },
  ],
};
