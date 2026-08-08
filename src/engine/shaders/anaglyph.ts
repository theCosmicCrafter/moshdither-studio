import { EffectShader } from '../webgl2/types';

export const anaglyphShader: EffectShader = {
  id: 'anaglyph',
  name: 'Anaglyph',
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
      float offset = amount * 0.03;
      // Rust (anaglyph.rs): rx = x - shift (red samples from smaller x),
      // bx = x + shift (blue samples from larger x). vUv.x increases with x,
      // so that is vUv - offset for red and vUv + offset for blue.
      float r = texture2D(tDiffuse, vUv - vec2(offset, 0.0)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + vec2(offset, 0.0)).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(r, g, b, a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.5 },
  ],
};
