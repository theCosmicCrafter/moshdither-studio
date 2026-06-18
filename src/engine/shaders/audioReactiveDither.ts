import { EffectShader } from '../webgl2/types';

export const audioReactiveDitherShader: EffectShader = {
  id: 'audioReactiveDither',
  name: 'Audio Reactive Dither',
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
    uniform float u_levels;

    varying vec2 vUv;

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float strength = u_bass * u_intensity;
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float noise = rand(vUv * 1000.0) - 0.5;
      float dithered = floor((gray + noise * strength * 0.5) * u_levels + 0.5) / u_levels;
      color.rgb = mix(color.rgb, vec3(dithered), strength);
      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'u_bass', type: 'float', default: 0.0 },
    { name: 'u_intensity', type: 'float', default: 1.0 },
    { name: 'u_levels', type: 'float', default: 4.0 },
  ],
};
