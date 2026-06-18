import { EffectShader } from '../webgl2/types';

export const audioGlitchBeatShader: EffectShader = {
  id: 'audioGlitchBeat',
  name: 'Audio Glitch Beat',
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
    uniform float u_beatBass;
    uniform float u_beatMid;
    uniform float u_intensity;
    uniform float u_sliceHeight;
    uniform float u_seed;

    varying vec2 vUv;

    // Simple pseudo-random
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      float beat = max(u_beatBass, u_beatMid);
      if (beat < 0.1) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      float strength = beat * u_intensity;
      float sliceY = floor(vUv.y / u_sliceHeight);
      float offset = (rand(vec2(sliceY, u_seed)) - 0.5) * strength * 0.3;
      float uvX = vUv.x + offset;

      vec4 color = texture2D(tDiffuse, vec2(uvX, vUv.y));

      // Color channel shift on strong beats
      if (beat > 0.6) {
        float r = texture2D(tDiffuse, vec2(uvX + strength * 0.02, vUv.y)).r;
        float b = texture2D(tDiffuse, vec2(uvX - strength * 0.02, vUv.y)).b;
        color.r = mix(color.r, r, strength);
        color.b = mix(color.b, b, strength);
      }

      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'u_beatBass', type: 'float', default: 0.0 },
    { name: 'u_beatMid', type: 'float', default: 0.0 },
    { name: 'u_intensity', type: 'float', default: 1.0 },
    { name: 'u_sliceHeight', type: 'float', default: 0.05 },
    { name: 'u_seed', type: 'float', default: 1.0 },
  ],
};
