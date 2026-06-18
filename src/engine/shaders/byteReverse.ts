import { EffectShader } from '../webgl2/types';

export const byteReverseShader: EffectShader = {
  id: 'byte_reverse',
  name: 'Byte Reverse',
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
    uniform float time;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      float r = rand(vec2(floor(vUv.y * 30.0), time));
      vec2 uv = vUv;
      if (r < amount * 0.4) {
        float segWidth = 0.05 + rand(vec2(floor(vUv.y * 30.0), time + 1.0)) * 0.15;
        float segStart = floor(vUv.x / segWidth) * segWidth;
        float segEnd = segStart + segWidth;
        uv.x = segEnd - (vUv.x - segStart);
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.3 },
    { name: 'time', type: 'float', default: 0.0 },
  ],
};
