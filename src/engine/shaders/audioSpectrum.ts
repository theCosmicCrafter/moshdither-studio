import { EffectShader } from '../webgl2/types';

export const audioSpectrumShader: EffectShader = {
  id: 'audioSpectrum',
  name: 'Audio Spectrum',
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
    uniform float u_band0;
    uniform float u_band1;
    uniform float u_band2;
    uniform float u_band3;
    uniform float u_band4;
    uniform float u_band5;
    uniform float u_band6;
    uniform float u_intensity;
    uniform float u_barCount;
    uniform float u_blendMode; // 0=overlay, 1=replace

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float bands[7];
      bands[0] = u_band0;
      bands[1] = u_band1;
      bands[2] = u_band2;
      bands[3] = u_band3;
      bands[4] = u_band4;
      bands[5] = u_band5;
      bands[6] = u_band6;

      float barWidth = 1.0 / u_barCount;
      float totalBars = min(u_barCount, 7.0);
      int barIndex = int(vUv.x * totalBars);
      float barHeight = 0.0;
      if (barIndex < 7) {
        if (barIndex == 0) barHeight = bands[0];
        else if (barIndex == 1) barHeight = bands[1];
        else if (barIndex == 2) barHeight = bands[2];
        else if (barIndex == 3) barHeight = bands[3];
        else if (barIndex == 4) barHeight = bands[4];
        else if (barIndex == 5) barHeight = bands[5];
        else if (barIndex == 6) barHeight = bands[6];
      }
      barHeight *= u_intensity;

      float inBar = step(vUv.y, barHeight);
      vec3 barColor = vec3(
        float(barIndex) / 6.0,
        1.0 - float(barIndex) / 6.0,
        0.5 + float(barIndex) / 12.0
      );

      if (u_blendMode < 0.5) {
        color.rgb = mix(color.rgb, barColor, inBar * 0.7);
      } else {
        color.rgb = mix(color.rgb, barColor * barHeight, inBar);
      }

      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'u_band0', type: 'float', default: 0.0 },
    { name: 'u_band1', type: 'float', default: 0.0 },
    { name: 'u_band2', type: 'float', default: 0.0 },
    { name: 'u_band3', type: 'float', default: 0.0 },
    { name: 'u_band4', type: 'float', default: 0.0 },
    { name: 'u_band5', type: 'float', default: 0.0 },
    { name: 'u_band6', type: 'float', default: 0.0 },
    { name: 'u_intensity', type: 'float', default: 1.0 },
    { name: 'u_barCount', type: 'float', default: 7.0 },
    { name: 'u_blendMode', type: 'float', default: 0.0 },
  ],
};
