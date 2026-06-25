import { FULLSCREEN_QUAD_VERT } from "../webgl2/types";
import type { EffectShader } from "../webgl2/types";

export const maskBlendShader: EffectShader = {
  id: "maskBlend",
  name: "Mask Blend",
  vertexSource: FULLSCREEN_QUAD_VERT,
  fragmentSource: `
    precision highp float;
    uniform sampler2D tDiffuse;   // effect output (current)
    uniform sampler2D tPrevious;  // pre-effect frame
    uniform sampler2D tMask;      // mask (grayscale)
    uniform int u_mode;           // 0=inside, 1=outside, 2=alpha
    varying vec2 vUv;

    void main() {
      vec4 effectCol = texture2D(tDiffuse, vUv);
      vec4 prevCol = texture2D(tPrevious, vUv);
      float maskVal = texture2D(tMask, vUv).r; // grayscale mask

      vec3 blended;
      if (u_mode == 1) {
        // outside: original where mask is white, effect where black
        blended = mix(effectCol.rgb, prevCol.rgb, maskVal);
      } else if (u_mode == 2) {
        // alpha: effect multiplied by mask
        blended = effectCol.rgb * maskVal;
      } else {
        // inside: effect where mask is white, original where black
        blended = mix(prevCol.rgb, effectCol.rgb, maskVal);
      }

      gl_FragColor = vec4(blended, effectCol.a);
    }
  `,
  uniforms: [
    { name: "tDiffuse", type: "sampler2D", default: "" },
    { name: "tPrevious", type: "sampler2D", default: "" },
    { name: "tMask", type: "sampler2D", default: "" },
    { name: "u_mode", type: "int", default: 0 },
  ],
};
