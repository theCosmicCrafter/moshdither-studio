import { EffectShader } from "../webgl2/types";

export const blockShiftShader: EffectShader = {
  id: "block_shift",
  name: "Block Shift",
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
    uniform float amount;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 res = (resolution.x > 0.0 && resolution.y > 0.0) ? resolution : vec2(1920.0, 1080.0);
      vec2 pixel = vUv * res;
      vec2 block = floor(pixel / blockSize) * blockSize;
      vec2 blockId = block / blockSize;
      float r = rand(blockId);
      // Rust's max_shift is a pixel displacement independent of block_size
      // (block_shift.rs); 'amount' is already that pixel quantity (see
      // effectConverter's pixel_geo.block_shift mapping), so it must not be
      // multiplied by blockSize here the way it previously was.
      vec2 offset = vec2(
        (r - 0.5) * 2.0 * amount / res.x,
        (fract(r * 1.618) - 0.5) * 2.0 * amount / res.y
      );
      gl_FragColor = texture2D(tDiffuse, vUv + offset);
    }
  `,
  uniforms: [
    { name: "blockSize", type: "float", default: 16.0 },
    { name: "amount", type: "float", default: 8.0 },
  ],
};
