import type { EffectShader } from "../webgl2/types";

const defaultVertexShader = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const maskBlendShader: EffectShader = {
  id: "maskBlend",
  name: "Mask Blend",
  vertexSource: defaultVertexShader,
  fragmentSource: `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tDiffuse;   // Post-effect texture
uniform sampler2D tPrevious;  // Pre-effect texture
uniform sampler2D tMask;      // Mask texture

void main() {
    vec4 postColor = texture(tDiffuse, vUv);
    vec4 preColor = texture(tPrevious, vUv);
    vec4 maskColor = texture(tMask, vUv);

    // Use mask luminance as blend factor
    float maskFactor = maskColor.r;

    // Linear blend: mask = 1.0 -> postColor (effect active), mask = 0.0 -> preColor (original)
    fragColor = mix(preColor, postColor, maskFactor);
}
`,
  uniforms: [
    { name: "tDiffuse", type: "sampler2D", default: 0 },
    { name: "tPrevious", type: "sampler2D", default: 2 },
    { name: "tMask", type: "sampler2D", default: 3 },
  ],
};
