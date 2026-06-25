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
    uniform float amount;
    uniform float lineCount;
    uniform float u_time;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float scan = sin(vUv.y * lineCount * 3.14159 + u_time * 2.0) * 0.5 + 0.5;
      scan = mix(1.0, scan, amount);
      gl_FragColor = vec4(col.rgb * scan, col.a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.5 },
    { name: "lineCount", type: "float", default: 240.0 },
    { name: "u_time", type: "float", default: 0.0 },
  ],
};
