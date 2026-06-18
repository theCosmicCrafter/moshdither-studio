import { EffectShader } from '../webgl2/types';

export const blendModesShader: EffectShader = {
  id: 'blendModes',
  name: 'Blend Mode',
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
    uniform sampler2D tBlend;
    uniform int u_mode;
    uniform float u_amount;

    varying vec2 vUv;

    vec3 blendNormal(vec3 base, vec3 blend) {
      return blend;
    }

    vec3 blendAdd(vec3 base, vec3 blend) {
      return min(base + blend, 1.0);
    }

    vec3 blendMultiply(vec3 base, vec3 blend) {
      return base * blend;
    }

    vec3 blendScreen(vec3 base, vec3 blend) {
      return 1.0 - (1.0 - base) * (1.0 - blend);
    }

    vec3 blendOverlay(vec3 base, vec3 blend) {
      return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
    }

    vec3 blendDifference(vec3 base, vec3 blend) {
      return abs(base - blend);
    }

    vec3 blendExclusion(vec3 base, vec3 blend) {
      return base + blend - 2.0 * base * blend;
    }

    vec3 blendHardLight(vec3 base, vec3 blend) {
      return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, blend));
    }

    vec3 blendSoftLight(vec3 base, vec3 blend) {
      return mix(
        2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
        sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
        step(0.5, blend)
      );
    }

    vec3 blendColorDodge(vec3 base, vec3 blend) {
      return base / (1.0 - blend + 0.001);
    }

    vec3 blendColorBurn(vec3 base, vec3 blend) {
      return 1.0 - (1.0 - base) / (blend + 0.001);
    }

    vec3 blendLinearDodge(vec3 base, vec3 blend) {
      return min(base + blend, 1.0);
    }

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);
      vec4 blendColor = texture2D(tBlend, vUv);

      vec3 result;
      if (u_mode == 0) result = blendNormal(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 1) result = blendAdd(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 2) result = blendMultiply(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 3) result = blendScreen(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 4) result = blendOverlay(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 5) result = blendDifference(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 6) result = blendExclusion(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 7) result = blendHardLight(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 8) result = blendSoftLight(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 9) result = blendColorDodge(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 10) result = blendColorBurn(baseColor.rgb, blendColor.rgb);
      else if (u_mode == 11) result = blendLinearDodge(baseColor.rgb, blendColor.rgb);
      else result = blendNormal(baseColor.rgb, blendColor.rgb);

      result = mix(baseColor.rgb, result, u_amount * blendColor.a);
      gl_FragColor = vec4(result, baseColor.a);
    }
  `,
  uniforms: [
    { name: 'u_mode', type: 'int', default: 0 },
    { name: 'u_amount', type: 'float', default: 1.0 },
  ],
};
