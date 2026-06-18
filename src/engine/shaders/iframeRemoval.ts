import { EffectShader } from "../webgl2/types";

export const iframeRemovalShader: EffectShader = {
  id: "iframeRemoval",
  name: "I-Frame Removal",
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
    uniform float u_intensity;
    uniform float u_blockSize;
    uniform float u_seed;
    uniform float u_smeared;
    uniform float u_ghostCount;

    varying vec2 vUv;

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 78.233)) + u_seed) * 43758.5453);
    }

    float rand1(float n) {
      return fract(sin(n * 127.1 + u_seed) * 43758.5453);
    }

    void main() {
      vec2 texel = 1.0 / vec2(1920.0, 1080.0);
      vec2 block = vec2(u_blockSize) * texel;

      vec2 blockId = floor(vUv / block);
      float r = rand(blockId);

      vec2 uv = vUv;
      vec3 color = vec3(0.0);

      // Temporal smearing: shift blocks horizontally based on time + random
      float smearStrength = u_intensity * u_smeared;
      float shiftAmount = rand(blockId * 7.13) * smearStrength * texel.x * 300.0;
      uv.x += shiftAmount * sin(u_time * 2.0 + rand1(blockId.x * 3.7) * 6.28);

      // Ghosting: multiple offset copies
      int ghosts = int(min(u_ghostCount, 8.0));
      float totalWeight = 1.0;

      color = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;

      for (int i = 1; i <= 8; i++) {
        if (i > ghosts) break;
        float fi = float(i);
        float angle = rand(blockId + fi) * 6.28318;
        float dist = fi * u_intensity * texel.x * 80.0;
        vec2 offset = vec2(cos(angle), sin(angle)) * dist;
        float weight = 1.0 / (fi + 1.0);
        color += texture2D(tDiffuse, clamp(uv + offset, 0.0, 1.0)).rgb * weight;
        totalWeight += weight;
      }

      color /= totalWeight;

      // Block corruption: randomly drop blocks to black or shift them wildly
      float dropThreshold = 0.97 - u_intensity * 0.15;
      if (rand(blockId * 13.37) > dropThreshold) {
        color = vec3(0.0);
      } else if (rand(blockId * 19.91) > dropThreshold + 0.01) {
        // Wildly shifted block
        vec2 wildOffset = vec2(
          (rand(blockId * 2.0) - 0.5) * u_intensity * 0.3,
          (rand(blockId * 3.0) - 0.5) * u_intensity * 0.1
        );
        color = texture2D(tDiffuse, clamp(vUv + wildOffset, 0.0, 1.0)).rgb;
      }

      // Motion trail bleed: blend with vertically offset samples
      float bleed = u_intensity * 0.05;
      vec3 trail = texture2D(tDiffuse, clamp(uv + vec2(0.0, bleed), 0.0, 1.0)).rgb * 0.5;
      trail += texture2D(tDiffuse, clamp(uv + vec2(0.0, bleed * 2.0), 0.0, 1.0)).rgb * 0.25;
      color = mix(color, trail, u_intensity * 0.3);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
  uniforms: [
    { name: "u_time", type: "float", default: 0.0 },
    { name: "u_intensity", type: "float", default: 0.5 },
    { name: "u_blockSize", type: "float", default: 16.0 },
    { name: "u_seed", type: "float", default: 0.0 },
    { name: "u_smeared", type: "float", default: 1.0 },
    { name: "u_ghostCount", type: "float", default: 3.0 },
  ],
};
