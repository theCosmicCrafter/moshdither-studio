import { EffectShader } from "../webgl2/types";

export const chromaticAberrationShader: EffectShader = {
  id: "chromatic_aberration",
  name: "Chromatic Aberration",
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
    uniform float angle;
    uniform float u_time;
    varying vec2 vUv;

    void main() {
      float rad = angle * 3.14159 / 180.0;
      float pulse = 0.85 + 0.15 * sin(u_time * 1.5);
      vec2 offset = vec2(cos(rad), sin(rad)) * amount * 0.01 * pulse;

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;

      gl_FragColor = vec4(r, g, b, texture2D(tDiffuse, vUv).a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 1.0 },
    { name: "angle", type: "float", default: 0.0 },
    { name: "u_time", type: "float", default: 0.0 },
  ],
};
