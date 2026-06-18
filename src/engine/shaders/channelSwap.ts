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

      if (mode == 0) {      // R ↔ G
        outColor = c.gbr;
      } else if (mode == 1) { // R ↔ B
        outColor = c.bgr;
      } else if (mode == 2) { // G ↔ B
        outColor = c.rbg;
      } else if (mode == 3) { // RGB → BGR
        outColor = c.bgr;
      } else if (mode == 4) { // RGB → GBR
        outColor = c.gbr;
      }
      gl_FragColor = vec4(outColor, color.a);
    }
  `,
  uniforms: [
    { name: 'mode', type: 'int', default: 0 },
  ],
};
