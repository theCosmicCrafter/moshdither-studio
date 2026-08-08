import { EffectShader } from "../webgl2/types";

export const waveDistortShader: EffectShader = {
  id: "wave_distort",
  name: "Wave Distort",
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
    uniform vec2 resolution;
    uniform float amount;
    uniform float frequency;
    uniform float u_time;
    varying vec2 vUv;

    void main() {
      // Rust (wave_distort.rs): offset = amplitude * sin(y * frequency +
      // time * 0.2), a horizontal-only pixel displacement, where amplitude
      // and frequency are resolution-independent pixel-space quantities.
      // 'amount' (amplitude, px) and 'frequency' (radians/pixel-row) are
      // passed straight through from Rust; converting to UV space here with
      // the actual resolution keeps the displacement a fixed pixel amount
      // regardless of frame size, instead of scaling with it. There is no
      // second (vertical) distortion axis in Rust, so it is not added here.
      vec2 res = (resolution.x > 0.0 && resolution.y > 0.0) ? resolution : vec2(1920.0, 1080.0);
      float yPixel = vUv.y * res.y;
      float offsetPixels = amount * sin(yPixel * frequency + u_time * 0.2);
      vec2 uv = vUv;
      uv.x += offsetPixels / res.x;
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 10.0 },
    { name: "frequency", type: "float", default: 0.05 },
    { name: "u_time", type: "float", default: 0.0 },
  ],
};
