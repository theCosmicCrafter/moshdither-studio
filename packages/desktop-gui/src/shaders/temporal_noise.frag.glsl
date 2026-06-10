#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_intensity;     // Controls noise strength/opacity
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_noiseScale;    // Size of the noise grains (e.g. 1.0 to 8.0)
uniform float u_colorLevels;   // Optional quantization levels to dither with noise

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

// Gold Noise function - extremely fast and clean distribution
const float PHI = 1.61803398874989484820459; // Golden Ratio

float goldNoise(vec2 xy, float seed) {
    return fract(tan(distance(xy * PHI, xy) * seed) * xy.x);
}

void main() {
    // Pixelation / grain block
    vec2 pos = v_texCoord * u_resolution;
    vec2 blockPos = floor(pos / u_noiseScale) * u_noiseScale;
    vec2 texCoord = (blockPos + 0.5) / u_resolution;

    vec4 texColor = texture(u_image, texCoord);
    vec3 color = texColor.rgb;

    // Use a time-based seed that updates periodically (at 24 FPS)
    float timeSeed = floor(u_time * 24.0) + 1.0;

    // Audio-reactive: bass drives noise intensity
    float audioIntensity = u_intensity * (1.0 + u_audioBass * 2.0);

    // Generate noise value in range [-0.5, 0.5]
    float noiseVal = goldNoise(blockPos, timeSeed) - 0.5;

    // Blend the noise into the color
    vec3 noisyColor = color + noiseVal * audioIntensity;

    // If quantization is set, snap colors for a dithered look
    if (u_colorLevels > 0.0) {
        noisyColor = floor(noisyColor * u_colorLevels + 0.5) / u_colorLevels;
    }

    // Clamping to avoid out-of-bounds colors
    noisyColor = clamp(noisyColor, vec3(0.0), vec3(1.0));

    fragColor = vec4(noisyColor, texColor.a);
}
