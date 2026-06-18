import { EffectShader } from '../webgl2/types';

export const motionVectorGlitchShader: EffectShader = {
  id: 'motionVectorGlitch',
  name: 'Motion Vector Glitch',
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
    uniform float u_intensity;
    uniform float u_angle;
    uniform float u_scale;

    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5);
      vec2 delta = vUv - center;
      float dist = length(delta);
      float angle = atan(delta.y, delta.x) + u_angle;
      float push = dist * u_scale * u_intensity;

      vec2 uv = vUv + vec2(cos(angle), sin(angle)) * push;
      vec4 displaced = texture2D(tDiffuse, uv);

      vec4 original = texture2D(tDiffuse, vUv);
      gl_FragColor = mix(original, displaced, u_intensity);
    }
  `,
  uniforms: [
    { name: 'u_intensity', type: 'float', default: 0.2 },
    { name: 'u_angle', type: 'float', default: 0.0 },
    { name: 'u_scale', type: 'float', default: 1.0 },
  ],
};
