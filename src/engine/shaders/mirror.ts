import { EffectShader } from '../webgl2/types';

export const mirrorShader: EffectShader = {
  id: 'mirror',
  name: 'Mirror',
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
    uniform int mode;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      if (mode == 0) { // horizontal
        if (uv.x > 0.5) uv.x = 1.0 - uv.x;
      } else if (mode == 1) { // vertical
        if (uv.y > 0.5) uv.y = 1.0 - uv.y;
      } else if (mode == 2) { // quad
        if (uv.x > 0.5) uv.x = 1.0 - uv.x;
        if (uv.y > 0.5) uv.y = 1.0 - uv.y;
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: 'mode', type: 'int', default: 0 },
  ],
};
