import { WebGLContext } from './WebGLContext';

export class FullscreenQuad {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private positionBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;

  constructor(ctx: WebGLContext) {
    const gl = ctx.getGL();
    this.gl = gl;

    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const texCoords = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.positionBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.texCoordBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  draw() {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.bindVertexArray(null);
  }

  destroy() {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.texCoordBuffer);
  }
}
