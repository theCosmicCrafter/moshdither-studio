import { EffectShader } from '../webgl2/types';

export const byteInsertShader: EffectShader = {
  id: 'byte_insert',
  name: 'Byte Insert',
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
    uniform float time;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float r = rand(vec2(floor(vUv.y * 25.0), time));
      if (r < amount * 0.2) {
        float r2 = rand(vec2(floor(vUv.y * 25.0) + 100.0, time));
        vec3 insert = vec3(
          fract(r2 * 1.618),
          fract(r2 * 2.718),
          fract(r2 * 3.141)
        );
        color.rgb = mix(color.rgb, insert, 0.7);
      }
      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.3 },
    { name: 'time', type: 'float', default: 0.0 },
  ],
};
