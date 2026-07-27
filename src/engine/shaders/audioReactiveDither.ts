import { EffectShader } from "../webgl2/types";

export const audioReactiveDitherShader: EffectShader = {
  id: "audioReactiveDither",
  name: "Audio Reactive Dither",
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
    uniform float u_bass;
    uniform float u_threshold;
    uniform float u_intensity;
    uniform float u_levels;

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      ivec2 pixel = ivec2(gl_FragCoord.xy);

      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      // Audio modulates the ordered-dither threshold, matching the Rust CPU path.
      float audio = u_bass * u_intensity * 0.235; // 60.0 / 255.0
      float threshold = clamp(u_threshold + audio, 0.0, 1.0);

      // 2x2 Bayer pattern
      float bayer = float((pixel.x & 1) ^ (pixel.y & 1));
      float dithered = gray + bayer * threshold - threshold * 0.5;

      float step = 1.0 / (u_levels - 1.0);
      float q = floor(dithered / step + 0.5) * step;
      color.rgb = vec3(clamp(q, 0.0, 1.0));
      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: "u_bass", type: "float", default: 0.0 },
    { name: "u_threshold", type: "float", default: 0.5 },
    { name: "u_intensity", type: "float", default: 0.5 },
    { name: "u_levels", type: "float", default: 4.0 },
  ],
};
