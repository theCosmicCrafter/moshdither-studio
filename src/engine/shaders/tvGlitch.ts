import { EffectShader } from "../webgl2/types";

export const tvGlitchShader: EffectShader = {
  id: "tv_glitch",
  name: "TV Glitch",
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
    uniform vec2 resolution;
    uniform float amount;
    uniform float u_time;
    uniform float u_speed;
    uniform float seed;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      float intensity = amount;
      float s = seed;
      float t = u_time * u_speed;

      // Scanline distortion
      float scanline = sin(uv.y * 800.0 * rand(vec2(t + s, 1.0))) * 0.04 * intensity;
      uv.x += scanline;

      // Horizontal tearing
      if (rand(vec2(t + s, floor(uv.y * 20.0))) > 0.95 * (1.0 - intensity)) {
        uv.x += rand(vec2(t + s, uv.y)) * 0.2 * intensity;
      }

      // Chromatic aberration
      float rOffset = intensity * 0.05 * rand(vec2(t + s, uv.y));
      float bOffset = -intensity * 0.05 * rand(vec2(t + s, uv.y));

      float r = texture2D(tDiffuse, vec2(uv.x + rOffset, uv.y)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, vec2(uv.x + bOffset, uv.y)).b;
      float a = texture2D(tDiffuse, uv).a;

      gl_FragColor = vec4(r, g, b, a);
    }
  `,
  uniforms: [
    { name: "amount", type: "float", default: 0.5 },
    { name: "u_time", type: "float", default: 0.0 },
    { name: "u_speed", type: "float", default: 1.0 },
    { name: "seed", type: "float", default: 1.0 },
  ],
};
