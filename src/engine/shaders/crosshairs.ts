import { EffectShader } from '../webgl2/types';

export const crosshairsShader: EffectShader = {
  id: 'crosshairs',
  name: 'Corner Crosshairs',
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
    uniform float size;       // percentage 1.0..50.0
    uniform float lineWidth;  // pixels 0.0..10.0
    uniform vec3 crosshairColor;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (opacity <= 0.0 || size <= 0.0) {
        gl_FragColor = col;
        return;
      }

      vec2 pixel = vUv * resolution;
      float szPct = (size <= 1.0 ? size : size / 100.0);
      vec2 bSize = resolution * szPct;
      float lw = (lineWidth > 0.0 ? lineWidth : 2.0);

      vec2 dTL = pixel;
      vec2 dTR = vec2(resolution.x - pixel.x, pixel.y);
      vec2 dBL = vec2(pixel.x, resolution.y - pixel.y);
      vec2 dBR = resolution - pixel;

      float mask = 0.0;
      if ((dTL.x < bSize.x && dTL.y < lw) || (dTL.y < bSize.y && dTL.x < lw)) mask = 1.0;
      if ((dTR.x < bSize.x && dTR.y < lw) || (dTR.y < bSize.y && dTR.x < lw)) mask = 1.0;
      if ((dBL.x < bSize.x && dBL.y < lw) || (dBL.y < bSize.y && dBL.x < lw)) mask = 1.0;
      if ((dBR.x < bSize.x && dBR.y < lw) || (dBR.y < bSize.y && dBR.x < lw)) mask = 1.0;

      vec3 cyan = vec3(0.0, 1.0, 1.0);
      vec3 result = mix(col.rgb, cyan, mask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'size', type: 'float', default: 10.0 },
    { name: 'lineWidth', type: 'float', default: 2.0 },
    { name: 'crosshairColor', type: 'vec3', default: [0.0, 1.0, 1.0] },
    { name: 'opacity', type: 'float', default: 0.6 },
  ],
};
