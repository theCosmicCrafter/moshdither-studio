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
    uniform vec2 resolution;
    uniform float amount;
    varying vec2 vUv;

    void main() {
      vec2 res = (resolution.x > 0.0 && resolution.y > 0.0) ? resolution : vec2(1920.0, 1080.0);
      // Rust (color_bleed.rs) bands the shift PER ROW:
      //   r_shift = (y % (amount*2+1)) - amount   (signed, range [-amount, amount])
      //   b_shift = -r_shift
      // That row-banding is the effect's defining visual signature -- a
      // single constant, time-pulsing offset for the whole frame (the
      // previous implementation) has no banding at all and no Rust
      // equivalent for the time pulse.
      float amt = max(floor(amount), 0.0);
      float period = amt * 2.0 + 1.0;

      // Undo the WebGL vUv.y flip (textures are uploaded with
      // UNPACK_FLIP_Y_WEBGL=true) to get the same top-down row index Rust's
      // 'for y in 0..h' uses.
      float row = floor((1.0 - vUv.y) * res.y);
      float rShift = mod(row, period) - amt;
      float bShift = -rShift;

      vec2 texel = 1.0 / res;
      vec4 tex = texture2D(tDiffuse, vUv);
      float r = texture2D(tDiffuse, vUv + vec2(rShift * texel.x, 0.0)).r;
      float b = texture2D(tDiffuse, vUv + vec2(bShift * texel.x, 0.0)).b;
      gl_FragColor = vec4(r, tex.g, b, tex.a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 4.0 },
  ],
};
