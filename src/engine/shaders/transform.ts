import { EffectShader } from '../webgl2/types';

export const transformShader: EffectShader = {
  id: 'transform',
  name: 'Transform',
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
    uniform float u_posX;
    uniform float u_posY;
    uniform float u_scaleX;
    uniform float u_scaleY;
    uniform float u_rotation;
    uniform float u_anchorX;
    uniform float u_anchorY;
    uniform float u_opacity;

    varying vec2 vUv;

    void main() {
      // Convert UV to centered coordinates (-0.5 to 0.5)
      vec2 centered = vUv - vec2(0.5);

      // Apply anchor offset
      vec2 anchor = vec2(u_anchorX, u_anchorY) - vec2(0.5);
      centered -= anchor;

      // Apply scale
      centered /= vec2(u_scaleX, u_scaleY);

      // Apply rotation
      float c = cos(u_rotation);
      float s = sin(u_rotation);
      vec2 rotated = vec2(
        centered.x * c - centered.y * s,
        centered.x * s + centered.y * c
      );

      // Apply position offset
      rotated += anchor;
      rotated -= vec2(u_posX, u_posY);

      // Convert back to UV space
      vec2 uv = rotated + vec2(0.5);

      // Sample with border clamp
      vec4 color = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
      color.a *= u_opacity;

      gl_FragColor = color;
    }
  `,
  uniforms: [
    { name: 'u_posX', type: 'float', default: 0.0 },
    { name: 'u_posY', type: 'float', default: 0.0 },
    { name: 'u_scaleX', type: 'float', default: 1.0 },
    { name: 'u_scaleY', type: 'float', default: 1.0 },
    { name: 'u_rotation', type: 'float', default: 0.0 },
    { name: 'u_anchorX', type: 'float', default: 0.5 },
    { name: 'u_anchorY', type: 'float', default: 0.5 },
    { name: 'u_opacity', type: 'float', default: 1.0 },
  ],
};
