precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform int u_mode; // 0=none, 1=protanopia, 2=deuteranopia, 3=tritanopia, 4=achromatopsia

varying vec2 v_uv;

// Color blindness simulation matrices based on:
// "Digital Video Colourmaps for Checking the Legibility of Displays by Dichromats"
// by Brettel, Viénot, Mollon (1997)

vec3 rgbToLms(vec3 rgb) {
  mat3 m = mat3(
    17.8824, 43.5161, 4.11935,
    3.45565, 27.1554, 3.86713,
    0.0299566, 0.184309, 1.46709
  );
  return m * rgb;
}

vec3 lmsToRgb(vec3 lms) {
  mat3 m = mat3(
    0.080944, -0.130826, 0.116721,
    -0.0102485, 0.0540193, -0.113615,
    -0.000365294, -0.00412163, 0.693511
  );
  return m * lms;
}

vec3 simulateProtanopia(vec3 rgb) {
  vec3 lms = rgbToLms(rgb);
  // Protanopia: L channel missing. Project onto plane through (0,1,0) and (0,0,1)
  float newL = 2.02344 * lms.g - 2.5281 * lms.b;
  return lmsToRgb(vec3(newL, lms.g, lms.b));
}

vec3 simulateDeuteranopia(vec3 rgb) {
  vec3 lms = rgbToLms(rgb);
  // Deuteranopia: M channel missing
  float newM = 0.494207 * lms.r + 1.24827 * lms.b;
  return lmsToRgb(vec3(lms.r, newM, lms.b));
}

vec3 simulateTritanopia(vec3 rgb) {
  vec3 lms = rgbToLms(rgb);
  // Tritanopia: S channel missing
  float newS = -0.395913 * lms.r + 0.801109 * lms.g;
  return lmsToRgb(vec3(lms.r, lms.g, newS));
}

vec3 simulateAchromatopsia(vec3 rgb) {
  float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
  return vec3(gray);
}

void main() {
  vec4 color = texture2D(u_texture, v_uv);
  vec3 rgb = color.rgb;

  if (u_mode == 1) {
    rgb = simulateProtanopia(rgb);
  } else if (u_mode == 2) {
    rgb = simulateDeuteranopia(rgb);
  } else if (u_mode == 3) {
    rgb = simulateTritanopia(rgb);
  } else if (u_mode == 4) {
    rgb = simulateAchromatopsia(rgb);
  }

  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
}
