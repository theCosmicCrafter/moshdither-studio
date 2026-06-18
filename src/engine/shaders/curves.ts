import { EffectShader } from '../webgl2/types';

export const curvesShader: EffectShader = {
  id: 'curves',
  name: 'Curves',
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

    // 5 control points along X = 0.0, 0.25, 0.5, 0.75, 1.0
    uniform float p0y;
    uniform float p1y;
    uniform float p2y;
    uniform float p3y;
    uniform float p4y;

    // Per-channel offsets so the same curve can be shifted per channel
    uniform float redOffset;
    uniform float greenOffset;
    uniform float blueOffset;

    varying vec2 vUv;

    // Catmull-Rom spline interpolation through 5 points
    float curveValue(float x) {
      float y[5];
      y[0] = p0y;
      y[1] = p1y;
      y[2] = p2y;
      y[3] = p3y;
      y[4] = p4y;

      // Clamp to valid range
      for (int i = 0; i < 5; i++) {
        y[i] = clamp(y[i], 0.0, 1.0);
      }

      // Map x to segment index (0-3) and local t (0-1)
      float seg = x * 4.0;
      int idx = int(floor(seg));
      float t = fract(seg);

      if (idx < 0) return y[0];
      if (idx >= 4) return y[4];

      // Cubic Hermite interpolation
      float y0 = y[max(0, idx - 1)];
      float y1 = y[idx];
      float y2 = y[min(4, idx + 1)];
      float y3 = y[min(4, idx + 2)];

      float m0 = (y2 - y0) * 0.5;
      float m1 = (y3 - y1) * 0.5;

      float t2 = t * t;
      float t3 = t2 * t;

      float h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
      float h10 = t3 - 2.0 * t2 + t;
      float h01 = -2.0 * t3 + 3.0 * t2;
      float h11 = t3 - t2;

      return h00 * y1 + h10 * m0 + h01 * y2 + h11 * m1;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      float rCurve = curveValue(clamp(lum + redOffset, 0.0, 1.0));
      float gCurve = curveValue(clamp(lum + greenOffset, 0.0, 1.0));
      float bCurve = curveValue(clamp(lum + blueOffset, 0.0, 1.0));

      // Apply curve adjustment relative to original luminance
      vec3 adjusted = color.rgb + vec3(rCurve - lum, gCurve - lum, bCurve - lum);

      gl_FragColor = vec4(clamp(adjusted, 0.0, 1.0), color.a);
    }
  `,
  uniforms: [
    { name: 'p0y', type: 'float', default: 0.0 },
    { name: 'p1y', type: 'float', default: 0.25 },
    { name: 'p2y', type: 'float', default: 0.5 },
    { name: 'p3y', type: 'float', default: 0.75 },
    { name: 'p4y', type: 'float', default: 1.0 },
    { name: 'redOffset', type: 'float', default: 0.0 },
    { name: 'greenOffset', type: 'float', default: 0.0 },
    { name: 'blueOffset', type: 'float', default: 0.0 },
  ],
};
