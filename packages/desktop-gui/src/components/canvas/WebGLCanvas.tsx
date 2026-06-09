import React, { useRef, useEffect, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import { WEBGL_EFFECT_TYPES, BLEND_MODE_MAP } from '../../types/effectTypes';
import type { Effect } from '../../types/effectTypes';
import {
  getOrCreateProgram,
  clearProgramCache,
  UniformCache,
  setUniform1f,
  setUniform1i,
  setUniform2f,
  createFramebufferTexturePair,
} from '../../utils/webgl';

// Import shaders as raw strings
import defaultVert from '../../shaders/passthrough.vert.glsl?raw';
import halftoneFrag from '../../shaders/halftone.frag.glsl?raw';
import analogGlitchFrag from '../../shaders/analog_glitch.frag.glsl?raw';
import bayerDitherFrag from '../../shaders/bayer_dither.frag.glsl?raw';
import epsilonGlowFrag from '../../shaders/epsilon_glow.frag.glsl?raw';
import crtPhosphorFrag from '../../shaders/crt_phosphor.frag.glsl?raw';
import temporalNoiseFrag from '../../shaders/temporal_noise.frag.glsl?raw';
import blendModesFrag from '../../shaders/blend_modes.frag.glsl?raw';

// Basic passthrough fragment shader for when no effects are enabled
const passthroughFrag = `#version 300 es
precision highp float;
uniform sampler2D u_image;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
    fragColor = texture(u_image, v_texCoord);
}
`;

const blendMaskFrag = `#version 300 es
precision highp float;
uniform sampler2D u_original;
uniform sampler2D u_glitched;
uniform sampler2D u_mask;
uniform int u_maskType; // 0=none, 1=brush, 2=radial, 3=linear
uniform vec2 u_radialCenter;
uniform float u_radialRadius;
uniform float u_linearAngle;
uniform float u_linearOffset;
uniform int u_invert;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    vec4 orig = texture(u_original, v_texCoord);
    vec4 glitched = texture(u_glitched, v_texCoord);
    float maskVal = 1.0;
    
    if (u_maskType == 1) { // brush
        maskVal = texture(u_mask, v_texCoord).r;
    } else if (u_maskType == 2) { // radial
        vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
        float dist = distance(uv, u_radialCenter);
        maskVal = 1.0 - smoothstep(u_radialRadius - 0.1, u_radialRadius + 0.1, dist);
    } else if (u_maskType == 3) { // linear
        vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
        float angleRad = u_linearAngle * 3.14159265 / 180.0;
        vec2 dir = vec2(cos(angleRad), sin(angleRad));
        float dist = dot(uv - vec2(0.5), dir) + u_linearOffset;
        maskVal = smoothstep(-0.05, 0.05, dist);
    }
    
    if (u_invert == 1) {
        maskVal = 1.0 - maskVal;
    }
    
    fragColor = mix(orig, glitched, maskVal);
}
`;

// Re-exported createProgramFromSources from utils/webgl/shader.ts

export const WebGLCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { activeEffects, mediaUrl, proxyUrl, qualityMode, maskCanvas } = useStudio();
  const previewUrl = proxyUrl || mediaUrl;

  // Use a ref for the loaded media element to avoid setState-in-effect anti-pattern.
  // Use a revision counter to trigger the render effect when media actually loads.
  const textureSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const [mediaReadyRev, setMediaReadyRev] = useState(0);

  // Track previous video element for cleanup
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load image or video when previewUrl changes (uses proxy if available)
  useEffect(() => {
    // Always clear current media first
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.load();
      videoRef.current = null;
    }
    textureSourceRef.current = null;

    if (!previewUrl) {
      // Signal that media is cleared so the render loop shows the fallback.
      // Defer state update to a microtask to avoid React 19 setState-in-effect lint.
      const id = setTimeout(() => setMediaReadyRev((r) => r + 1), 0);
      return () => clearTimeout(id);
    }

    const isVideo = previewUrl.match(/\.(mp4|webm|avi|mov|mkv)$/i);

    if (isVideo) {
      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.src = previewUrl;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;

      const onLoaded = () => {
        textureSourceRef.current = vid;
        setMediaReadyRev((r) => r + 1);
      };
      const onError = (e: Event) => {
        console.error('Video load error for URL:', previewUrl, e);
      };

      vid.addEventListener('loadeddata', onLoaded);
      vid.addEventListener('error', onError);
      vid.play().catch((e) => console.error('Video play failed:', e));
      videoRef.current = vid;

      return () => {
        vid.removeEventListener('loadeddata', onLoaded);
        vid.removeEventListener('error', onError);
        vid.pause();
        vid.src = '';
        vid.load();
        if (videoRef.current === vid) {
          videoRef.current = null;
        }
      };
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = previewUrl;

      const onLoad = () => {
        textureSourceRef.current = img;
        setMediaReadyRev((r) => r + 1);
      };
      const onError = (e: Event | string) => {
        console.error('Image load error for URL:', previewUrl, e);
      };

      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);

      return () => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      };
    }
  }, [previewUrl]);

  // Render loop with requestAnimationFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const gl = canvas.getContext('webgl2');
    if (!gl) {
      console.error('WebGL 2 not supported');
      return;
    }

    // --- Resource tracking for cleanup ---
    const resources: {
      programs: WebGLProgram[];
      textures: WebGLTexture[];
      buffers: WebGLBuffer[];
      framebuffers: WebGLFramebuffer[];
    } = {
      programs: [],
      textures: [],
      buffers: [],
      framebuffers: [],
    };

    const trackProgram = (p: WebGLProgram) => {
      resources.programs.push(p);
      return p;
    };
    const trackTexture = (t: WebGLTexture | null) => {
      if (t) resources.textures.push(t);
      return t;
    };
    const trackBuffer = (b: WebGLBuffer | null) => {
      if (b) resources.buffers.push(b);
      return b;
    };
    const trackFramebuffer = (f: WebGLFramebuffer | null) => {
      if (f) resources.framebuffers.push(f);
      return f;
    };

    // --- WebGL context loss handling ---
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('WebGL context lost');
    };
    const handleContextRestored = () => {
      console.warn('WebGL context restored — re-initializing on next effect run');
      // React will re-run this effect because we don't preventDefault on restore
      // (we preventDefault on lost to allow restore). In practice, a full re-init
      // requires re-running the effect, so we bump the revision.
      setMediaReadyRev((r) => r + 1);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // ResizeObserver for dynamic canvas sizing
    const resizeObserver = new ResizeObserver(() => {
      setMediaReadyRev((r) => r + 1);
    });
    resizeObserver.observe(wrapper);

    // Filter enabled WebGL effects
    const activeFxs = activeEffects.filter(
      (fx) => fx.enabled && WEBGL_EFFECT_TYPES.has(fx.type),
    );

    // Compile programs for each active effect, plus passthrough
    let passthroughProgram: WebGLProgram;
    try {
      passthroughProgram = trackProgram(getOrCreateProgram(gl, defaultVert, passthroughFrag));
    } catch (e) {
      console.error('Failed to compile passthrough shader:', e);
      return;
    }

    let blendMaskProgram: WebGLProgram;
    try {
      blendMaskProgram = trackProgram(getOrCreateProgram(gl, defaultVert, blendMaskFrag));
    } catch (e) {
      console.error('Failed to compile blend mask shader:', e);
      return;
    }

    let blendModesProgram: WebGLProgram;
    try {
      blendModesProgram = trackProgram(getOrCreateProgram(gl, defaultVert, blendModesFrag));
    } catch (e) {
      console.error('Failed to compile blend modes shader:', e);
      return;
    }

    const programs: { [id: string]: WebGLProgram } = {};
    for (const fx of activeFxs) {
      let fsSource = passthroughFrag;
      if (fx.type === 'halftone') fsSource = halftoneFrag;
      else if (fx.type === 'analog-glitch') fsSource = analogGlitchFrag;
      else if (fx.type === 'dither') {
        if (fx.params.ditherMode === 'halftone' || fx.params.ditherMode === 'polka_dot') {
          fsSource = halftoneFrag;
        } else {
          fsSource = bayerDitherFrag;
        }
      }
      else if (fx.type === 'epsilon-glow') fsSource = epsilonGlowFrag;
      else if (fx.type === 'crt-phosphor') fsSource = crtPhosphorFrag;
      else if (fx.type === 'temporal-noise') fsSource = temporalNoiseFrag;

      try {
        programs[fx.id] = trackProgram(getOrCreateProgram(gl, defaultVert, fsSource));
      } catch (e) {
        console.error(`Failed to compile program for ${fx.name}:`, e);
      }
    }

    // Set up geometry
    const positionBuffer = trackBuffer(gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,  1.0, -1.0,  -1.0,  1.0,
      -1.0,  1.0,  1.0, -1.0,   1.0,  1.0,
    ]), gl.STATIC_DRAW);

    const texCoordBuffer = trackBuffer(gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0.0, 0.0,  1.0, 0.0,  0.0, 1.0,
      0.0, 1.0,  1.0, 0.0,  1.0, 1.0,
    ]), gl.STATIC_DRAW);

    // Prepare source texture
    const texture = trackTexture(gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const textureSource = textureSourceRef.current;

    // Crucial: flip Y coordinate when unpacking images to match WebGL coordinates
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Compute drawing-buffer size with devicePixelRatio for HiDPI crispness
    const dpr = window.devicePixelRatio || 1;

    if (textureSource) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureSource);
      const containerWidth = wrapper.clientWidth || canvas.clientWidth || 800;
      const containerHeight = wrapper.clientHeight || canvas.clientHeight || 600;
      const sourceWidth = 'videoWidth' in textureSource ? textureSource.videoWidth : textureSource.width;
      const sourceHeight = 'videoHeight' in textureSource ? textureSource.videoHeight : textureSource.height;
      let scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);

      if (qualityMode === 'live') {
        scale *= 0.5;
      } else if (qualityMode === 'still') {
        scale *= 0.3;
      }

      // Multiply by DPR so the drawing buffer matches physical pixels
      canvas.width = Math.max(32, Math.round(sourceWidth * scale * dpr));
      canvas.height = Math.max(32, Math.round(sourceHeight * scale * dpr));
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 40, 255]));
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Create mask texture
    const maskTexture = trackTexture(gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Create temp FBO for mask blending intermediate pass
    let tempFbo: WebGLFramebuffer | null = null;
    let tempTex: WebGLTexture | null = null;
    try {
      const tempPair = createFramebufferTexturePair(gl, canvas.width, canvas.height);
      tempFbo = trackFramebuffer(tempPair.framebuffer);
      tempTex = trackTexture(tempPair.texture);
    } catch (e) {
      console.warn("Failed to create temp framebuffer:", e);
    }

    // Allocate two offscreen framebuffers and textures for intermediate passes (ping-pong)
    const fbos: WebGLFramebuffer[] = [];
    const fbTextures: WebGLTexture[] = [];
    const numPasses = activeFxs.length;

    if (numPasses > 1) {
      for (let i = 0; i < 2; i++) {
        try {
          const pair = createFramebufferTexturePair(gl, canvas.width, canvas.height);
          fbos.push(trackFramebuffer(pair.framebuffer)!);
          fbTextures.push(trackTexture(pair.texture)!);
        } catch (e) {
          console.warn("Failed to create ping-pong framebuffer:", e);
        }
      }
    }

    // Cached uniform locations via UniformCache
    const uniformCache = new UniformCache();
    const glCtx = gl; // TypeScript narrowing: gl is non-null here

    function _setUniform1f(prog: WebGLProgram, name: string, val: number) {
      setUniform1f(glCtx, uniformCache, prog, name, val);
    }
    function _setUniform1i(prog: WebGLProgram, name: string, val: number) {
      setUniform1i(glCtx, uniformCache, prog, name, val);
    }
    function _setUniform2f(prog: WebGLProgram, name: string, x: number, y: number) {
      setUniform2f(glCtx, uniformCache, prog, name, x, y);
    }

    let animationFrameId = 0;
    const startTime = Date.now();

    const render = () => {
      const time = (Date.now() - startTime) / 1000.0;

      // Refresh video frames if video is source
      if (textureSource && 'videoWidth' in textureSource) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureSource);
      }

      // Upload mask canvas to mask texture if painting/present
      if (maskCanvas) {
        gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
      }

      let currentInputTexture = texture;

      if (numPasses === 0) {
        // Simple passthrough
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(passthroughProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, currentInputTexture);

        const positionLocation = gl.getAttribLocation(passthroughProgram, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const texCoordLocation = gl.getAttribLocation(passthroughProgram, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else {
        // Multi-pass post processing
        for (let i = 0; i < numPasses; i++) {
          const fx = activeFxs[i];
          const isLastPass = (i === numPasses - 1);
          const hasMask = fx.mask && fx.mask.type !== 'none';

          // Step 1: Always render the effect to tempFbo first
          gl.bindFramebuffer(gl.FRAMEBUFFER, tempFbo);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0.0, 0.0, 0.0, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);

          const program = programs[fx.id] || passthroughProgram;
          gl.useProgram(program);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, currentInputTexture);

          const positionLocation = gl.getAttribLocation(program, 'a_position');
          gl.enableVertexAttribArray(positionLocation);
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

          const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
          gl.enableVertexAttribArray(texCoordLocation);
          gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
          gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

          _setUniform2f(program, 'uResolution', canvas.width, canvas.height);
          _setUniform2f(program, 'u_resolution', canvas.width, canvas.height);
          _setUniform1f(program, 'u_time', time);

          if (fx.type === 'halftone') {
            _setUniform1f(program, 'u_dotSize', fx.params.dotSize || 4.0);
            _setUniform1f(program, 'u_angleC', (fx.params.angleC || 15) * Math.PI / 180);
            _setUniform1f(program, 'u_angleM', (fx.params.angleM || 75) * Math.PI / 180);
            _setUniform1f(program, 'u_angleY', (fx.params.angleY || 0) * Math.PI / 180);
            _setUniform1f(program, 'u_angleK', (fx.params.angleK || 45) * Math.PI / 180);
          } else if (fx.type === 'analog-glitch') {
            _setUniform1f(program, 'u_intensity', fx.params.intensity || 0.5);
          } else if (fx.type === 'epsilon-glow') {
            _setUniform1f(program, 'u_intensity', fx.params.intensity || 0.5);
          } else if (fx.type === 'crt-phosphor') {
            _setUniform1f(program, 'u_intensity', fx.params.intensity || 0.5);
          } else if (fx.type === 'temporal-noise') {
            _setUniform1f(program, 'u_intensity', fx.params.intensity || 0.15);
            _setUniform1f(program, 'u_noiseScale', fx.params.noiseScale || 1.0);
            _setUniform1f(program, 'u_colorLevels', fx.params.numColors || 0.0);
          } else if (fx.type === 'dither') {
            if (fx.params.ditherMode === 'halftone' || fx.params.ditherMode === 'polka_dot') {
              _setUniform1f(program, 'u_dotSize', fx.params.dotSize || 8.0);
              const angle = (fx.params.angle ?? 45.0) * Math.PI / 180;
              _setUniform1f(program, 'u_angleC', angle);
              _setUniform1f(program, 'u_angleM', angle);
              _setUniform1f(program, 'u_angleY', angle);
              _setUniform1f(program, 'u_angleK', angle);
            } else {
              let levels = fx.params.numColors || 16.0;
              if (fx.params.paletteSource === 'gameboy') {
                levels = -2.0;
              } else if (fx.params.paletteSource === 'cga') {
                levels = -3.0;
              } else if (fx.params.paletteSource === 'bw') {
                levels = -1.0;
              }
              _setUniform1f(program, 'uColorLevels', levels);

              let sizeNum = 4.0;
              if (typeof fx.params.matrixSize === 'string') {
                sizeNum = parseInt(fx.params.matrixSize) || 4.0;
              } else if (typeof fx.params.matrixSize === 'number') {
                sizeNum = fx.params.matrixSize;
              }
              if (fx.params.ditherMode === 'blue_noise' || fx.params.ditherMode === 'IGN' || fx.params.ditherMode === 'error_diffusion' || fx.params.ditherMode === 'ostromoukhov') {
                sizeNum = 8.0;
              }
              _setUniform1f(program, 'uMatrixSize', sizeNum);
              _setUniform1f(program, 'uScale', fx.params.pixelScale || 1.0);
              _setUniform1i(program, 'uUseGamma', fx.params.useGamma ? 1 : 0);
            }
          }

          gl.drawArrays(gl.TRIANGLES, 0, 6);

          // Step 2: Composite effect output onto the previous state
          const destination = isLastPass ? null : fbos[i % 2];
          gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0.0, 0.0, 0.0, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);

          if (hasMask) {
            // Mask blend path
            gl.useProgram(blendMaskProgram);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, currentInputTexture);
            gl.uniform1i(gl.getUniformLocation(blendMaskProgram, 'u_original'), 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, tempTex);
            gl.uniform1i(gl.getUniformLocation(blendMaskProgram, 'u_glitched'), 1);

            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, maskTexture);
            gl.uniform1i(gl.getUniformLocation(blendMaskProgram, 'u_mask'), 2);

            const maskTypeMap = { none: 0, brush: 1, radial: 2, linear: 3 };
            const mType = maskTypeMap[fx.mask!.type] || 0;
            _setUniform1i(blendMaskProgram, 'u_maskType', mType);
            const radialCenter = fx.mask!.radialCenter || { x: 0.5, y: 0.5 };
            _setUniform2f(blendMaskProgram, 'u_radialCenter', radialCenter.x, radialCenter.y);
            _setUniform1f(blendMaskProgram, 'u_radialRadius', fx.mask!.radialRadius ?? 0.3);
            _setUniform1f(blendMaskProgram, 'u_linearAngle', fx.mask!.linearAngle ?? 0);
            _setUniform1f(blendMaskProgram, 'u_linearOffset', fx.mask!.linearOffset ?? 0);
            _setUniform1i(blendMaskProgram, 'u_invert', fx.mask!.invert ? 1 : 0);

            const posLoc = gl.getAttribLocation(blendMaskProgram, 'a_position');
            gl.enableVertexAttribArray(posLoc);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            const texLoc = gl.getAttribLocation(blendMaskProgram, 'a_texCoord');
            gl.enableVertexAttribArray(texLoc);
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
          } else {
            // Blend mode + opacity path
            gl.useProgram(blendModesProgram);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, currentInputTexture);
            gl.uniform1i(gl.getUniformLocation(blendModesProgram, 'u_base'), 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, tempTex);
            gl.uniform1i(gl.getUniformLocation(blendModesProgram, 'u_blend'), 1);

            const blendModeIndex = BLEND_MODE_MAP[fx.blendMode || 'normal'];
            _setUniform1i(blendModesProgram, 'u_blendMode', blendModeIndex);
            _setUniform1f(blendModesProgram, 'u_opacity', fx.opacity ?? 1.0);

            const posLoc = gl.getAttribLocation(blendModesProgram, 'a_position');
            gl.enableVertexAttribArray(posLoc);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            const texLoc = gl.getAttribLocation(blendModesProgram, 'a_texCoord');
            gl.enableVertexAttribArray(texLoc);
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }

          // The output texture of this pass is the input texture for the next pass
          if (!isLastPass) {
            currentInputTexture = fbTextures[i % 2];
          }
        }
      }

      const isVideo = textureSource && 'videoWidth' in textureSource;
      const animatedWebglTypes = new Set<Effect['type']>(['analog-glitch', 'crt-phosphor', 'temporal-noise']);
      const hasAnimatedEffect = activeFxs.some((fx) => animatedWebglTypes.has(fx.type));
      const isPainting = activeEffects.some(fx => fx.enabled && fx.mask && fx.mask.type !== 'none');

      if (isVideo || hasAnimatedEffect || isPainting) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      resizeObserver.disconnect();
      // Delete all tracked WebGL resources (cached programs are cleared globally)
      clearProgramCache();
      resources.textures.forEach((t) => gl.deleteTexture(t));
      resources.buffers.forEach((b) => gl.deleteBuffer(b));
      resources.framebuffers.forEach((f) => gl.deleteFramebuffer(f));
    };
  }, [activeEffects, mediaReadyRev, qualityMode, maskCanvas]);

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        className="webgl-canvas"
        data-src={mediaUrl || ''}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          boxShadow: 'var(--shadow-lg)',
          background: '#000',
          borderRadius: '4px',
          display: 'block'
        }}
      />
    </div>
  );
};
