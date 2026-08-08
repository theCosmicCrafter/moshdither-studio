import { EffectShader } from '../webgl2/types';

export const kaleidoscopeShader: EffectShader = {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
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
    uniform float segments;
    uniform float rotation;
    varying vec2 vUv;

    #define PI 3.14159265359

    void main() {
      // Rust (kaleidoscope.rs) works in true pixel space: dx = x - cx,
      // dy = y - cy using the frame's actual width/height, then
      // dy.atan2(dx). Computing the angle straight from vUv - 0.5 instead
      // stretches it on non-square frames because uv.x and uv.y do not span
      // the same physical distance per unit; converting to pixel space with
      // the resolution uniform first avoids that.
      vec2 res = (resolution.x > 0.0 && resolution.y > 0.0) ? resolution : vec2(1920.0, 1080.0);
      vec2 pixel = vUv * res;
      vec2 center = res * 0.5;
      vec2 d = pixel - center;
      float dist = length(d);
      float angle = atan(d.y, d.x) + rotation;

      // Rust does a pure rotational segment copy: wrap into [0, angleStep)
      // with angle.rem_euclid(angle_step) and NO reflection. GLSL's mod()
      // is a floored mod (x - y*floor(x/y)), which is exactly rem_euclid
      // for a positive divisor, so no extra fold-back is needed -- the
      // previous 'if (angle > segAngle) angle = 2*segAngle - angle;' mirror
      // step does not exist in Rust and has been removed.
      float angleStep = (2.0 * PI) / max(segments, 2.0);
      float mappedAngle = mod(angle, angleStep);

      vec2 srcPixel = center + dist * vec2(cos(mappedAngle), sin(mappedAngle));
      vec2 sampleUv = clamp(srcPixel / res, 0.0, 1.0);

      gl_FragColor = texture2D(tDiffuse, sampleUv);
    }
  `,
  uniforms: [
    { name: 'segments', type: 'float', default: 6.0 },
    { name: 'rotation', type: 'float', default: 0.0 },
  ],
};
