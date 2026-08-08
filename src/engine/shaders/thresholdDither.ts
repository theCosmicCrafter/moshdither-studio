import { EffectShader } from '../webgl2/types';

export const thresholdDitherShader: EffectShader = {
  id: 'threshold_dither',
  name: 'Threshold Dither',
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
    uniform float threshold;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      // Rust: 'lum > threshold as f32' (threshold.rs) -- strictly greater
      // than, matching that exactly (not step()'s >=) avoids a boundary flip
      // at exact ties, e.g. a mid-grey pixel at the default threshold.
      float t = lum > threshold ? 1.0 : 0.0;
      gl_FragColor = vec4(vec3(t), color.a);
    }
  `,
  uniforms: [
    { name: 'threshold', type: 'float', default: 0.5 },
  ],
};
