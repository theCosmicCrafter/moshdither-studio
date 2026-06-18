import { EffectShader } from '../webgl2/types';

export const liftGammaGainShader: EffectShader = {
  id: 'lift_gamma_gain',
  name: 'Lift / Gamma / Gain',
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
    uniform vec3 lift;
    uniform vec3 gamma;
    uniform vec3 gain;
    uniform float amount;
    varying vec2 vUv;

    vec3 applyLiftGammaGain(vec3 c, vec3 l, vec3 g, vec3 gn) {
      // Apply gain (multiply, affects highlights)
      c = c * (gn + vec3(1.0));
      // Apply lift (add, affects shadows)
      c = c + l;
      // Apply gamma (power curve, affects midtones)
      // Ensure gamma is safe (no zero or negative)
      vec3 safeGamma = max(g + vec3(1.0), vec3(0.01));
      c = pow(max(c, vec3(0.0)), vec3(1.0) / safeGamma);
      return c;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 graded = applyLiftGammaGain(color.rgb, lift, gamma, gain);
      vec3 finalColor = mix(color.rgb, graded, amount);
      gl_FragColor = vec4(finalColor, color.a);
    }
  `,
  uniforms: [
    { name: 'lift', type: 'vec3', default: [0.0, 0.0, 0.0] },
    { name: 'gamma', type: 'vec3', default: [0.0, 0.0, 0.0] },
    { name: 'gain', type: 'vec3', default: [0.0, 0.0, 0.0] },
    { name: 'amount', type: 'float', default: 1.0 },
  ],
};
