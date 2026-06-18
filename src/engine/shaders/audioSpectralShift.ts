import { EffectShader } from '../webgl2/types';

export const audioSpectralShiftShader: EffectShader = {
  id: 'audioSpectralShift',
  name: 'Audio Spectral Shift',
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
    uniform float u_centroid;
    uniform float u_intensity;
    uniform float u_saturationBoost;

    varying vec2 vUv;

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 hsv = rgb2hsv(color.rgb);

      // centroid drives hue rotation; normalized 0-1 maps to 0-360 degrees
      hsv.x = fract(hsv.x + u_centroid * u_intensity);
      hsv.y = clamp(hsv.y * (1.0 + u_saturationBoost * u_centroid), 0.0, 1.0);

      color.rgb = hsv2rgb(hsv);
      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'u_centroid', type: 'float', default: 0.0 },
    { name: 'u_intensity', type: 'float', default: 0.5 },
    { name: 'u_saturationBoost', type: 'float', default: 0.3 },
  ],
};
