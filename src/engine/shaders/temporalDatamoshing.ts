import { EffectShader } from '../webgl2/types';

export const temporalDatamoshingShader: EffectShader = {
  id: 'temporalDatamoshing',
  name: 'Temporal Datamoshing',
  animated: true,
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
    uniform float u_time;
    uniform float u_intensity;
    uniform float u_blockSize;
    uniform float u_seed;

    varying vec2 vUv;

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 block = vec2(u_blockSize) / vec2(1920.0, 1080.0);
      vec2 blockId = floor(vUv / block);
      float t = floor(u_time * 30.0);
      float noise = rand(blockId + t * 0.1 + u_seed);

      if (noise > 1.0 - u_intensity) {
        float shift = (rand(blockId * 2.0 + t) - 0.5) * u_intensity * 0.3;
        vec2 offset = vec2(shift, 0.0);
        gl_FragColor = texture2D(tDiffuse, vUv + offset);
      } else if (noise > 1.0 - u_intensity * 2.0) {
        // Repeat block from earlier in frame
        vec2 repeatUV = fract(vUv + vec2(0.0, rand(blockId * 3.0) * u_intensity * 0.2));
        gl_FragColor = texture2D(tDiffuse, repeatUV);
      } else {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    }
  `,
  uniforms: [
    { name: 'u_time', type: 'float', default: 0.0 },
    { name: 'u_intensity', type: 'float', default: 0.2 },
    { name: 'u_blockSize', type: 'float', default: 16.0 },
    { name: 'u_seed', type: 'float', default: 1.0 },
  ],
};
