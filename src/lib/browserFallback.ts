import type { EffectMeta, ParameterDef } from "../store";
import { rustToWebGL, type WebGLMapping } from "../utils/effectConverter";
import { shaderRegistry } from "../engine/shaders";

const CATEGORY_MAP: Record<string, string> = {
  pixel_geo: "pixel_geometry",
  analog: "analog",
  color: "color",
  artistic: "artistic",
  noise: "noise",
  dithering: "dithering",
  glitch: "glitch",
  audio_reactive: "audio_reactive",
  datamoshing: "datamoshing",
  segmentation: "segmentation",
  composite: "composite",
  overlay: "overlay",
};

function deriveCategory(effectId: string): string {
  const prefix = effectId.split(".")[0];
  return CATEGORY_MAP[prefix] || prefix;
}

function paramTypeFromUniform(udef: { type: string }): ParameterDef["type"] {
  if (udef.type === "bool") return "toggle";
  if (udef.type === "sampler2D") return "palette";
  return "slider";
}

function deriveParameters(paramMap: Record<string, string>, shaderId: string): ParameterDef[] {
  const shader = shaderRegistry.get(shaderId);
  const params: ParameterDef[] = [];

  for (const [rustParam, webglUniform] of Object.entries(paramMap)) {
    const udef = shader?.uniforms.find((u) => u.name === webglUniform);
    const type = udef?.type || "float";
    const labelName = rustParam.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    params.push({
      id: rustParam,
      name: labelName,
      type: paramTypeFromUniform({ type }),
      default: udef?.default ?? 0,
      min: type === "float" ? 0 : undefined,
      max: type === "float" ? 100 : undefined,
      step: type === "float" ? 1 : undefined,
      options: null,
    });
  }

  return params;
}

export function getFallbackEffects(): EffectMeta[] {
  const effects: EffectMeta[] = [];

  for (const [effectId, mapping] of Object.entries(rustToWebGL) as [string, WebGLMapping][]) {
    if (!shaderRegistry.has(mapping.shaderId)) continue;

    const shader = shaderRegistry.get(mapping.shaderId);
    if (!shader) continue;

    effects.push({
      id: effectId,
      name: shader.name,
      category: deriveCategory(effectId),
      media_type: "both",
      parameters: deriveParameters(mapping.paramMap, mapping.shaderId),
    });
  }

  return effects;
}

export function isTauriAvailable(): boolean {
  try {
    return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
  } catch {
    return false;
  }
}
