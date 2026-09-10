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

/** "audio_reactive" -> "Audio Reactive" */
function humanize(snake: string): string {
  return snake.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function deriveCategory(effectId: string): string {
  const prefix = effectId.split(".")[0];
  return CATEGORY_MAP[prefix] || prefix;
}

/**
 * Human-readable name for an effect in the browser fallback list.
 *
 * ALWAYS derived from the effect ID, never from the shader. A shader is an
 * implementation shared by many effects, so its name identifies none of them:
 * twelve datamoshing effects share `temporalDatamoshing`, and taking the
 * shader's name labelled every one of them "Temporal Datamoshing". 29 of the 96
 * mapped effects collapsed onto a duplicated name this way, leaving them
 * indistinguishable in the browser effect list.
 *
 * This previously special-cased only `pass_through`, for exactly that reason
 * ("would label every one of them Pass Through") -- the right diagnosis applied
 * to one shader instead of to all of them.
 *
 * Note `mask_isolate` is the one effect ID that carries no `category.` prefix,
 * so the local part is the whole ID.
 */
function deriveName(effectId: string): string {
  const local = effectId.includes(".") ? effectId.slice(effectId.indexOf(".") + 1) : effectId;
  return local.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
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
      name: deriveName(effectId),
      category: deriveCategory(effectId),
      media_type: "both",
      parameters: deriveParameters(mapping.paramMap, mapping.shaderId),
    });
  }

  // Two effects in different categories can share a local ID -- pixel_geo.pixelate
  // and audio_reactive.pixelate both derive "Pixelate". Qualify every member of a
  // colliding group with its category, rather than letting one of them keep the
  // bare name, so the result does not depend on iteration order.
  const nameCounts = new Map<string, number>();
  for (const e of effects) nameCounts.set(e.name, (nameCounts.get(e.name) ?? 0) + 1);
  for (const e of effects) {
    if ((nameCounts.get(e.name) ?? 0) > 1) {
      e.name = `${humanize(e.category)} ${e.name}`;
    }
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
