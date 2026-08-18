import { LUTLoader } from "../lut/loader";
import { FullscreenQuad } from "./FullscreenQuad";
import { EffectShader, RenderPass } from "./types";
import { WebGLContext } from "./WebGLContext";

const MASK_MODE_MAP: Record<string, number> = {
  inside: 0,
  outside: 1,
  alpha: 2,
};

export class EffectChain {
  private ctx: WebGLContext;
  private gl: WebGL2RenderingContext;
  private quad: FullscreenQuad;
  private width: number;
  private height: number;
  private initialized = false;
  private lutLoader: LUTLoader;
  // LRU-bounded cache of uploaded mask textures. Mask base64 strings are used as
  // keys; each value is a GPU RGBA texture whose memory is reclaimed on eviction.
  // Without bounding, long editing sessions with many distinct masks would leak
  // GPU memory indefinitely.
  private maskTextureCache = new Map<string, WebGLTexture>();
  /** Labels already reported by `ckpt`, so a per-frame fault logs once. */
  private reportedGlFaults = new Set<string>();
  private static readonly MASK_CACHE_MAX = 8;

  constructor(ctx: WebGLContext, width: number, height: number) {
    this.ctx = ctx;
    this.gl = ctx.getGL();
    this.quad = new FullscreenQuad(ctx);
    this.lutLoader = new LUTLoader(ctx);
    this.width = width;
    this.height = height;
  }

  /**
   * Drop cached mask textures and force FBO recreation. Called when the WebGL
   * context is restored so stale resources are not reused.
   */
  reset() {
    this.maskTextureCache.clear();
    this.savedPreviousTex = null;
    this.initialized = false;
    this.quad.reset();
    this.lutLoader.clearCache();
  }

  private async getMaskTexture(maskB64: string): Promise<WebGLTexture | null> {
    if (this.gl.isContextLost()) {
      return null;
    }
    // An empty/missing mask string is not a valid image to load -- and
    // critically, `img.src = ""` is a well-known browser quirk that often
    // fires neither onload nor onerror, hanging the promise below forever.
    // Since the caller awaits this from inside render()'s isRendering-guarded
    // section, a permanently-hung promise means isRendering never resets to
    // false, and the animation loop's next tick (and every tick after it)
    // silently no-ops on the `if (isRendering) return` guard -- the preview
    // freezes with ~0% CPU, not a crash or a visible error. Treat it as "no
    // mask" instead of attempting to load it.
    if (!maskB64) {
      return null;
    }
    // LRU touch: re-insert at the tail (most recently used) so the head holds
    // the least recently used entry. Map preserves insertion order in JS.
    const cached = this.maskTextureCache.get(maskB64);
    if (cached) {
      this.maskTextureCache.delete(maskB64);
      this.maskTextureCache.set(maskB64, cached);
      return cached;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Bounded with a timeout for the same reason: onload/onerror not firing
    // isn't limited to the empty-string case (a malformed data URL or a
    // webview quirk can do it too), and any of those must not be able to
    // hang this promise forever.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Mask image failed to load within 5s: ${maskB64.slice(0, 40)}...`)),
        5000
      );
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Mask image failed to load: ${maskB64.slice(0, 40)}...`));
      };
      img.src = maskB64;
    });
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.evictMaskCacheIfNeeded();
    this.maskTextureCache.set(maskB64, tex);
    return tex;
  }

  /**
   * Evict least-recently-used mask textures until the cache is within its bound.
   * Deleted GPU textures are reclaimed by the driver. The first entry of a JS
   * Map is the oldest insertion that has not been re-touched, which is exactly
   * the LRU victim.
   */
  private evictMaskCacheIfNeeded() {
    while (this.maskTextureCache.size >= EffectChain.MASK_CACHE_MAX) {
      const oldest = this.maskTextureCache.keys().next();
      if (oldest.done) break;
      const key = oldest.value as string;
      const tex = this.maskTextureCache.get(key);
      if (tex) {
        this.gl.deleteTexture(tex);
      }
      this.maskTextureCache.delete(key);
    }
  }

  private ensurePingPongTextures(w: number, h: number) {
    if (this.initialized) return;
    this.ctx.createTexture("fbo_a", w, h);
    this.ctx.createTexture("fbo_b", w, h);
    this.ctx.createTexture("fbo_c", w, h);
    this.ctx.createFramebuffer("fb_a", this.ctx.getTexture("fbo_a")!);
    this.ctx.createFramebuffer("fb_b", this.ctx.getTexture("fbo_b")!);
    this.ctx.createFramebuffer("fb_c", this.ctx.getTexture("fbo_c")!);
    this.initialized = true;
  }

  /**
   * Notified when a sampler2D texture fails to load. The chain keeps
   * rendering without it; this exists so the UI can tell the user why an
   * effect silently did nothing, rather than leaving it to the console.
   */
  onTextureError?: (uniform: string, url: string, error: unknown) => void;

  async render(
    sourceTexture: WebGLTexture,
    passes: RenderPass[],
    shaders: Map<string, EffectShader>
  ) {
    if (this.gl.isContextLost()) {
      console.warn("[EffectChain] render skipped: WebGL context lost");
      return;
    }

    if (passes.length === 0) {
      // No effects, just blit source to screen
      this.blit(sourceTexture);
      return;
    }

    this.ensurePingPongTextures(this.width, this.height);
    const gl = this.gl;
    let inputTex = sourceTexture;
    let outputFB = "fb_a";
    // Texture units 0, 2 and 3 are reserved by the chain itself: 0 is the pass
    // input, 2 the pre-effect frame and 3 the mask (see the maskBlend binding
    // below). Extra samplers such as a LUT must therefore start above all of
    // them.
    //
    // This counter used to start at 1 and was never reset, so it ran 1, 2, 3...
    // across the whole render: a *second* LUT in the stack landed on unit 2 and
    // a third on unit 3. Passes without a mask then unbind those very units,
    // wiping the texture that had just been bound there, and sampling an
    // unbound texture returns black -- the preview went black the moment a
    // second LUT was added, while a single LUT worked fine.
    const FIRST_FREE_TEXTURE_UNIT = 4;
    let nextTextureUnit = FIRST_FREE_TEXTURE_UNIT;
    let renderedAnyPass = false;

    // Expand passes: after each pass with a mask, insert a maskBlend pass
    const expandedPasses: RenderPass[] = [];
    for (const pass of passes) {
      expandedPasses.push(pass);
      if (pass.maskB64) {
        expandedPasses.push({
          shaderId: "maskBlend",
          inputTexture: pass.outputFramebuffer,
          outputFramebuffer: `mask_${expandedPasses.length}`,
          uniforms: { u_mode: MASK_MODE_MAP[pass.maskMode ?? "inside"] ?? 0 },
          maskB64: null, // prevent recursion
          maskMode: undefined,
        });
      }
    }

    // Pre-compute the index of the last renderable pass so that skipped passes
    // (missing shaders) don't cause the last rendered pass to go to a framebuffer
    // instead of the screen.
    let lastRenderableIdx = -1;
    for (let i = expandedPasses.length - 1; i >= 0; i--) {
      if (shaders.has(expandedPasses[i].shaderId)) {
        lastRenderableIdx = i;
        break;
      }
    }

    for (let i = 0; i < expandedPasses.length; i++) {
      // Units are per-pass: nothing bound for one pass needs to survive into
      // the next, and letting the counter climb would eventually walk past
      // MAX_COMBINED_TEXTURE_IMAGE_UNITS on a long stack.
      nextTextureUnit = FIRST_FREE_TEXTURE_UNIT;
      const pass = expandedPasses[i];
      const shader = shaders.get(pass.shaderId);
      if (!shader) {
        console.warn(`[EffectChain] Pass ${i}: shader "${pass.shaderId}" not found — skipping`);
        continue;
      }

      // For maskBlend passes, we need the pre-effect texture (saved before the effect pass)
      const isMaskBlend = pass.shaderId === "maskBlend";
      let previousTex: WebGLTexture | null = null;
      let maskTex: WebGLTexture | null = null;

      if (isMaskBlend) {
        // inputTex is the effect output; we need the pre-effect frame and mask
        // The pre-effect texture was saved before the effect pass
        previousTex = this.savedPreviousTex;
        const origPass = expandedPasses[i - 1];
        if (origPass?.maskB64) {
          maskTex = await this.getMaskTexture(origPass.maskB64);
        }
        if (!previousTex || !maskTex) {
          // Can't do mask blend without both textures — skip
          continue;
        }
      } else if (pass.maskB64) {
        // Save the pre-effect input texture for the upcoming maskBlend pass
        this.savedPreviousTex = inputTex;
      }

      const program = this.ctx.getOrCreateProgram(
        pass.shaderId,
        shader.vertexSource,
        shader.fragmentSource
      );

      gl.useProgram(program);
      this.ckpt(`useProgram(${pass.shaderId})`);

      // Bind input texture to unit 0
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      const samplerLoc = gl.getUniformLocation(program, "tDiffuse");
      if (samplerLoc !== null) gl.uniform1i(samplerLoc, 0);
      this.ckpt(`bind input texture (${pass.shaderId})`);

      // For maskBlend: bind tPrevious to unit 2 and tMask to unit 3
      if (isMaskBlend && previousTex && maskTex) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, previousTex);
        const prevLoc = gl.getUniformLocation(program, "tPrevious");
        if (prevLoc !== null) gl.uniform1i(prevLoc, 2);

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, maskTex);
        const maskLoc = gl.getUniformLocation(program, "tMask");
        if (maskLoc !== null) gl.uniform1i(maskLoc, 3);
      } else if (!isMaskBlend) {
        // Clean up stale texture bindings from previous maskBlend pass
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
      }

      // Set uniforms from pass
      for (const [name, value] of Object.entries(pass.uniforms)) {
        const loc = gl.getUniformLocation(program, name);
        if (loc === null) continue;
        // Determine declared type from shader definition
        const udef = shader.uniforms.find((u) => u.name === name);
        const type = udef?.type;
        if (typeof value === "string") {
          if (type === "sampler2D") {
            // A texture that will not load must not take the whole preview
            // with it. This await used to be unguarded, so one failed LUT
            // image rejected out of render() entirely -- PreviewViewport
            // caught it, logged "WebGL render failed", and left the canvas
            // undrawn. The user saw the preview go black on applying a LUT,
            // with the only explanation in a console they cannot see.
            //
            // Skipping the sampler renders the frame ungraded instead, which
            // is wrong but visible and recoverable.
            try {
              const tex = await this.lutLoader.loadLUT(value);
              const unit = nextTextureUnit++;
              gl.activeTexture(gl.TEXTURE0 + unit);
              gl.bindTexture(gl.TEXTURE_2D, tex);
              gl.uniform1i(loc, unit);
            } catch (err) {
              console.error(
                `[EffectChain] texture for uniform "${name}" failed to load (${value}); ` +
                  `rendering this pass without it`,
                err
              );
              this.onTextureError?.(name, value, err);
            }
          }
        } else if (typeof value === "number") {
          if (type === "int") {
            gl.uniform1i(loc, Math.floor(value));
          } else {
            gl.uniform1f(loc, value);
          }
        } else if (Array.isArray(value)) {
          if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
          else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
          else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
        } else if (typeof value === "boolean") {
          gl.uniform1i(loc, value ? 1 : 0);
        }
      }

      this.ckpt(`pass uniforms (${pass.shaderId})`);

      // Set default uniform values from shader definition for uniforms not already set
      for (const u of shader.uniforms) {
        if (pass.uniforms[u.name] !== undefined) continue;
        const loc = gl.getUniformLocation(program, u.name);
        if (loc === null) continue;
        if (u.type === "float" && typeof u.default === "number") {
          gl.uniform1f(loc, u.default);
        } else if (u.type === "int" && typeof u.default === "number") {
          gl.uniform1i(loc, Math.floor(u.default));
        } else if (u.type === "vec3" && Array.isArray(u.default) && u.default.length === 3) {
          gl.uniform3f(loc, u.default[0], u.default[1], u.default[2]);
        } else if (u.type === "vec2" && Array.isArray(u.default) && u.default.length === 2) {
          gl.uniform2f(loc, u.default[0], u.default[1]);
        } else if (u.type === "vec4" && Array.isArray(u.default) && u.default.length === 4) {
          gl.uniform4f(loc, u.default[0], u.default[1], u.default[2], u.default[3]);
        } else if (u.type === "bool" && typeof u.default === "boolean") {
          gl.uniform1i(loc, u.default ? 1 : 0);
        }
      }

      this.ckpt(`default uniforms (${pass.shaderId})`);

      // Set resolution uniform
      const resLoc = gl.getUniformLocation(program, "resolution");
      if (resLoc !== null) gl.uniform2f(resLoc, this.width, this.height);

      // Set viewport to match render target
      gl.viewport(0, 0, this.width, this.height);

      // For maskBlend passes: check if previousTex (bound as sampler on TEXTURE2)
      // or inputTex (bound on TEXTURE0) is the same texture attached to the
      // current outputFB. If so, swap output to the other framebuffer to prevent
      // a WebGL feedback loop.
      const isLastPass = i === lastRenderableIdx;
      if (isMaskBlend && !isLastPass) {
        // Check all three framebuffers to find one that doesn't conflict
        // with either previousTex (TEXTURE2) or inputTex (TEXTURE0)
        const fbOptions = ["fb_a", "fb_b", "fb_c"];
        const texFor = (fb: string) =>
          fb === "fb_a"
            ? this.ctx.getTexture("fbo_a")
            : fb === "fb_b"
              ? this.ctx.getTexture("fbo_b")
              : this.ctx.getTexture("fbo_c");
        const safe = fbOptions.find((fb) => texFor(fb) !== previousTex && texFor(fb) !== inputTex);
        if (safe) outputFB = safe;
      }

      // Render to framebuffer or screen
      if (!isLastPass) {
        const fbName = outputFB;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.ctx.getFramebuffer(fbName)!);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.quad.draw();
        this.ckpt(`draw to ${fbName} (${pass.shaderId})`);
        inputTex = this.ctx.getTexture(
          fbName === "fb_a" ? "fbo_a" : fbName === "fb_b" ? "fbo_b" : "fbo_c"
        )!;
        // Next output: pick a framebuffer that isn't the one we just wrote to
        outputFB = fbName === "fb_a" ? "fb_b" : "fb_a";
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.quad.draw();
        this.ckpt(`draw to screen (${pass.shaderId})`);
      }
      renderedAnyPass = true;
    }

    // If no pass was rendered (all shaders missing), fall back to blit
    if (!renderedAnyPass) {
      console.warn("[EffectChain] No passes were rendered — falling back to blit");
      this.blit(sourceTexture);
    }
  }

  /**
   * Dev-only labelled GL error checkpoint.
   *
   * PreviewViewport calls `gl.getError()` once at the end of a frame, which
   * reports *that* something failed but not *what* -- in practice a wall of
   * bare "WebGL error after render: 1282" with no way to attribute it (741 of
   * them in one session). getError also clears the flag, so a single trailing
   * call collapses every fault in the frame into one number.
   *
   * Calling it at labelled points names the offending operation instead. This
   * is deliberately DEV-only: getError forces a synchronous pipeline flush, so
   * it must not sit in the per-pass hot path of a release build.
   *
   * Each label reports once per chain instance -- a fault that recurs every
   * frame is one bug, not hundreds.
   */
  private ckpt(label: string) {
    if (!import.meta.env.DEV) return;
    const err = this.gl.getError();
    if (err === this.gl.NO_ERROR) return;
    const names: Record<number, string> = {
      0x0500: "INVALID_ENUM",
      0x0501: "INVALID_VALUE",
      0x0502: "INVALID_OPERATION",
      0x0505: "OUT_OF_MEMORY",
      0x0506: "INVALID_FRAMEBUFFER_OPERATION",
      0x9242: "CONTEXT_LOST_WEBGL",
    };
    const key = `${label}:${err}`;
    if (this.reportedGlFaults.has(key)) return;
    this.reportedGlFaults.add(key);
    console.error(
      `[EffectChain] GL ${names[err] ?? err} (${err}) at ${label} — reported once per chain; ` +
        "later occurrences of this same label are suppressed."
    );
  }

  private blit(sourceTexture: WebGLTexture) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
    const program = this.ctx.getOrCreateProgram("__blit", vs, fs);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "tDiffuse"), 0);
    this.quad.draw();
  }

  resize(width: number, height: number) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    if (this.initialized) {
      // Delete old FBO textures and framebuffers before creating new ones
      const gl = this.gl;
      const oldTexA = this.ctx.getTexture("fbo_a");
      const oldTexB = this.ctx.getTexture("fbo_b");
      const oldTexC = this.ctx.getTexture("fbo_c");
      const oldFbA = this.ctx.getFramebuffer("fb_a");
      const oldFbB = this.ctx.getFramebuffer("fb_b");
      const oldFbC = this.ctx.getFramebuffer("fb_c");
      if (oldTexA) gl.deleteTexture(oldTexA);
      if (oldTexB) gl.deleteTexture(oldTexB);
      if (oldTexC) gl.deleteTexture(oldTexC);
      if (oldFbA) gl.deleteFramebuffer(oldFbA);
      if (oldFbB) gl.deleteFramebuffer(oldFbB);
      if (oldFbC) gl.deleteFramebuffer(oldFbC);
      // Recreate FBO textures at new size
      this.ctx.createTexture("fbo_a", width, height);
      this.ctx.createTexture("fbo_b", width, height);
      this.ctx.createTexture("fbo_c", width, height);
      this.ctx.createFramebuffer("fb_a", this.ctx.getTexture("fbo_a")!);
      this.ctx.createFramebuffer("fb_b", this.ctx.getTexture("fbo_b")!);
      this.ctx.createFramebuffer("fb_c", this.ctx.getTexture("fbo_c")!);
    }
  }

  destroy() {
    this.quad.destroy();
    for (const tex of this.maskTextureCache.values()) {
      this.gl.deleteTexture(tex);
    }
    this.maskTextureCache.clear();
    this.lutLoader.clearCache();
  }

  private savedPreviousTex: WebGLTexture | null = null;
}
