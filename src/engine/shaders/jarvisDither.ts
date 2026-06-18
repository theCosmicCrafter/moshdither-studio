import { EffectShader } from '../webgl2/types';

export const jarvisDitherShader: EffectShader = {
  id: 'jarvis_dither',
  name: 'Jarvis Dither',
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
    varying vec2 vUv;

    float bayer(vec2 uv) {
      ivec2 p = ivec2(mod(floor(uv * 64.0), 8.0));
      int a = p.x ^ p.y;
      int b = p.x & p.y;
      return float(((a & 1) << 2) | ((b & 1) << 1) | ((a >> 1) & 1)) / 8.0;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float t = step(1.0 - bayer(vUv) * amount, lum);
      gl_FragColor = vec4(vec3(t), color.a);
    }
  `,
  uniforms: [
    { name: 'amount', type: 'float', default: 0.5 },
  ],
};
