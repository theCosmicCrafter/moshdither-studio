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
    uniform float lineWidth;
    uniform vec3 gridColor;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float lw = lineWidth;

      // Vertical lines at 1/3 and 2/3
      float vLine1 = smoothstep(lw, 0.0, abs(vUv.x - 1.0 / 3.0));
      float vLine2 = smoothstep(lw, 0.0, abs(vUv.x - 2.0 / 3.0));
      // Horizontal lines at 1/3 and 2/3
      float hLine1 = smoothstep(lw, 0.0, abs(vUv.y - 1.0 / 3.0));
      float hLine2 = smoothstep(lw, 0.0, abs(vUv.y - 2.0 / 3.0));

      float lineMask = max(max(vLine1, vLine2), max(hLine1, hLine2));
      vec3 result = mix(col.rgb, gridColor, lineMask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'lineWidth', type: 'float', default: 0.002 },
    { name: 'gridColor', type: 'vec3', default: [1.0, 1.0, 1.0] },
    { name: 'opacity', type: 'float', default: 0.4 },
  ],
};
