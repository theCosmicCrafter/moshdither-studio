import { EffectShader } from '../webgl2/types';

export const macroblockGlitchShader: EffectShader = {
  id: 'macroblockGlitch',
  name: 'Macroblock Glitch',
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
    uniform float u_blockSize;
    uniform float u_seed;
    uniform float u_time;

    varying vec2 vUv;

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 block = vec2(u_blockSize) / vec2(1920.0, 1080.0);
      vec2 blockId = floor(vUv / block);
      float noise = rand(blockId + u_seed + floor(u_time * 30.0));

      if (noise > 1.0 - u_intensity) {
        vec2 offset = vec2(
          (rand(blockId * 2.0) - 0.5) * u_intensity * 0.2,
          (rand(blockId * 3.0) - 0.5) * u_intensity * 0.02
        );
        vec4 a = texture2D(tDiffuse, vUv + offset);
        vec4 b = texture2D(tDiffuse, vUv - offset);
        gl_FragColor = mix(a, b, rand(blockId * 5.0));
      } else {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    }
  `,
  uniforms: [
    { name: 'u_intensity', type: 'float', default: 0.3 },
    { name: 'u_blockSize', type: 'float', default: 16.0 },
    { name: 'u_seed', type: 'float', default: 1.0 },
    { name: 'u_time', type: 'float', default: 0.0 },
  ],
};
