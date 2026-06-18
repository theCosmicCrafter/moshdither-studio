import { EffectShader } from '../webgl2/types';

export const lutShader: EffectShader = {
  id: 'lut_color_grading',
  name: 'LUT Color Grading',
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
    uniform sampler2D tLUT;
    uniform float amount;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec3 colUnpremul = col.a > 0.0001 ? col.rgb / col.a : vec3(0.0);

      // LUT is a 64x64x64 cube stored as a 512x512 flat image (8x8 grid of 64x64 tiles)
      // Each tile is one blue slice. Within tile: x=red, y=green.
      float bSlice = colUnpremul.b * 63.0;
      float bSliceFract = fract(bSlice);
      float bSliceFloor = floor(bSlice);

      float tileX = mod(bSliceFloor, 8.0) / 8.0;
      float tileY = floor(bSliceFloor / 8.0) / 8.0;
      float tileSize = 1.0 / 8.0;

      vec2 lutCoord = vec2(
        tileX + colUnpremul.r * tileSize,
        tileY + colUnpremul.g * tileSize
      );

      vec4 lutCol = texture2D(tLUT, lutCoord);

      // Interpolate between adjacent blue slices
      float tileX2 = mod(bSliceFloor + 1.0, 8.0) / 8.0;
      float tileY2 = floor((bSliceFloor + 1.0) / 8.0) / 8.0;
      vec2 lutCoord2 = vec2(
        tileX2 + colUnpremul.r * tileSize,
        tileY2 + colUnpremul.g * tileSize
      );
      vec4 lutCol2 = texture2D(tLUT, lutCoord2);
      lutCol = mix(lutCol, lutCol2, bSliceFract);

      vec3 mapped = mix(colUnpremul, lutCol.rgb, amount);
      gl_FragColor = vec4(mapped * col.a, col.a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 1.0 },
  ],
};
