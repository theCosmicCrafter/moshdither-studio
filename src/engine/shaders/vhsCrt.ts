import { EffectShader } from "../webgl2/types";

export const vhsCrtShader: EffectShader = {
  id: "vhs_crt",
  name: "VHS / CRT",
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
    uniform float u_time;
    uniform float bars;
    uniform float amount;
    uniform float noise;
    uniform float headSwitching;
    uniform float chromaDelay;
    uniform float chromaBleed;
    uniform float chromaOffset;
    varying vec2 vUv;

    float random1d(float n) {
      return fract(sin(n) * 43758.5453);
    }

    float random2d(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec3 sampleRGB(vec2 uv) {
      vec4 col = texture2D(tDiffuse, uv);
      return col.a > 0.0001 ? col.rgb : vec3(0.0);
    }

    void main() {
      vec2 uv = vUv;

      // Tracking drift: horizontal sine-wave distortion.
      float barCount = bars;
      float barPhase = u_time * 0.5;
      float stretch = sin(uv.y * barCount * 3.14159 + barPhase) * 0.02 * amount;
      uv.x += stretch;

      // Head-switching noise band near the bottom of the frame.
      float headBand = smoothstep(0.88, 0.92, uv.y);
      float headNoise = (random2d(vec2(floor(uv.y * 240.0), u_time)) - 0.5) * headSwitching;
      uv.x += headNoise * headBand * 0.05;

      // Luma + head noise.
      float lumaNoise = (random2d(uv * 123.456 + u_time) - 0.5) * noise * 0.05;
      float headBright = headBand * (random2d(vec2(uv.y * 100.0, u_time)) - 0.5) * headSwitching * 0.2;

      vec3 base = sampleRGB(uv);

      // Chroma offset: horizontal shift for red/blue channels.
      float co = chromaOffset * 0.02;
      float r = sampleRGB(uv + vec2(-co, 0.0)).r;
      float b = sampleRGB(uv + vec2(co, 0.0)).b;
      base.r = mix(base.r, r, abs(chromaOffset));
      base.b = mix(base.b, b, abs(chromaOffset));

      // Chroma delay: vertical shift for the chroma channels (approximated by
      // shifting green/blue down slightly).
      vec3 delayed = sampleRGB(uv + vec2(0.0, chromaDelay * 0.002));
      base.g = mix(base.g, delayed.g, chromaDelay * 0.1);
      base.b = mix(base.b, delayed.b, chromaDelay * 0.1);

      // Chroma bleed: average with horizontal neighbors.
      if (chromaBleed > 0.0) {
        float bleed = chromaBleed * 0.01;
        vec3 left = sampleRGB(uv - vec2(bleed, 0.0));
        vec3 right = sampleRGB(uv + vec2(bleed, 0.0));
        base = base * (1.0 - chromaBleed) + ((left + right) * 0.5) * chromaBleed;
      }

      // Scanline darkening.
      float scan = sin(vUv.y * 240.0 * 3.14159) * 0.5 + 0.5;
      base.rgb *= mix(1.0, scan, amount * 0.3);

      base.rgb += lumaNoise + headBright;

      gl_FragColor = vec4(base, texture2D(tDiffuse, uv).a);
    }
  `,
  uniforms: [
    { name: "u_time", type: "float", default: 0.0 },
    { name: "bars", type: "float", default: 3.0 },
    { name: "amount", type: "float", default: 1.0 },
    { name: "noise", type: "float", default: 0.0 },
    { name: "headSwitching", type: "float", default: 0.0 },
    { name: "chromaDelay", type: "float", default: 0.0 },
    { name: "chromaBleed", type: "float", default: 0.0 },
    { name: "chromaOffset", type: "float", default: 0.0 },
  ],
};
