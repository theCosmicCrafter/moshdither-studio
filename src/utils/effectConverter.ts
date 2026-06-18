import { RenderPass } from '../engine/webgl2/types';
import { EffectShader } from '../engine/webgl2/types';

/** Frontend effect parameter state as stored in zustand. */
export interface ActiveEffectState {
  id: string;
  shaderId: string;
  enabled: boolean;
  params: Record<string, number | number[] | boolean>;
}

/**
 * Convert frontend active effects into WebGL render passes.
 * Skips disabled effects and effects with amount === 0 (no-op optimization).
 */
export function toRenderPasses(
  effects: ActiveEffectState[],
  shaders: Map<string, EffectShader>
): RenderPass[] {
  const passes: RenderPass[] = [];

  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (!shaders.has(effect.shaderId)) continue;

    // No-op optimization: if 'amount' param is 0, skip this effect
    if (effect.params.amount !== undefined) {
      const amt = typeof effect.params.amount === 'number' ? effect.params.amount : 0;
      if (Math.abs(amt) < 0.001) continue;
    }

    passes.push({
      shaderId: effect.shaderId,
      inputTexture: passes.length === 0 ? 'source' : `pass_${passes.length - 1}`,
      outputFramebuffer: `pass_${passes.length}`,
      uniforms: effect.params,
    });
  }

  return passes;
}

/**
 * Convert frontend effects to Rust IPC command payload.
 * Returns JSON-serializable parameters for the Rust EffectStack.
 *
 * NOTE: Only effects that have a Rust backend equivalent are included.
 * WebGL-only effects (LUT, overlays, some shaders) are skipped for export
 * and will show "Preview only" badge in UI.
 */
export function toRustEffectStack(effects: ActiveEffectState[]): Array<{
  effect_id: string;
  params: Record<string, unknown>;
}> {
  const rustEffects: Array<{ effect_id: string; params: Record<string, unknown> }> = [];

  const shaderToRustId: Record<string, string> = {
    // Map WebGL shader IDs to Rust effect IDs
    pixelate: 'pixelate',
    posterize: 'posterize',
    hue_saturation: 'hue_shift',
    rgb_shift: 'rgb_shift',
    invert: 'invert',
    noise_grain: 'noise_uniform',
    // Effects without Rust equivalents are skipped
  };

  for (const effect of effects) {
    if (!effect.enabled) continue;

    const rustId = shaderToRustId[effect.shaderId];
    if (!rustId) continue; // WebGL-only effect

    const params: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(effect.params)) {
      params[key] = val;
    }

    rustEffects.push({ effect_id: rustId, params });
  }

  return rustEffects;
}

/**
 * Check if a shader effect has a Rust backend equivalent.
 */
export function hasRustEquivalent(shaderId: string): boolean {
  const shaderToRustId: Record<string, string> = {
    pixelate: 'pixelate',
    posterize: 'posterize',
    hue_saturation: 'hue_shift',
    rgb_shift: 'rgb_shift',
    invert: 'invert',
    noise_grain: 'noise_uniform',
  };
  return shaderId in shaderToRustId;
}
