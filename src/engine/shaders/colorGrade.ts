import { EffectShader } from '../webgl2/types';

export const colorGradeShader: EffectShader = {
  id: 'colorGrade',
  name: 'Color Grade',
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
    uniform float u_contrast;
    uniform float u_brightness;
    uniform float u_saturation;
    uniform float u_temperature;
    uniform float u_tint;
    uniform float u_vibrance;

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
      vec3 color = texture2D(tDiffuse, vUv).rgb;

      // Brightness
      color += u_brightness;

      // Contrast
      color = (color - 0.5) * u_contrast + 0.5;

      // Saturation
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luminance), color, u_saturation);

      // Vibrance (smart saturation boost for less-saturated pixels)
      vec3 hsv = rgb2hsv(color);
      float satBoost = 1.0 + u_vibrance * (1.0 - hsv.y);
      hsv.y = clamp(hsv.y * satBoost, 0.0, 1.0);
      color = hsv2rgb(hsv);

      // Temperature (shift towards blue or orange)
      color.r += u_temperature * 0.02;
      color.b -= u_temperature * 0.02;

      // Tint (shift towards green or magenta)
      color.g += u_tint * 0.02;
      color.r -= u_tint * 0.01;
      color.b -= u_tint * 0.01;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
  uniforms: [
    { name: 'u_contrast', type: 'float', default: 1.0 },
    { name: 'u_brightness', type: 'float', default: 0.0 },
    { name: 'u_saturation', type: 'float', default: 1.0 },
    { name: 'u_temperature', type: 'float', default: 0.0 },
    { name: 'u_tint', type: 'float', default: 0.0 },
    { name: 'u_vibrance', type: 'float', default: 0.0 },
  ],
};
