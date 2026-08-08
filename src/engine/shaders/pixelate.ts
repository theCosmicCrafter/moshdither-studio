import { EffectShader } from '../webgl2/types';

export const pixelateShader: EffectShader = {
  id: 'pixelate',
  name: 'Pixelate',
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
    uniform float blockSize;
    varying vec2 vUv;

    void main() {
      vec2 res = (resolution.x > 0.0 && resolution.y > 0.0) ? resolution : vec2(1920.0, 1080.0);
      float bs = max(floor(blockSize), 1.0);
      vec2 pixel = floor(vUv * res);
      vec2 blockOrigin = floor(pixel / bs) * bs;

      // Rust (pixelate.rs) samples the single integer pixel index
      // 'block_origin + bs / 2' (integer division truncates, matching
      // Rust's usize 'bs / 2') -- not the continuous midpoint. For EVEN
      // block sizes (including the default, 8) the continuous midpoint
      // lands exactly on a texel boundary, which this app's LINEAR texture
      // filtering then blends across 2-4 neighboring source pixels instead
      // of reading Rust's single center pixel.
      vec2 centerIndex = blockOrigin + floor(vec2(bs) * 0.5);
      centerIndex = min(centerIndex, res - 1.0);

      // Sampling at the texel's center (index + 0.5) lands squarely inside
      // that texel, avoiding the boundary-blend LINEAR filtering would
      // otherwise cause.
      vec2 uv = (centerIndex + 0.5) / res;
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
  uniforms: [
    { name: 'blockSize', type: 'float', default: 8.0 },
  ],
};
