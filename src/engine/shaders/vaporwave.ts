import { EffectShader } from '../webgl2/types';

export const vaporwaveShader: EffectShader = {
  id: 'vaporwave',
  name: 'Vaporwave',
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
      vec3 c = color.rgb;
      // Shift toward pink/cyan
      float shift = amount * 0.3;
      c.r = mix(c.r, 1.0, shift * 0.5);
      c.b = mix(c.b, 1.0, shift * 0.5);
      c.g = mix(c.g, 0.5, shift * 0.3);
      // Boost contrast
      c = (c - 0.5) * (1.0 + amount * 0.5) + 0.5;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.5 },
  ],
};
