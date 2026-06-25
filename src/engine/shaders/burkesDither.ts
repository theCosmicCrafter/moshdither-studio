import { EffectShader } from "../webgl2/types";

export const burkesDitherShader: EffectShader = {
  id: "burkes_dither",
  name: "Burkes Dither",
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
    varying vec2 vUv;

    float bayer2(float x, float y) {
      float ix = mod(x, 2.0);
      float iy = mod(y, 2.0);
      if (ix < 1.0) { if (iy < 1.0) return 0.0; return 3.0; }
      if (iy < 1.0) return 2.0; return 1.0;
    }
    float bayer4(float x, float y) {
      return 4.0 * bayer2(mod(x, 2.0), mod(y, 2.0)) + bayer2(floor(x / 2.0), floor(y / 2.0));
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float px = mod(floor(vUv.x * 64.0), 4.0);
      float py = mod(floor(vUv.y * 64.0), 4.0);
      float t = step(1.0 - (bayer4(px, py) / 16.0) * amount, lum);
      gl_FragColor = vec4(vec3(t), color.a);
    }
  `,
  uniforms: [{ name: "amount", type: "float", default: 0.5 }],
};
