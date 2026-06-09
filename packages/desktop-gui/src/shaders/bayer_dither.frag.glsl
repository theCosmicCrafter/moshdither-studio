#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uColorLevels;
uniform float uMatrixSize;
uniform float uScale;
uniform bool uUseGamma; // Gamma correction toggle

// Bayer matrices
const int bayer2[4] = int[](0, 2, 3, 1);
const int bayer4[16] = int[](
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
);
const int bayer8[64] = int[](
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(int x, int y, int size) {
    if (size == 8) return float(bayer8[(y % 8) * 8 + (x % 8)]) / 64.0;
    if (size == 4) return float(bayer4[(y % 4) * 4 + (x % 4)]) / 16.0;
    return float(bayer2[(y % 2) * 2 + (x % 2)]) / 4.0;
}

// Color science formulas for sRGB to Linear and back
float srgbToLinear(float c) {
    return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}

float linearToSrgb(float c) {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

vec3 srgbToLinearVec3(vec3 col) {
    return vec3(srgbToLinear(col.r), srgbToLinear(col.g), srgbToLinear(col.b));
}

vec3 linearToSrgbVec3(vec3 col) {
    return vec3(linearToSrgb(col.r), linearToSrgb(col.g), linearToSrgb(col.b));
}

// CIE 1931 perceived luminance weighting
float perceivedLuminance(vec3 col) {
    return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
}

void main() {
    // Pixelation block
    vec2 pos = v_texCoord * uResolution;
    vec2 blockPos = floor(pos / uScale) * uScale;
    vec2 texCoord = (blockPos + 0.5) / uResolution;

    vec4 originalColor = texture(uImage, texCoord);
    vec3 color = originalColor.rgb;

    if (uUseGamma) {
        color = srgbToLinearVec3(color);
    }
    
    int x = int(blockPos.x / uScale);
    int y = int(blockPos.y / uScale);
    
    float threshold = getBayerValue(x, y, int(uMatrixSize)) - 0.5;
    
    if (uColorLevels < 0.0) {
        float luma = perceivedLuminance(color);
        float dithered = luma + threshold;
        vec3 snapped;
        
        if (uColorLevels == -1.0) { // Black & White
            snapped = dithered > 0.5 ? vec3(1.0) : vec3(0.0);
        } else if (uColorLevels == -2.0) { // GameBoy
            if (dithered < 0.25) snapped = vec3(0.058, 0.219, 0.058);
            else if (dithered < 0.5) snapped = vec3(0.188, 0.384, 0.188);
            else if (dithered < 0.75) snapped = vec3(0.545, 0.674, 0.058);
            else snapped = vec3(0.607, 0.737, 0.058);
        } else if (uColorLevels == -3.0) { // CGA
            if (dithered < 0.33) snapped = vec3(0.0, 0.0, 0.0);
            else if (dithered < 0.66) snapped = vec3(1.0, 0.33, 1.0);
            else snapped = vec3(0.33, 1.0, 1.0);
        } else {
            snapped = dithered > 0.5 ? vec3(1.0) : vec3(0.0);
        }
        
        if (uUseGamma) {
            snapped = linearToSrgbVec3(snapped);
        }
        outColor = vec4(snapped, originalColor.a);
    } else {
        // RGB Quantization
        vec3 dithered = color + threshold * (1.0 / uColorLevels);
        vec3 snapped = floor(dithered * uColorLevels + 0.5) / uColorLevels;
        
        if (uUseGamma) {
            snapped = linearToSrgbVec3(snapped);
        }
        outColor = vec4(snapped, originalColor.a);
    }
}
