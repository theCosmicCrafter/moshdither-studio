import { EffectShader } from '../webgl2/types';

export const sortingGlitchShader: EffectShader = {
  id: 'sortingGlitch',
  name: 'Sorting Glitch',
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
    uniform float u_threshold;
    uniform float u_intensity;
    uniform float u_direction; // 0 = horizontal, 1 = vertical

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      if (brightness > u_threshold) {
        float shift = (brightness - u_threshold) * u_intensity * 0.2;
        if (u_direction < 0.5) {
          color = texture2D(tDiffuse, vUv + vec2(shift, 0.0));
        } else {
          color = texture2D(tDiffuse, vUv + vec2(0.0, shift));
        }
      }

      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'u_threshold', type: 'float', default: 0.5 },
    { name: 'u_intensity', type: 'float', default: 1.0 },
    { name: 'u_direction', type: 'float', default: 0.0 },
  ],
};
