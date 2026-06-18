export type MediaType = "image" | "video" | "both";

export type EffectCategory =
  | "datamoshing"
  | "dithering"
  | "glitch"
  | "analog"
  | "pixel_geometry"
  | "optical_flow"
  | "audio_reactive"
  | "segmentation"
  | "artistic";

export interface ParameterDef {
  id: string;
  name: string;
  type: "slider" | "toggle" | "color" | "palette" | "select" | "mask";
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface EffectMeta {
  id: string;
  name: string;
  category: EffectCategory;
  mediaType: MediaType;
  parameters: ParameterDef[];
}

export interface StackEffect {
  effectId: string;
  params: Record<string, unknown>;
  mask?: string;
  maskMode?: "inside" | "outside" | "alpha";
  enabled: boolean;
}

export interface ProjectState {
  source: { type: "image" | "video"; path: string } | null;
  effectStack: StackEffect[];
  masks: Record<string, MaskDef>;
}

export interface MaskDef {
  id: string;
  type: "sam3_point" | "sam3_box" | "sam3_auto" | "manual_brush";
  params: Record<string, unknown>;
}