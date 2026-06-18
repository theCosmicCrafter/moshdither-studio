import { WebGLContext } from './WebGLContext';
import { FullscreenQuad } from './FullscreenQuad';
import { EffectShader, RenderPass } from './types';

export class EffectChain {
  private ctx: WebGLContext;
  private gl: WebGL2RenderingContext;
  private quad: FullscreenQuad;
  private width: number;
  private height: number;
  private initialized = false;

  constructor(ctx: WebGLContext, width: number, height: number) {
    this.ctx = ctx;
    this.gl = ctx.getGL();
    this.quad = new FullscreenQuad(ctx);
    this.width = width;
    this.height = height;
  }

  private ensurePingPongTextures(w: number, h: number) {
    if (this.initialized) return;
    this.ctx.createTexture('fbo_a', w, h);
    this.ctx.createTexture('fbo_b', w, h);
    this.ctx.createFramebuffer('fb_a', this.ctx.getTexture('fbo_a')!);
    this.ctx.createFramebuffer('fb_b', this.ctx.getTexture('fbo_b')!);
    this.initialized = true;
  }

  render(sourceTexture: WebGLTexture, passes: RenderPass[], shaders: Map<string, EffectShader>) {
    if (passes.length === 0) {
      // No effects, just blit source to screen
      this.blit(sourceTexture);
      return;
    }

    this.ensurePingPongTextures(this.width, this.height);
    const gl = this.gl;
    let inputTex = sourceTexture;
    let outputFB = 'fb_a';

    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i];
      const shader = shaders.get(pass.shaderId);
      if (!shader) continue;

      const program = this.ctx.getOrCreateProgram(
        pass.shaderId,
        shader.vertexSource,
        shader.fragmentSource
      );

      gl.useProgram(program);

      // Bind input texture to unit 0
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      const samplerLoc = gl.getUniformLocation(program, 'tDiffuse');
      if (samplerLoc !== null) gl.uniform1i(samplerLoc, 0);

      // Set uniforms
      for (const [name, value] of Object.entries(pass.uniforms)) {
        const loc = gl.getUniformLocation(program, name);
        if (loc === null) continue;
        if (typeof value === 'number') {
          gl.uniform1f(loc, value);
        } else if (Array.isArray(value)) {
          if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
          else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
          else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
        } else if (typeof value === 'boolean') {
          gl.uniform1i(loc, value ? 1 : 0);
        }
      }

      // Set resolution uniform
      const resLoc = gl.getUniformLocation(program, 'resolution');
      if (resLoc !== null) gl.uniform2f(resLoc, this.width, this.height);

      // Render to framebuffer or screen
      const isLastPass = i === passes.length - 1;
      if (!isLastPass) {
        const fbName = outputFB;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.ctx.getFramebuffer(fbName)!);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.quad.draw();
        inputTex = this.ctx.getTexture(fbName === 'fb_a' ? 'fbo_a' : 'fbo_b')!;
        outputFB = outputFB === 'fb_a' ? 'fb_b' : 'fb_a';
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.quad.draw();
      }
    }
  }

  private blit(sourceTexture: WebGLTexture) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

    // Use a simple pass-through shader
    const vs = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 vUv;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        vUv = a_texCoord;
      }
    `;
    const fs = `
      precision highp float;
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tDiffuse, vUv);
      }
    `;
    const program = this.ctx.getOrCreateProgram('__blit', vs, fs);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'tDiffuse'), 0);
    this.quad.draw();
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    if (this.initialized) {
      // Recreate FBO textures at new size
      this.ctx.createTexture('fbo_a', width, height);
      this.ctx.createTexture('fbo_b', width, height);
      this.ctx.createFramebuffer('fb_a', this.ctx.getTexture('fbo_a')!);
      this.ctx.createFramebuffer('fb_b', this.ctx.getTexture('fbo_b')!);
    }
  }

  destroy() {
    this.quad.destroy();
  }
}
