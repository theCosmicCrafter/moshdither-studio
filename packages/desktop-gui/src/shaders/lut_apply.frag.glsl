#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform highp sampler3D u_lut;
uniform float u_lutSize;      // LUT grid dimension (e.g. 33 for 33x33x33)
uniform float u_intensity;    // Mix factor 0..1

// Audio-reactive uniforms
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioTreble;
uniform float u_audioAverage;
uniform float u_audioCentroid;
uniform float u_audioFlatness;
uniform float u_audioRms;
uniform float u_audioZcr;
uniform float u_audioOnsetKick;
uniform float u_audioOnsetSnare;
uniform float u_audioOnsetHihat;
uniform float u_audioLeft;
uniform float u_audioRight;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    vec4 texColor = texture(u_image, v_texCoord);

    // Scale UV from [0,1] to the range that maps to LUT cell centres
    // so that (0,0,0) samples the first entry and (1,1,1) the last.
    float scale = (u_lutSize - 1.0) / u_lutSize;
    float offset = 0.5 / u_lutSize;
    vec3 lutCoord = texColor.rgb * scale + offset;

    vec3 lutColor = texture(u_lut, lutCoord).rgb;

    // Audio-reactive: bass drives LUT mix intensity
    float mixAmt = clamp(u_intensity + u_audioBass * 0.3, 0.0, 1.0);

    fragColor = vec4(mix(texColor.rgb, lutColor, mixAmt), texColor.a);
}
