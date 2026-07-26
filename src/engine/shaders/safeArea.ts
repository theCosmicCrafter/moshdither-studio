import { EffectShader } from '../webgl2/types';

export const safeAreaShader: EffectShader = {
  id: 'safe_area',
  name: 'Safe Area Guides',
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
    uniform float margin;     // percentage 0.0..25.0
    uniform float lineWidth;  // pixels 0.0..10.0
    uniform vec3 guideColor;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (opacity <= 0.0 || margin <= 0.0) {
        gl_FragColor = col;
        return;
      }

      vec2 pixel = vUv * resolution;
      float mPct = (margin <= 1.0 ? margin : margin / 100.0);
      vec2 m = resolution * mPct;
      float lw = (lineWidth > 0.0 ? lineWidth : 2.0);

      bool onBorderX = (pixel.x >= m.x - lw && pixel.x <= m.x + lw) ||
                       (pixel.x >= (resolution.x - m.x) - lw && pixel.x <= (resolution.x - m.x) + lw);
      bool inYRange = (pixel.y >= m.y - lw && pixel.y <= (resolution.y - m.y) + lw);

      bool onBorderY = (pixel.y >= m.y - lw && pixel.y <= m.y + lw) ||
                       (pixel.y >= (resolution.y - m.y) - lw && pixel.y <= (resolution.y - m.y) + lw);
      bool inXRange = (pixel.x >= m.x - lw && pixel.x <= (resolution.x - m.x) + lw);

      float mask = ((onBorderX && inYRange) || (onBorderY && inXRange)) ? 1.0 : 0.0;
      vec3 yellow = vec3(1.0, 1.0, 0.0);
      vec3 result = mix(col.rgb, yellow, mask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'margin', type: 'float', default: 5.0 },
    { name: 'lineWidth', type: 'float', default: 2.0 },
    { name: 'guideColor', type: 'vec3', default: [1.0, 1.0, 0.0] },
    { name: 'opacity', type: 'float', default: 0.5 },
  ],
};
