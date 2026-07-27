import { EffectShader } from '../webgl2/types';

export const invertShader: EffectShader = {
  id: 'invert',
  name: 'Invert',
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
      vec4 col = texture2D(tDiffuse, vUv);
      // Matches the Rust implementation (color/invert.rs), which blends the
      // original and inverted channel by 'intensity' rather than hard-inverting.
      gl_FragColor = vec4(mix(col.rgb, 1.0 - col.rgb, clamp(amount, 0.0, 1.0)), col.a);
    }
  `,
  uniforms: [{ name: 'amount', type: 'float', default: 1.0 }],
};
