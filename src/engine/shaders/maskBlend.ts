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
uniform int u_mode;           // 0 = inside, 1 = outside, 2 = alpha

void main() {
    vec4 postColor = texture(tDiffuse, vUv);
    vec4 preColor = texture(tPrevious, vUv);
    float m = texture(tMask, vUv).r;

    // These three branches mirror blend_mask() in src-tauri/src/effects/engine.rs
    // exactly. mix(a, b, t) is a*(1-t) + b*t, so:
    //
    //   inside   old*(1-m) + new*m      mix(pre,  post, m)
    //   outside  old*m     + new*(1-m)  mix(post, pre,  m)
    //   alpha    new*m                  post * m
    //
    // The shader had been reduced to the inside case with the u_mode uniform
    // deleted, while EffectChain.ts still set u_mode from MASK_MODE_MAP. Setting
    // a uniform a shader does not declare is silently ignored in WebGL, so
    // outside and alpha masks rendered as inside in the GPU preview while
    // the Rust export honoured all three -- a preview/export divergence that
    // appeared only when a mask mode other than the default was used.
    vec3 rgb;
    if (u_mode == 1) {
        rgb = mix(postColor.rgb, preColor.rgb, m);
    } else if (u_mode == 2) {
        rgb = postColor.rgb * m;
    } else {
        rgb = mix(preColor.rgb, postColor.rgb, m);
    }

    // Rust blends channels 0..3 only and leaves alpha as the working frame's,
    // which is the post-effect alpha.
    fragColor = vec4(rgb, postColor.a);
}
`,
  uniforms: [
    { name: "tDiffuse", type: "sampler2D", default: 0 },
    { name: "tPrevious", type: "sampler2D", default: 2 },
    { name: "tMask", type: "sampler2D", default: 3 },
    { name: "u_mode", type: "int", default: 0 },
  ],
};
