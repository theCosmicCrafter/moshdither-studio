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
    varying vec2 vUv;

    void main() {
      float rad = angle * 3.14159 / 180.0;
      vec2 offset = vec2(cos(rad), sin(rad)) * amount * 0.01;

      // Rust (chromatic_aberration.rs): rx = x - shift (red from smaller x),
      // bx = x + shift (blue from larger x) -- vUv - offset / vUv + offset
      // respectively. The previous un-mapped sin(u_time*1.5) 'pulse' had no
      // Rust equivalent (Rust reads no time parameter) and made the preview
      // animate while the static export does not, so it has been removed.
      float r = texture2D(tDiffuse, vUv - offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + offset).b;

      gl_FragColor = vec4(r, g, b, texture2D(tDiffuse, vUv).a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 1.0 },
    { name: "angle", type: "float", default: 0.0 },
  ],
};
