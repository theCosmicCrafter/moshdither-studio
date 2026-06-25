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
    uniform float margin;
    uniform float lineWidth;
    uniform vec3 guideColor;
    uniform float opacity;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float m = margin;
      float lw = lineWidth;

      // Outer border (action-safe)
      float outerLeft = smoothstep(0.0, lw, vUv.x - m) * smoothstep(0.0, lw, (1.0 - m) - vUv.x);
      float outerTop = smoothstep(0.0, lw, vUv.y - m) * smoothstep(0.0, lw, (1.0 - m) - vUv.y);
      float outerMask = 1.0 - min(outerLeft, outerTop);

      // Inner border (title-safe) at margin + 5%
      float m2 = m + 0.05;
      float innerLeft = smoothstep(0.0, lw, vUv.x - m2) * smoothstep(0.0, lw, (1.0 - m2) - vUv.x);
      float innerTop = smoothstep(0.0, lw, vUv.y - m2) * smoothstep(0.0, lw, (1.0 - m2) - vUv.y);
      float innerMask = 1.0 - min(innerLeft, innerTop);

      // Only show border lines, not filled area
      float outerLine = outerMask * (1.0 - step(m + lw, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0 - m + lw));
      float lineMask = max(outerMask * step(abs(vUv.x - m), lw) + outerMask * step(abs(vUv.x - (1.0 - m)), lw)
                          + outerMask * step(abs(vUv.y - m), lw) + outerMask * step(abs(vUv.y - (1.0 - m)), lw),
                          innerMask * step(abs(vUv.x - m2), lw) + innerMask * step(abs(vUv.x - (1.0 - m2)), lw)
                          + innerMask * step(abs(vUv.y - m2), lw) + innerMask * step(abs(vUv.y - (1.0 - m2)), lw));

      lineMask = clamp(lineMask, 0.0, 1.0);
      vec3 result = mix(col.rgb, guideColor, lineMask * opacity);
      gl_FragColor = vec4(result, col.a);
    }
  `,
  uniforms: [
    { name: 'margin', type: 'float', default: 0.05 },
    { name: 'lineWidth', type: 'float', default: 0.003 },
    { name: 'guideColor', type: 'vec3', default: [0.0, 1.0, 0.85] },
    { name: 'opacity', type: 'float', default: 0.6 },
  ],
};
