import { EffectShader } from '../webgl2/types';

export const audioWaveformShader: EffectShader = {
  id: 'audioWaveform',
  name: 'Audio Waveform',
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
    uniform float u_amplitude;
    uniform float u_thickness;
    uniform float u_rms;
    uniform vec3 u_color;
    uniform float u_glow;

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      float waveY = 0.5 + sin(vUv.x * 20.0) * u_amplitude * (0.5 + u_rms);
      float dist = abs(vUv.y - waveY);
      float line = smoothstep(u_thickness, 0.0, dist);
      float glow = smoothstep(u_thickness + u_glow, u_thickness, dist);

      color.rgb = mix(color.rgb, u_color, line + glow * 0.4);
      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'u_amplitude', type: 'float', default: 0.1 },
    { name: 'u_thickness', type: 'float', default: 0.01 },
    { name: 'u_rms', type: 'float', default: 0.0 },
    { name: 'u_color', type: 'vec3', default: [0.0, 1.0, 0.8] },
    { name: 'u_glow', type: 'float', default: 0.05 },
  ],
};
