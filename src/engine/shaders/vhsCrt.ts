import { EffectShader } from "../webgl2/types";

export const vhsCrtShader: EffectShader = {
  id: "vhs_crt",
  name: "VHS / CRT",
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
    uniform float u_time;
    uniform float bars;
    uniform float amount;
    varying vec2 vUv;

    float random1d(float n) {
      return fract(sin(n) * 43758.5453);
    }

    void main() {
      vec2 sam = vUv;
      float barCount = bars;
      float barPhase = u_time * 0.5;
      float stretch = sin(sam.y * barCount * 3.14159 + barPhase) * 0.02;
      sam.x += stretch;

      vec4 base = texture2D(tDiffuse, sam);

      // Scanline darkening
      float scan = sin(vUv.y * 240.0 * 3.14159) * 0.5 + 0.5;
      base.rgb *= mix(1.0, scan, amount * 0.3);

      // Subtle noise
      float n = random1d(vUv.x * 100.0 + vUv.y * 200.0 + u_time) - 0.5;
      base.rgb += n * amount * 0.05;

      gl_FragColor = base;
    }
  `,
  uniforms: [
    { name: "u_time", type: "float", default: 0.0 },
    { name: "bars", type: "float", default: 3.0 },
    { name: "amount", type: "float", default: 1.0 },
  ],
};
