import { EffectShader } from '../webgl2/types';

export const pixelGridOverlayShader: EffectShader = {
  id: 'pixel_grid_overlay',
  name: 'Pixel Grid Overlay',
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
    uniform float gridSize;   // pixels 2.0..256.0
    uniform float lineWidth;  // pixels 0.0..10.0
    uniform vec3 gridColor;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (opacity <= 0.0 || gridSize <= 0.0) {
        gl_FragColor = col;
        return;
      }

      vec2 pixel = vUv * resolution;
      float gSize = (gridSize >= 2.0 ? gridSize : 32.0);
      float lw = (lineWidth > 0.0 ? lineWidth : 1.0);

      vec2 modP = mod(pixel, gSize);
      bool onGridX = (modP.x < lw);
      bool onGridY = (modP.y < lw);

      float mask = (onGridX || onGridY) ? 1.0 : 0.0;
      vec3 cyan = vec3(0.0, 1.0, 1.0);
      vec3 result = mix(col.rgb, cyan, mask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'gridSize', type: 'float', default: 32.0 },
    { name: 'lineWidth', type: 'float', default: 1.0 },
    { name: 'gridColor', type: 'vec3', default: [0.0, 1.0, 1.0] },
    { name: 'opacity', type: 'float', default: 0.3 },
  ],
};
