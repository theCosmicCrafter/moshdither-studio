import { EffectShader } from "../webgl2/types";

export const noiseGrainShader: EffectShader = {
  id: "noise_grain",
  name: "Noise / Grain",
  animated: true,
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
    uniform float seed;
    uniform float u_time;
    varying vec2 vUv;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float n = random(vUv * (seed + u_time * 0.5)) - 0.5;
      gl_FragColor = vec4(col.rgb + n * amount, col.a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.1 },
    { name: "seed", type: "float", default: 1.0 },
    { name: "u_time", type: "float", default: 0.0 },
  ],
};
