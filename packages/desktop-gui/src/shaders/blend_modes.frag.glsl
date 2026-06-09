#version 300 es
precision highp float;

uniform sampler2D u_base;
uniform sampler2D u_blend;
uniform int u_blendMode; // 0=Normal, 1=Multiply, 2=Screen, 3=Overlay, 4=Darken, 5=Lighten, 6=ColorDodge, 7=ColorBurn, 8=HardLight, 9=SoftLight, 10=Difference, 11=Exclusion, 12=Hue, 13=Saturation, 14=Color, 15=Luminosity
uniform float u_opacity;

in vec2 v_texCoord;
out vec4 fragColor;

// ---------------------------------------------------------------------------
// Blend mode helpers (W3C Compositing and Blending spec)
// ---------------------------------------------------------------------------

vec3 blendMultiply(vec3 base, vec3 blend) {
  return base * blend;
}

vec3 blendScreen(vec3 base, vec3 blend) {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}

vec3 blendOverlay(vec3 base, vec3 blend) {
  return vec3(
    base.r < 0.5 ? (2.0 * base.r * blend.r) : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r)),
    base.g < 0.5 ? (2.0 * base.g * blend.g) : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g)),
    base.b < 0.5 ? (2.0 * base.b * blend.b) : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b))
  );
}

vec3 blendDarken(vec3 base, vec3 blend) {
  return min(base, blend);
}

vec3 blendLighten(vec3 base, vec3 blend) {
  return max(base, blend);
}

vec3 blendColorDodge(vec3 base, vec3 blend) {
  return vec3(
    blend.r == 1.0 ? 1.0 : min(1.0, base.r / (1.0 - blend.r)),
    blend.g == 1.0 ? 1.0 : min(1.0, base.g / (1.0 - blend.g)),
    blend.b == 1.0 ? 1.0 : min(1.0, base.b / (1.0 - blend.b))
  );
}

vec3 blendColorBurn(vec3 base, vec3 blend) {
  return vec3(
    blend.r == 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - base.r) / blend.r),
    blend.g == 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - base.g) / blend.g),
    blend.b == 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - base.b) / blend.b)
  );
}

vec3 blendHardLight(vec3 base, vec3 blend) {
  return blendOverlay(blend, base);
}

vec3 blendSoftLight(vec3 base, vec3 blend) {
  return vec3(
    blend.r < 0.5 ? (2.0 * base.r * blend.r + base.r * base.r * (1.0 - 2.0 * blend.r)) : (sqrt(base.r) * (2.0 * blend.r - 1.0) + 2.0 * base.r * (1.0 - blend.r)),
    blend.g < 0.5 ? (2.0 * base.g * blend.g + base.g * base.g * (1.0 - 2.0 * blend.g)) : (sqrt(base.g) * (2.0 * blend.g - 1.0) + 2.0 * base.g * (1.0 - blend.g)),
    blend.b < 0.5 ? (2.0 * base.b * blend.b + base.b * base.b * (1.0 - 2.0 * blend.b)) : (sqrt(base.b) * (2.0 * blend.b - 1.0) + 2.0 * base.b * (1.0 - blend.b))
  );
}

vec3 blendDifference(vec3 base, vec3 blend) {
  return abs(base - blend);
}

vec3 blendExclusion(vec3 base, vec3 blend) {
  return base + blend - 2.0 * base * blend;
}

// Luminance helpers for Hue/Saturation/Color/Luminosity
float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 setLuminance(vec3 c, float l) {
  float d = l - luminance(c);
  return c + vec3(d);
}

vec3 setSaturation(vec3 c, float s) {
  float minC = min(min(c.r, c.g), c.b);
  float maxC = max(max(c.r, c.g), c.b);
  if (maxC > minC) {
    return (c - vec3(minC)) * (s / (maxC - minC)) + vec3(minC);
  }
  return vec3(0.0);
}

vec3 blendHue(vec3 base, vec3 blend) {
  return setSaturation(setLuminance(blend, luminance(base)), length(base - vec3(luminance(base))));
}

vec3 blendSaturation(vec3 base, vec3 blend) {
  return setSaturation(base, length(blend - vec3(luminance(blend))));
}

vec3 blendColor(vec3 base, vec3 blend) {
  return setLuminance(blend, luminance(base));
}

vec3 blendLuminosity(vec3 base, vec3 blend) {
  return setLuminance(base, luminance(blend));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

void main() {
  vec4 baseCol = texture(u_base, v_texCoord);
  vec4 blendCol = texture(u_blend, v_texCoord);

  vec3 result = blendCol.rgb;

  if (u_blendMode == 1) result = blendMultiply(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 2) result = blendScreen(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 3) result = blendOverlay(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 4) result = blendDarken(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 5) result = blendLighten(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 6) result = blendColorDodge(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 7) result = blendColorBurn(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 8) result = blendHardLight(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 9) result = blendSoftLight(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 10) result = blendDifference(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 11) result = blendExclusion(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 12) result = blendHue(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 13) result = blendSaturation(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 14) result = blendColor(baseCol.rgb, blendCol.rgb);
  else if (u_blendMode == 15) result = blendLuminosity(baseCol.rgb, blendCol.rgb);

  // Normal mode (0) or any mode: mix with base using opacity
  if (u_blendMode == 0) {
    result = mix(baseCol.rgb, blendCol.rgb, u_opacity);
  } else {
    result = mix(baseCol.rgb, result, u_opacity);
  }

  fragColor = vec4(result, baseCol.a);
}
