import { EffectShader } from "../webgl2/types";

export const databendShader: EffectShader = {
  id: "databend",
  name: "Databend",
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
      float freq = 50.0 / max(blockSize, 0.1);
      float r = rand(vec2(floor(vUv.y * freq), time + seed));
      float shift = (r - 0.5) * amount * 0.1;
      float r2 = rand(vec2(floor(vUv.y * freq * 0.4), time + seed + 1.0));
      float rgbShift = r2 * amount * 0.05;
      float rChan = texture2D(tDiffuse, vUv + vec2(shift + rgbShift, 0.0)).r;
      float gChan = texture2D(tDiffuse, vUv + vec2(shift, 0.0)).g;
      float bChan = texture2D(tDiffuse, vUv + vec2(shift - rgbShift, 0.0)).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(rChan, gChan, bChan, a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.5 },
    { name: "time", type: "float", default: 0.0 },
    { name: "seed", type: "float", default: 1.0 },
    { name: "blockSize", type: "float", default: 1.0 },
  ],
};
