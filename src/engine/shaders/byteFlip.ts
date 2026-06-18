import { EffectShader } from "../webgl2/types";

export const byteFlipShader: EffectShader = {
  id: "byte_flip",
  name: "Byte Flip",
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
    uniform float seed;
    uniform float blockSize;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float r = rand(vec2(floor(vUv.y * (30.0 / blockSize)), time + seed));
      if (r < amount * 0.3) {
        color.rgb = 1.0 - color.rgb;
      }
      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.3 },
    { name: "time", type: "float", default: 0.0 },
    { name: "seed", type: "float", default: 1.0 },
    { name: "blockSize", type: "float", default: 1.0 },
  ],
};
