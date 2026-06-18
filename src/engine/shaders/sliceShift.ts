import { EffectShader } from "../webgl2/types";

export const sliceShiftShader: EffectShader = {
  id: "slice_shift",
  name: "Slice Shift",
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
    uniform float sliceHeight;
    uniform float amount;
    uniform float seed;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      float y = vUv.y * resolution.y;
      float slice = floor(y / sliceHeight);
      float r = rand(vec2(slice, seed));
      float shift = (r - 0.5) * 2.0 * amount * 0.1;
      vec2 uv = vUv + vec2(shift, 0.0);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: "sliceHeight", type: "float", default: 8.0 },
    { name: "amount", type: "float", default: 0.5 },
    { name: "seed", type: "float", default: 1.0 },
  ],
};
