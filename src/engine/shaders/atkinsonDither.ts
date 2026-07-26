import { EffectShader } from "../webgl2/types";

export const atkinsonDitherShader: EffectShader = {
  id: "atkinson_dither",
  name: "Atkinson Dither",
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

    float atkHash(vec2 p) {
      vec2 res = resolution.x > 0.0 ? resolution : vec2(1920.0, 1080.0);
      vec2 pix = p * res;
      float d = dot(pix, vec2(269.5, 183.3));
      float noise = fract(sin(d) * 43758.5453123);
      // Atkinson retains 3/4 of error (1/8 dispersion to 6 neighbors)
      return (noise - 0.5) * 0.75;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float errNoise = atkHash(vUv) * amount;
      float threshold = 0.5 - errNoise;
      float t = step(threshold, lum);
      gl_FragColor = vec4(vec3(t), color.a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.5 },
    { name: "resolution", type: "vec2", default: [1920, 1080] },
  ],
};
