import { EffectShader } from '../webgl2/types';

export const ruleOfThirdsShader: EffectShader = {
  id: 'rule_of_thirds',
  name: 'Rule of Thirds Grid',
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
    uniform float lineWidth;  // pixels 0.0..10.0
    uniform vec3 gridColor;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (opacity <= 0.0) {
        gl_FragColor = col;
        return;
      }

      vec2 pixel = vUv * resolution;
      float lw = (lineWidth > 0.0 ? lineWidth : 2.0);

      float x1 = resolution.x / 3.0;
      float x2 = resolution.x * 2.0 / 3.0;
      float y1 = resolution.y / 3.0;
      float y2 = resolution.y * 2.0 / 3.0;

      bool onV = (pixel.x >= x1 - lw && pixel.x <= x1 + lw) || (pixel.x >= x2 - lw && pixel.x <= x2 + lw);
      bool onH = (pixel.y >= y1 - lw && pixel.y <= y1 + lw) || (pixel.y >= y2 - lw && pixel.y <= y2 + lw);

      float mask = (onV || onH) ? 1.0 : 0.0;
      vec3 white = vec3(1.0, 1.0, 1.0);
      vec3 result = mix(col.rgb, white, mask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'lineWidth', type: 'float', default: 2.0 },
    { name: 'gridColor', type: 'vec3', default: [1.0, 1.0, 1.0] },
    { name: 'opacity', type: 'float', default: 0.4 },
  ],
};
