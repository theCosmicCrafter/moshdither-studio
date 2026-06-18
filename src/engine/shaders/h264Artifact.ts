import { EffectShader } from '../webgl2/types';

export const h264ArtifactShader: EffectShader = {
  id: 'h264Artifact',
  name: 'H.264 Artifact',
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

    varying vec2 vUv;

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 block = vec2(u_blockSize) / vec2(1920.0, 1080.0);
      vec2 blockId = floor(vUv / block);
      float noise = rand(blockId + u_seed);

      if (noise > 1.0 - u_intensity * 0.5) {
        // Quantize colors within block
        vec4 color = texture2D(tDiffuse, vUv);
        float q = 32.0 * u_intensity;
        color.rgb = floor(color.rgb * q + 0.5) / q;
        gl_FragColor = color;
      } else if (noise > 1.0 - u_intensity) {
        // Block color bleed from neighbor
        vec2 offset = block * vec2(rand(blockId * 2.0) - 0.5, rand(blockId * 3.0) - 0.5);
        gl_FragColor = texture2D(tDiffuse, vUv + offset);
      } else {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    }
  `,
  uniforms: [
    { name: 'u_intensity', type: 'float', default: 0.3 },
    { name: 'u_blockSize', type: 'float', default: 8.0 },
    { name: 'u_seed', type: 'float', default: 1.0 },
  ],
};
