import { EffectShader } from '../webgl2/types';

export const pixelSortShader: EffectShader = {
  id: 'pixel_sort',
  name: 'Pixel Sort',
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
    uniform float threshold;
    uniform float amount;
    varying vec2 vUv;

    float lum(vec4 c) {
      return dot(c.rgb, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float l = lum(color);
      if (l < threshold || amount < 0.01) {
        gl_FragColor = color;
        return;
      }
      // Approximate pixel sort by stretching bright regions horizontally
      float stretch = amount * 0.05;
      vec2 uv2 = vUv + vec2((l - threshold) * stretch, 0.0);
      gl_FragColor = texture2D(tDiffuse, uv2);
    }
  `,
  uniforms: [
    { name: 'threshold', type: 'float', default: 0.5 },
    { name: 'amount', type: 'float', default: 0.5 },
  ],
};
