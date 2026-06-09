#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_dotSize; // Size of the halftone dots
uniform float u_angleC;  // Angle for Cyan
uniform float u_angleM;  // Angle for Magenta
uniform float u_angleY;  // Angle for Yellow
uniform float u_angleK;  // Angle for Key (Black)

in vec2 v_texCoord;
out vec4 fragColor;

mat2 rotate(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

float halftone(vec2 coord, float angle, float intensity, float dotSize) {
    vec2 rotatedCoord = rotate(angle) * coord;
    vec2 pos = mod(rotatedCoord, dotSize) - dotSize * 0.5;
    
    // Distance from center of the cell
    float dist = length(pos);
    
    // Max radius of the dot based on intensity
    float radius = dotSize * 0.7071 * (1.0 - intensity); // 0.7071 is approx 1/sqrt(2)
    
    // Smoothstep for anti-aliased dots
    return smoothstep(radius, radius + 1.0, dist);
}

void main() {
    vec4 texColor = texture(u_image, v_texCoord);
    
    // Simple RGB to CMYK approximation
    float k = 1.0 - max(max(texColor.r, texColor.g), texColor.b);
    float c = (1.0 - texColor.r - k) / (1.0 - k + 0.0001);
    float m = (1.0 - texColor.g - k) / (1.0 - k + 0.0001);
    float y = (1.0 - texColor.b - k) / (1.0 - k + 0.0001);
    
    vec2 screenCoord = v_texCoord * u_resolution;
    
    float dtC = halftone(screenCoord, u_angleC, c, u_dotSize);
    float dtM = halftone(screenCoord, u_angleM, m, u_dotSize);
    float dtY = halftone(screenCoord, u_angleY, y, u_dotSize);
    float dtK = halftone(screenCoord, u_angleK, k, u_dotSize);
    
    // Reconstruct RGB from CMYK dots
    float r = (1.0 - dtC * c) * (1.0 - dtK * k);
    float g = (1.0 - dtM * m) * (1.0 - dtK * k);
    float b = (1.0 - dtY * y) * (1.0 - dtK * k);
    
    fragColor = vec4(r, g, b, texColor.a);
}
