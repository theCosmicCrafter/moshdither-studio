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
    vec2 uv = v_texCoord;
    
    // Subtle chromatic aberration (red/blue offset)
    float offset = 0.003 * u_intensity;
    float r = texture(u_image, uv + vec2(offset, 0.0)).r;
    float g = texture(u_image, uv).g;
    float b = texture(u_image, uv - vec2(offset, 0.0)).b;
    vec3 col = vec3(r, g, b);
    
    // Audio-reactive: RMS drives scanline intensity
    float scanIntensity = u_intensity * (1.0 + u_audioRms);

    // Simulating CRT scanlines (sine-wave brightness fluctuation)
    float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.15 * scanIntensity;
    col -= vec3(scanline);
    
    // CRT vignette / curvature simulation (darken edges)
    vec2 d = abs(uv - 0.5) * 2.0;
    float vignette = 1.0 - (d.x * d.x + d.y * d.y) * 0.25;
    col *= vignette;
    
    fragColor = vec4(col, texture(u_image, uv).a);
}
