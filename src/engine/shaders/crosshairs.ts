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
    uniform float size;
    uniform float lineWidth;
    uniform vec3 crosshairColor;
    uniform float opacity;
    varying vec2 vUv;

    float cornerBracket(vec2 uv, vec2 corner, float sz, float lw) {
      // Distance from corner in x and y
      vec2 d = abs(uv - corner);
      // Only draw within size radius of corner
      if (d.x > sz && d.y > sz) return 0.0;
      // Horizontal line: near corner.y, within sz in x
      float hLine = step(d.y, lw) * step(d.x, sz);
      // Vertical line: near corner.x, within sz in y
      float vLine = step(d.x, lw) * step(d.y, sz);
      return max(hLine, vLine);
    }

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float mask = 0.0;
      mask = max(mask, cornerBracket(vUv, vec2(0.0, 0.0), size, lineWidth));
      mask = max(mask, cornerBracket(vUv, vec2(1.0, 0.0), size, lineWidth));
      mask = max(mask, cornerBracket(vUv, vec2(0.0, 1.0), size, lineWidth));
      mask = max(mask, cornerBracket(vUv, vec2(1.0, 1.0), size, lineWidth));
      vec3 result = mix(col.rgb, crosshairColor, mask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'size', type: 'float', default: 0.05 },
    { name: 'lineWidth', type: 'float', default: 0.003 },
    { name: 'crosshairColor', type: 'vec3', default: [1.0, 0.7, 0.88] },
    { name: 'opacity', type: 'float', default: 0.5 },
  ],
};
