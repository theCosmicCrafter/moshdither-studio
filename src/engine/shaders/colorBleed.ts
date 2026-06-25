import { EffectShader } from "../webgl2/types";

export const colorBleedShader: EffectShader = {
  id: "color_bleed",
  name: "Color Bleed",
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

    void main() {
      float offset = amount * 0.02 * (0.8 + 0.2 * sin(u_time * 3.0));
      vec4 tex = texture2D(tDiffuse, vUv);
      float r = texture2D(tDiffuse, vUv + vec2(offset, 0.0)).r;
      float b = texture2D(tDiffuse, vUv - vec2(offset, 0.0)).b;
      gl_FragColor = vec4(r, tex.g, b, tex.a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.5 },
    { name: "u_time", type: "float", default: 0.0 },
  ],
};
