import { EffectShader } from "../webgl2/types";

export const scanDriftShader: EffectShader = {
  id: "scan_drift",
  name: "Scan Drift",
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
    uniform float amount;
    uniform float u_time;
    uniform float u_speed;
    varying vec2 vUv;

    void main() {
      float offset = sin(vUv.y * 20.0 + u_time * 2.0 * u_speed) * amount * 0.05;
      vec2 uv = vUv + vec2(offset, 0.0);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.5 },
    { name: "u_time", type: "float", default: 0.0 },
    { name: "u_speed", type: "float", default: 1.0 },
  ],
};
