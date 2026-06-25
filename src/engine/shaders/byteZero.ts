import { EffectShader } from "../webgl2/types";

export const byteZeroShader: EffectShader = {
  id: "byte_zero",
  name: "Byte Zero",
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
    uniform float u_time;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float r = rand(vec2(floor(vUv.y * 40.0), floor(vUv.x * 20.0) + u_time));
      if (r < amount * 0.3) {
        color.rgb = vec3(0.0);
      }
      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.3 },
    { name: "u_time", type: "float", default: 0.0 },
  ],
};
