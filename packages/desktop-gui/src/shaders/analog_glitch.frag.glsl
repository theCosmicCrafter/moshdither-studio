#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_time;
uniform float u_intensity;
uniform vec2 u_resolution;

in vec2 v_texCoord;
out vec4 fragColor;

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_texCoord;
    
    // Chromatic aberration
    float rOffset = u_intensity * 0.05 * rand(vec2(u_time, uv.y));
    float bOffset = -u_intensity * 0.05 * rand(vec2(u_time, uv.y));
    
    // Scanline distortion
    float scanline = sin(uv.y * 800.0 * rand(vec2(u_time, 1.0))) * 0.04 * u_intensity;
    uv.x += scanline;
    
    // Horizontal tearing
    if(rand(vec2(u_time, floor(uv.y * 20.0))) > 0.95 * (1.0 - u_intensity)) {
        uv.x += rand(vec2(u_time, uv.y)) * 0.2 * u_intensity;
    }

    vec4 colR = texture(u_image, vec2(uv.x + rOffset, uv.y));
    vec4 colG = texture(u_image, uv);
    vec4 colB = texture(u_image, vec2(uv.x + bOffset, uv.y));

    fragColor = vec4(colR.r, colG.g, colB.b, colG.a);
}
