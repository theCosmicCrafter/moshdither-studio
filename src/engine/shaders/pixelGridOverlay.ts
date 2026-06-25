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
    uniform float gridSize;
    uniform float lineWidth;
    uniform vec3 gridColor;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 grid = abs(fract(vUv * gridSize - 0.5) - 0.5);
      vec2 gridLine = smoothstep(vec2(0.0), vec2(lineWidth), grid);
      float lineMask = 1.0 - min(gridLine.x, gridLine.y);
      vec3 result = mix(col.rgb, gridColor, lineMask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'gridSize', type: 'float', default: 32.0 },
    { name: 'lineWidth', type: 'float', default: 0.01 },
    { name: 'gridColor', type: 'vec3', default: [0.0, 1.0, 1.0] },
    { name: 'opacity', type: 'float', default: 0.3 },
  ],
};
