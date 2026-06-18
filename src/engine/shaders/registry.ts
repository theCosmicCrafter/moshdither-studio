import { EffectShader } from '../webgl2/types';

class ShaderRegistry {
  private shaders: Map<string, EffectShader> = new Map();

  register(shader: EffectShader) {
    this.shaders.set(shader.id, shader);
  }

  get(id: string): EffectShader | undefined {
    return this.shaders.get(id);
  }

  has(id: string): boolean {
    return this.shaders.has(id);
  }

  list(): EffectShader[] {
    return Array.from(this.shaders.values());
  }

  listByCategory(category: string): EffectShader[] {
    return this.list().filter(s => s.id.startsWith(category));
  }
}

export const shaderRegistry = new ShaderRegistry();
