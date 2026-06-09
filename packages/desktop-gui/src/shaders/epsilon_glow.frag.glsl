#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_intensity;
uniform vec2 u_resolution;

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
    
    // Combine with original using additive screen blend
    vec3 result = texColor.rgb + blur * u_intensity;
    fragColor = vec4(result, texColor.a);
}
