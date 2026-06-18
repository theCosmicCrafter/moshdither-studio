import { EffectShader } from "../webgl2/types";

export const paletteDitherShader: EffectShader = {
  id: "palette_dither",
  name: "Palette Dither",
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
    uniform float scale;
    uniform float angle;
    uniform float paletteSize;
    uniform float amount;
    uniform vec3 color0;
    uniform vec3 color1;
    uniform vec3 color2;
    uniform vec3 color3;
    uniform vec3 color4;
    uniform vec3 color5;
    uniform vec3 color6;
    uniform vec3 color7;
    varying vec2 vUv;

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

    vec2 rotate(vec2 p, float a) {
      float s = sin(a);
      float c = cos(a);
      return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }

    float distanceSq(vec3 a, vec3 b) {
      vec3 d = a - b;
      return dot(d, d);
    }

    void main() {
      vec2 pixel = vUv * resolution;
      vec2 rotated = rotate(pixel, angle);
      vec2 block = floor(rotated / scale) * scale;
      vec2 uv = (floor(pixel) + 0.5) / resolution;
      vec4 color = texture2D(tDiffuse, uv);
      vec3 c = color.rgb;

      float bestDist = 9999.0;
      float secondDist = 9999.0;
      vec3 bestColor = color0;
      vec3 secondColor = color1;

      // Unrolled palette search for WebGL 1 compatibility
      float d;
      d = distanceSq(c, color0); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color0; } else if (d < secondDist) { secondDist = d; secondColor = color0; }
      d = distanceSq(c, color1); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color1; } else if (d < secondDist) { secondDist = d; secondColor = color1; }
      d = distanceSq(c, color2); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color2; } else if (d < secondDist) { secondDist = d; secondColor = color2; }
      d = distanceSq(c, color3); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color3; } else if (d < secondDist) { secondDist = d; secondColor = color3; }
      d = distanceSq(c, color4); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color4; } else if (d < secondDist) { secondDist = d; secondColor = color4; }
      d = distanceSq(c, color5); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color5; } else if (d < secondDist) { secondDist = d; secondColor = color5; }
      d = distanceSq(c, color6); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color6; } else if (d < secondDist) { secondDist = d; secondColor = color6; }
      d = distanceSq(c, color7); if (d < bestDist) { secondDist = bestDist; secondColor = bestColor; bestDist = d; bestColor = color7; } else if (d < secondDist) { secondDist = d; secondColor = color7; }

      int pSize = int(clamp(paletteSize, 2.0, 8.0));
      if (pSize < 2) { bestColor = color0; secondColor = color1; }
      else if (pSize == 2) { secondColor = color1; }

      float threshold = bayer4(block / scale) / 16.0 - 0.5;
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      float lumaBest = dot(bestColor, vec3(0.299, 0.587, 0.114));
      float lumaSecond = dot(secondColor, vec3(0.299, 0.587, 0.114));
      float ditheredLuma = luma + threshold * abs(lumaSecond - lumaBest) * 2.0;

      vec3 chosen = (ditheredLuma > luma) ? secondColor : bestColor;
      vec3 finalColor = mix(c, chosen, amount);

      gl_FragColor = vec4(finalColor, color.a);
    }
  `,
  uniforms: [
    { name: "scale", type: "float", default: 4.0 },
    { name: "angle", type: "float", default: 0.0 },
    { name: "paletteSize", type: "float", default: 4.0 },
    { name: "amount", type: "float", default: 1.0 },
    { name: "color0", type: "vec3", default: [0.0, 0.0, 0.0] },
    { name: "color1", type: "vec3", default: [1.0, 1.0, 1.0] },
    { name: "color2", type: "vec3", default: [0.8, 0.2, 0.2] },
    { name: "color3", type: "vec3", default: [0.2, 0.6, 0.8] },
    { name: "color4", type: "vec3", default: [0.2, 0.8, 0.3] },
    { name: "color5", type: "vec3", default: [0.9, 0.8, 0.2] },
    { name: "color6", type: "vec3", default: [0.5, 0.3, 0.7] },
    { name: "color7", type: "vec3", default: [0.9, 0.5, 0.2] },
  ],
};
