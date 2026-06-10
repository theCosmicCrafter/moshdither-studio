#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_intensity;
uniform vec2 u_resolution;

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
    
    // High-pass filter to extract highlights
    vec3 highlight = max(texColor.rgb - vec3(0.5), vec3(0.0)) * 2.0;
    
    // A 9-tap blur filter for visual glow
    vec3 blur = vec3(0.0);
    float dx = 4.0 / u_resolution.x;
    float dy = 4.0 / u_resolution.y;
    
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec3 sampleCol = texture(u_image, v_texCoord + vec2(float(x) * dx, float(y) * dy)).rgb;
            blur += max(sampleCol - vec3(0.5), vec3(0.0)) * 2.0;
        }
    }
    blur /= 9.0;
    
    // Audio-reactive: average energy drives glow intensity
    float glowIntensity = u_intensity * (1.0 + u_audioAverage);

    // Combine with original using additive screen blend
    vec3 result = texColor.rgb + blur * glowIntensity;
    fragColor = vec4(result, texColor.a);
}
