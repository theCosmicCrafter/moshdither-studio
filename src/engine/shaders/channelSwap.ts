import { EffectShader } from '../webgl2/types';

export const channelSwapShader: EffectShader = {
  id: 'channel_swap',
  name: 'Channel Swap',
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
    uniform int mode;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;
      vec3 outColor = c;

      // Rust's map table (channel_swap.rs) is indexed by mode and gives
      // (r_idx, g_idx, b_idx) meaning new_r=old[r_idx], new_g=old[g_idx],
      // new_b=old[b_idx] with 0=R,1=G,2=B:
      //   0 (0,1,2) RGB   1 (0,2,1) RBG   2 (1,0,2) GRB
      //   3 (1,2,0) GBR   4 (2,0,1) BRG   5 (2,1,0) BGR
      // Each GLSL swizzle below spells that tuple out directly in (r,g,b)
      // letters, so mode N reproduces map[N] exactly.
      if (mode == 0) {        // RGB (identity)
        outColor = c.rgb;
      } else if (mode == 1) { // RBG
        outColor = c.rbg;
      } else if (mode == 2) { // GRB
        outColor = c.grb;
      } else if (mode == 3) { // GBR
        outColor = c.gbr;
      } else if (mode == 4) { // BRG
        outColor = c.brg;
      } else if (mode == 5) { // BGR
        outColor = c.bgr;
      }
      gl_FragColor = vec4(outColor, color.a);
    }
  `,
  uniforms: [
    { name: 'mode', type: 'int', default: 0 },
  ],
};
