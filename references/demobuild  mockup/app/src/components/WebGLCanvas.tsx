import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { EffectConfig } from '@/types';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec2 uResolution;
  
  // Effect uniforms
  uniform float uGlitchAmount;
  uniform float uGlitchAngle;
  uniform float uDitherScale;
  uniform float uDitherThreshold;
  uniform float uCRDistortion;
  uniform float uCRLineIntensity;
  uniform float uCRVignette;
  uniform float uMoshIntensity;
  uniform float uMoshThreshold;
  uniform float uMoshSeed;
  
  // Effect toggles
  uniform float uEnableGlitch;
  uniform float uEnableDither;
  uniform float uEnableCRT;
  uniform float uEnableMosh;
  
  varying vec2 vUv;
  
  #define PI 3.141592653589793
  
  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  // RGB Glitch
  vec3 rgbGlitch(vec3 color, vec2 uv) {
    float noise = rand(uv + uTime * 0.5);
    vec2 offset = uGlitchAmount * vec2(cos(uGlitchAngle), sin(uGlitchAngle)) * noise;
    float r = texture2D(uTexture, uv + offset).r;
    float g = texture2D(uTexture, uv - offset * 0.5).g;
    float b = texture2D(uTexture, uv).b;
    return vec3(r, g, b);
  }
  
  // Bayer Dither
  vec3 bayerDither(vec3 color, vec2 uv) {
    mat4 bayerMatrix = mat4(
      0.0,  8.0,  2.0,  10.0,
      12.0, 4.0,  14.0, 6.0,
      3.0,  11.0, 1.0,  9.0,
      15.0, 7.0,  13.0, 5.0
    ) / 16.0;
    
    vec2 scaledUv = uv * uDitherScale;
    int x = int(mod(scaledUv.x * 100.0, 4.0));
    int y = int(mod(scaledUv.y * 100.0, 4.0));
    float bayer;
    if (x == 0) {
      if (y == 0) bayer = bayerMatrix[0][0];
      else if (y == 1) bayer = bayerMatrix[0][1];
      else if (y == 2) bayer = bayerMatrix[0][2];
      else bayer = bayerMatrix[0][3];
    } else if (x == 1) {
      if (y == 0) bayer = bayerMatrix[1][0];
      else if (y == 1) bayer = bayerMatrix[1][1];
      else if (y == 2) bayer = bayerMatrix[1][2];
      else bayer = bayerMatrix[1][3];
    } else if (x == 2) {
      if (y == 0) bayer = bayerMatrix[2][0];
      else if (y == 1) bayer = bayerMatrix[2][1];
      else if (y == 2) bayer = bayerMatrix[2][2];
      else bayer = bayerMatrix[2][3];
    } else {
      if (y == 0) bayer = bayerMatrix[3][0];
      else if (y == 1) bayer = bayerMatrix[3][1];
      else if (y == 2) bayer = bayerMatrix[3][2];
      else bayer = bayerMatrix[3][3];
    }
    
    float R = step(bayer, color.r * uDitherThreshold);
    float G = step(bayer, color.g * uDitherThreshold);
    float B = step(bayer, color.b * uDitherThreshold);
    return vec3(R, G, B);
  }
  
  // CRT Monitor
  vec3 crtMonitor(vec3 color, vec2 uv) {
    vec2 crtUv = uv * 2.0 - 1.0;
    float dist = length(crtUv);
    float distortion = 1.0 + uCRDistortion * dist * dist;
    vec2 distortedUv = (crtUv * distortion) * 0.5 + 0.5;
    
    if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
      return vec3(0.0);
    }
    
    vec4 crtColor = texture2D(uTexture, distortedUv);
    float scanline = sin(distortedUv.y * 800.0 * PI) * uCRLineIntensity;
    crtColor.rgb -= scanline;
    
    float vig = 1.0 - dist * uCRVignette;
    crtColor.rgb *= clamp(vig, 0.0, 1.0);
    
    return crtColor.rgb;
  }
  
  // DataMosh
  vec3 dataMosh(vec3 color, vec2 uv) {
    float noise = rand(vec2(uv.y * uMoshSeed, uMoshSeed));
    if (noise > uMoshThreshold) {
      float shift = rand(vec2(uv.y, uMoshSeed)) * uMoshIntensity * 0.01;
      return texture2D(uTexture, vec2(uv.x + shift, uv.y)).rgb;
    }
    return color;
  }
  
  void main() {
    vec4 tex = texture2D(uTexture, vUv);
    vec3 col = tex.rgb;
    
    if (uEnableGlitch > 0.5) {
      col = rgbGlitch(col, vUv);
    }
    if (uEnableDither > 0.5) {
      col = bayerDither(col, vUv);
    }
    if (uEnableCRT > 0.5) {
      col = crtMonitor(col, vUv);
    }
    if (uEnableMosh > 0.5) {
      col = dataMosh(col, vUv);
    }
    
    gl_FragColor = vec4(col, tex.a);
  }
`;

interface VideoPlaneProps {
  mediaSrc: string;
  effects: EffectConfig[];
}

function VideoPlane({ mediaSrc, effects }: VideoPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  const texture = useTexture(mediaSrc || '/assets/demo-texture.jpg');

  // Extract effect parameters
  const effectParams = useMemo(() => {
    const params = {
      glitch: { enabled: false, amount: 0.02, angle: 0 },
      dither: { enabled: false, scale: 1, threshold: 1 },
      crt: { enabled: false, distortion: 0.15, lineIntensity: 0.5, vignette: 1.5 },
      datamosh: { enabled: false, intensity: 10, threshold: 0.5, seed: 42 },
    };

    for (const effect of effects) {
      if (!effect.enabled) continue;
      const p = effect.parameters;
      switch (effect.category) {
        case 'glitch':
          params.glitch.enabled = true;
          params.glitch.amount = (p.find(x => x.key === 'amount')?.value as number) ?? 0.02;
          params.glitch.angle = ((p.find(x => x.key === 'angle')?.value as number) ?? 0) * (Math.PI / 180);
          break;
        case 'dither':
          params.dither.enabled = true;
          params.dither.scale = (p.find(x => x.key === 'scale')?.value as number) ?? 1;
          params.dither.threshold = (p.find(x => x.key === 'threshold')?.value as number) ?? 1;
          break;
        case 'crt':
          params.crt.enabled = true;
          params.crt.distortion = (p.find(x => x.key === 'distortion')?.value as number) ?? 0.15;
          params.crt.lineIntensity = (p.find(x => x.key === 'lineIntensity')?.value as number) ?? 0.5;
          params.crt.vignette = (p.find(x => x.key === 'vignette')?.value as number) ?? 1.5;
          break;
        case 'datamosh':
          params.datamosh.enabled = true;
          params.datamosh.intensity = (p.find(x => x.key === 'intensity')?.value as number) ?? 10;
          params.datamosh.threshold = (p.find(x => x.key === 'threshold')?.value as number) ?? 0.5;
          params.datamosh.seed = (p.find(x => x.key === 'seed')?.value as number) ?? 42;
          break;
      }
    }

    return params;
  }, [effects]);

  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uGlitchAmount: { value: effectParams.glitch.amount },
    uGlitchAngle: { value: effectParams.glitch.angle },
    uDitherScale: { value: effectParams.dither.scale },
    uDitherThreshold: { value: effectParams.dither.threshold },
    uCRDistortion: { value: effectParams.crt.distortion },
    uCRLineIntensity: { value: effectParams.crt.lineIntensity },
    uCRVignette: { value: effectParams.crt.vignette },
    uMoshIntensity: { value: effectParams.datamosh.intensity },
    uMoshThreshold: { value: effectParams.datamosh.threshold },
    uMoshSeed: { value: effectParams.datamosh.seed },
    uEnableGlitch: { value: effectParams.glitch.enabled ? 1.0 : 0.0 },
    uEnableDither: { value: effectParams.dither.enabled ? 1.0 : 0.0 },
    uEnableCRT: { value: effectParams.crt.enabled ? 1.0 : 0.0 },
    uEnableMosh: { value: effectParams.datamosh.enabled ? 1.0 : 0.0 },
  }), []);

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
      materialRef.current.uniforms.uTexture.value = texture;

      // Update effect uniforms
      materialRef.current.uniforms.uGlitchAmount.value = effectParams.glitch.amount;
      materialRef.current.uniforms.uGlitchAngle.value = effectParams.glitch.angle;
      materialRef.current.uniforms.uDitherScale.value = effectParams.dither.scale;
      materialRef.current.uniforms.uDitherThreshold.value = effectParams.dither.threshold;
      materialRef.current.uniforms.uCRDistortion.value = effectParams.crt.distortion;
      materialRef.current.uniforms.uCRLineIntensity.value = effectParams.crt.lineIntensity;
      materialRef.current.uniforms.uCRVignette.value = effectParams.crt.vignette;
      materialRef.current.uniforms.uMoshIntensity.value = effectParams.datamosh.intensity;
      materialRef.current.uniforms.uMoshThreshold.value = effectParams.datamosh.threshold;
      materialRef.current.uniforms.uMoshSeed.value = effectParams.datamosh.seed;
      materialRef.current.uniforms.uEnableGlitch.value = effectParams.glitch.enabled ? 1.0 : 0.0;
      materialRef.current.uniforms.uEnableDither.value = effectParams.dither.enabled ? 1.0 : 0.0;
      materialRef.current.uniforms.uEnableCRT.value = effectParams.crt.enabled ? 1.0 : 0.0;
      materialRef.current.uniforms.uEnableMosh.value = effectParams.datamosh.enabled ? 1.0 : 0.0;
    }
  });

  // Calculate plane size to match viewport while maintaining aspect ratio
  const img = texture.image as HTMLImageElement | undefined;
  const aspect = img ? img.width / img.height : 16 / 9;
  const vAspect = viewport.width / viewport.height;

  let planeW = viewport.width;
  let planeH = viewport.height;

  if (aspect > vAspect) {
    planeH = planeW / aspect;
  } else {
    planeW = planeH * aspect;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[planeW, planeH]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

interface EmptyStateProps {
  onImport: () => void;
}

function EmptyState({ onImport }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden">
      {/* Retro grid background */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(to bottom, transparent 0%, var(--bg-base) 100%),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 39px,
              var(--border-subtle) 39px,
              var(--border-subtle) 40px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 39px,
              var(--border-subtle) 39px,
              var(--border-subtle) 40px
            )
          `,
          opacity: 0.15,
          transform: 'perspective(500px) rotateX(60deg) scale(2) translateY(-20%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-4">
        <h2
          className="font-brand text-2xl"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
        >
          Drop media here
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          or click Import to begin
        </p>
        <button
          onClick={onImport}
          className="shimmer-btn flex items-center gap-2 px-6 py-2.5 rounded transition-all duration-150"
          style={{
            background: 'var(--accent-primary)',
            color: 'var(--text-inverse)',
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 0 0 0 var(--accent-primary-glow)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 0 20px 4px var(--accent-primary-glow)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 0 0 0 var(--accent-primary-glow)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Import Media
        </button>
      </div>
    </div>
  );
}

interface WebGLCanvasProps {
  mediaLoaded: boolean;
  mediaSrc: string | null;
  effects: EffectConfig[];
  onImport: () => void;
}

export default function WebGLCanvas({ mediaLoaded, mediaSrc, effects, onImport }: WebGLCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="flex-1 relative" style={{ background: 'var(--bg-base)' }}>
      {mediaLoaded && mediaSrc ? (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 5], zoom: 1 }}
          gl={{ antialias: false, alpha: false }}
          style={{ width: '100%', height: '100%' }}
          frameloop="always"
        >
          <color attach="background" args={['#0A0A0F']} />
          <VideoPlane mediaSrc={mediaSrc} effects={effects} />
        </Canvas>
      ) : (
        <EmptyState onImport={onImport} />
      )}
    </div>
  );
}
