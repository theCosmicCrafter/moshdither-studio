import { EffectShader } from '../webgl2/types';

export const grayscaleShader: EffectShader = {
  id: 'grayscale',
  name: 'Grayscale',
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
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      // Matches the Rust implementation (artistic/grayscale.rs), which blends
      // toward luma by 'intensity' rather than always fully desaturating.
      gl_FragColor = vec4(mix(color.rgb, vec3(gray), clamp(amount, 0.0, 1.0)), color.a);
    }
  `,
  uniforms: [{ name: 'amount', type: 'float', default: 1.0 }],
};
