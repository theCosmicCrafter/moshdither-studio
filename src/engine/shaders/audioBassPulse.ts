import { EffectShader } from "../webgl2/types";

export const audioBassPulseShader: EffectShader = {
  id: "audioBassPulse",
  name: "Audio Bass Pulse",
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
    uniform float u_bass;
    uniform float u_intensity;

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Brightness pulse: boost RGB based on bass energy
      float boost = 1.0 + u_bass * u_intensity;
      color.rgb *= boost;

      // Slight chromatic aberration on strong bass hits
      float aberration = u_bass * u_intensity * 0.005;
      if (aberration > 0.0) {
        float r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
        float b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;
        color.r = mix(color.r, r, u_bass);
        color.b = mix(color.b, b, u_bass);
      }

      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: "u_bass", type: "float", default: 0.0 },
    { name: "u_intensity", type: "float", default: 1.0 },
  ],
};
