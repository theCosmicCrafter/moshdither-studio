import { EffectShader } from "../webgl2/types";

export const scanlinesShader: EffectShader = {
  id: "scanlines",
  name: "Scanlines",
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
    uniform float gap;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 res = (resolution.x > 0.0 && resolution.y > 0.0) ? resolution : vec2(1920.0, 1080.0);

      // Rust (scanlines.rs) darkens every row except every Nth ('gap'), a
      // hard step -- not a smooth sinusoid -- and 'gap' is a row period
      // measured against the frame's actual height, not a line count derived
      // from an assumed 480px-tall frame.
      float g = max(floor(gap), 1.0);
      // Undo the WebGL vUv.y flip (UNPACK_FLIP_Y_WEBGL=true) to get the same
      // top-down row index Rust's 'for y in 0..h' uses.
      float row = floor((1.0 - vUv.y) * res.y);
      float bright = mod(row, g) < 0.5 ? 1.0 : 0.0; // y % gap == 0 -> unchanged
      float factor = mix(1.0 - amount, 1.0, bright);

      gl_FragColor = vec4(col.rgb * factor, col.a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.3 },
    { name: "gap", type: "float", default: 2.0 },
  ],
};
