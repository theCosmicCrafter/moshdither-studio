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
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float levels;
    uniform float scale;
    varying vec2 vUv;

    float bayer2(vec2 uv) {
      int x = int(mod(uv.x, 2.0));
      int y = int(mod(uv.y, 2.0));
      int idx = y * 2 + x;
      if (idx == 0) return 0.0;
      if (idx == 1) return 2.0;
      if (idx == 2) return 3.0;
      return 1.0;
    }

    float bayer4(vec2 uv) {
      ivec2 p = ivec2(mod(uv, 4.0));
      int idx = p.y * 4 + p.x;
      if (idx == 0) return 0.0;   if (idx == 1) return 8.0;
      if (idx == 2) return 2.0;   if (idx == 3) return 10.0;
      if (idx == 4) return 12.0;  if (idx == 5) return 4.0;
      if (idx == 6) return 14.0;  if (idx == 7) return 6.0;
      if (idx == 8) return 3.0;   if (idx == 9) return 11.0;
      if (idx == 10) return 1.0;  if (idx == 11) return 9.0;
      if (idx == 12) return 15.0; if (idx == 13) return 7.0;
      if (idx == 14) return 13.0; if (idx == 15) return 5.0;
      return 0.0;
    }

    void main() {
      vec2 pixel = vUv * resolution;
      vec2 block = floor(pixel / scale) * scale;
      vec2 uv = (block + 0.5) / resolution;
      vec4 color = texture2D(tDiffuse, uv);
      vec3 c = color.rgb;

      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      float threshold = bayer4(block / scale) / 16.0 - 0.5;
      float dithered = luma + threshold;
      float snapped = dithered > 0.5 ? 1.0 : 0.0;

      gl_FragColor = vec4(vec3(snapped), color.a);
    }
  `,
  uniforms: [
    { name: 'levels', type: 'float', default: 2.0 },
    { name: 'scale', type: 'float', default: 4.0 },
  ],
};
