import { EffectShader } from "../webgl2/types";

export const blueNoiseDitherShader: EffectShader = {
  id: "blue_noise_dither",
  name: "Blue Noise Dither",
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
    uniform vec2 resolution;
    varying vec2 vUv;

    // Golden ratio spatial hash blue-noise approximation
    float goldenNoise(vec2 p) {
      vec2 res = resolution.x > 0.0 ? resolution : vec2(1920.0, 1080.0);
      vec2 pix = p * res;
      float phi = 1.61803398874989484820459;
      return fract(tan(distance(pix * phi, pix) * 0.1) * pix.x);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float noise = (goldenNoise(vUv) - 0.5) * amount;
      float t = step(0.5 - noise, lum);
      gl_FragColor = vec4(vec3(t), color.a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.5 },
    { name: "resolution", type: "vec2", default: [1920, 1080] },
  ],
};
