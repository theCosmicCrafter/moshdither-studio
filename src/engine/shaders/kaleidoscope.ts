import { EffectShader } from '../webgl2/types';

export const kaleidoscopeShader: EffectShader = {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
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
    uniform float segments;
    uniform float rotation;
    varying vec2 vUv;

    #define PI 3.14159265359

    void main() {
      vec2 center = vec2(0.5);
      vec2 uv = vUv - center;
      float radius = length(uv);
      float angle = atan(uv.y, uv.x);

      float segAngle = PI / segments;
      angle = mod(angle + rotation, 2.0 * segAngle);
      if (angle > segAngle) angle = 2.0 * segAngle - angle;

      vec2 sampleUv = vec2(cos(angle), sin(angle)) * radius + center;
      sampleUv = clamp(sampleUv, 0.0, 1.0);

      gl_FragColor = texture2D(tDiffuse, sampleUv);
    }
  `,
  uniforms: [
    { name: 'segments', type: 'float', default: 6.0 },
    { name: 'rotation', type: 'float', default: 0.0 },
  ],
};
