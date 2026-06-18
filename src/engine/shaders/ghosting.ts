import { EffectShader } from '../webgl2/types';

export const ghostingShader: EffectShader = {
  id: 'ghosting',
  name: 'Ghosting',
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
      // Ghosting approximation: darken and tint green/purple
      vec3 ghost = color.rgb * (1.0 - amount * 0.3);
      ghost.g = mix(ghost.g, 0.0, amount * 0.2);
      ghost.rb = mix(ghost.rb, vec2(0.5), amount * 0.15);
      gl_FragColor = vec4(ghost, color.a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.3 },
  ],
};
