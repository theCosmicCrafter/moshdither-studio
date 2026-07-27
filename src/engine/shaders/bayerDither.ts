import { EffectShader } from '../webgl2/types';

export const bayerDitherShader: EffectShader = {
  id: 'bayer_dither',
  name: 'Bayer Dither',
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
    precision highp int;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float scale;
    varying vec2 vUv;

    // Return bit k (0 = LSB) of a non-negative integer coordinate.
    int bitAt(int c, int s) {
      return int(mod(floor(float(c) / float(s)), 2.0));
    }

    // Return the 2x2 Bayer quadrant for the given scale layer.
    // The recursion is:
    //   [[0, 2],
    //    [3, 1]]
    int quadrant(int x, int y, int s) {
      int bx = bitAt(x, s);
      int by = bitAt(y, s);
      if (bx == 1 && by == 0) return 2;
      if (bx == 0 && by == 1) return 3;
      if (bx == 1 && by == 1) return 1;
      return 0;
    }

    // Compute the Bayer matrix value at (x, y) for an NxN matrix (N a power of
    // two, up to 16). The value is built from the inner 2x2 outward, which is
    // the same recursion used by the Rust backend in bayer.rs.
    int bayerIndex(int x, int y, int n) {
      int value = quadrant(x, y, 1);
      if (n > 2) value = value * 4 + quadrant(x, y, 2);
      if (n > 4) value = value * 4 + quadrant(x, y, 4);
      if (n > 8) value = value * 4 + quadrant(x, y, 8);
      return value;
    }

    void main() {
      vec2 res = resolution.x > 0.0 ? resolution : vec2(1920.0, 1080.0);
      vec2 pixel = vUv * res;

      // scale is the actual Bayer matrix size (2, 4, 8, or 16).
      int n;
      if (scale <= 2.0) n = 2;
      else if (scale <= 4.0) n = 4;
      else if (scale <= 8.0) n = 8;
      else n = 16;

      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      // Textures are uploaded with UNPACK_FLIP_Y_WEBGL=true, so vUv.y runs
      // bottom-to-top on screen. The Rust backend indexes the matrix top-down,
      // so flip the y coordinate to match.
      int px = int(pixel.x);
      int py = int(res.y - pixel.y);
      int b = bayerIndex(px, py, n);
      float threshold = float(b) / float(n * n);

      // Match Rust: a pixel is white when its luminance exceeds the scaled
      // Bayer threshold.
      vec3 dithered = luma > threshold ? vec3(1.0) : vec3(0.0);
      gl_FragColor = vec4(dithered, color.a);
    }
  `,
  uniforms: [
    { name: 'scale', type: 'float', default: 4.0 },
  ],
};
