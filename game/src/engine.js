// engine.js — a compact original WebGL engine for Solara Heat.
//
// Written from scratch for this game: matrix maths, a geometry builder that
// bakes boxes/cylinders/cones into vertex buffers, one lit shader with fog
// and an optional texture, and a tiny scene graph (Obj) for things that move.
// No library code: every line here is the game's own.

// ---------------------------------------------------------------- matrices
export const Mat4 = {
  identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  multiply(a, b) {
    // returns a * b (column-major, WebGL style)
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  },
  perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const o = new Float32Array(16);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) / (near - far);
    o[11] = -1;
    o[14] = (2 * far * near) / (near - far);
    return o;
  },
  lookAt(eye, target, up) {
    const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    const z = [zx / len, zy / len, zz / len];
    const x = norm3(cross3(up, z));
    const y = cross3(z, x);
    const o = Mat4.identity();
    o[0] = x[0]; o[4] = x[1]; o[8] = x[2];
    o[1] = y[0]; o[5] = y[1]; o[9] = y[2];
    o[2] = z[0]; o[6] = z[1]; o[10] = z[2];
    o[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    o[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    o[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    return o;
  },
  compose(px, py, pz, rx, ry, rz, sx, sy, sz) {
    // T * Ry * Rx * Rz * S — yaw first, the order vehicles and people want
    let m = Mat4.identity();
    m[12] = px; m[13] = py; m[14] = pz;
    m = Mat4.multiply(m, rotY(ry));
    if (rx) m = Mat4.multiply(m, rotX(rx));
    if (rz) m = Mat4.multiply(m, rotZ(rz));
    if (sx !== 1 || sy !== 1 || sz !== 1) {
      const s = Mat4.identity();
      s[0] = sx; s[5] = sy; s[10] = sz;
      m = Mat4.multiply(m, s);
    }
    return m;
  },
  transformPoint(m, x, y, z) {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
  },
};

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm3(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a), m = Mat4.identity();
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}
function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a), m = Mat4.identity();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}
function rotZ(a) {
  const c = Math.cos(a), s = Math.sin(a), m = Mat4.identity();
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

// ---------------------------------------------------------------- geometry
// A builder collects coloured, lit triangles; build() uploads them once.
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
    this.base = 0;
  }
  pushVert(x, y, z, nx, ny, nz, color, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(color[0], color[1], color[2]);
    this.uv.push(u || 0, v || 0);
  }
  quad(a, b, c, d, n, color, uvRect) {
    // a-b-c-d counter-clockwise seen from the normal side
    const i = this.base;
    const [u0, v0, u1, v1] = uvRect || [0, 0, 1, 1];
    this.pushVert(...a, ...n, color, u0, v0);
    this.pushVert(...b, ...n, color, u1, v0);
    this.pushVert(...c, ...n, color, u1, v1);
    this.pushVert(...d, ...n, color, u0, v1);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.base += 4;
  }
  box(cx, cy, cz, sx, sy, sz, color, uvScale) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const us = uvScale || 1;
    const R = [0, 0, us, us];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, R); // south
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, R); // north
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, R); // east
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, R); // west
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color, R); // top
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color, R); // bottom
    return this;
  }
  prism(cx, cy, cz, sx, sy, sz, color) {
    // a box whose top face slopes down toward -z: car bonnets and wedges
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const yt = y1 - sy * 0.45; // front-top edge sits lower
    const nSlope = norm3([0, sz * 0.45, sy]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, yt, z0 + sz], [x0, yt, z0 + sz], [0, 0, 1], color);
    // (front face degenerates to the sloped top below; keep it simple)
    this.pos.length -= 0; // no-op, clarity
    return this;
  }
  cylinder(cx, cy, cz, rTop, rBottom, h, seg, color, capped = true) {
    const y0 = cy - h / 2, y1 = cy + h / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const s0 = Math.sin(a0), c0 = Math.cos(a0);
      const s1 = Math.sin(a1), c1 = Math.cos(a1);
      const n0 = [c0, 0, s0], n1 = [c1, 0, s1];
      const idx = this.base;
      this.pushVert(cx + c0 * rBottom, y0, cz + s0 * rBottom, ...n0, color);
      this.pushVert(cx + c1 * rBottom, y0, cz + s1 * rBottom, ...n1, color);
      this.pushVert(cx + c1 * rTop, y1, cz + s1 * rTop, ...n1, color);
      this.pushVert(cx + c0 * rTop, y1, cz + s0 * rTop, ...n0, color);
      this.idx.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
      this.base += 4;
      if (capped) {
        const t = this.base;
        this.pushVert(cx, y1, cz, 0, 1, 0, color);
        this.pushVert(cx + c0 * rTop, y1, cz + s0 * rTop, 0, 1, 0, color);
        this.pushVert(cx + c1 * rTop, y1, cz + s1 * rTop, 0, 1, 0, color);
        this.idx.push(t, t + 1, t + 2);
        this.base += 3;
      }
    }
    return this;
  }
  cone(cx, cy, cz, r, h, seg, color) {
    const y0 = cy - h / 2, y1 = cy + h / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const n = norm3([Math.cos((a0 + a1) / 2), r / h, Math.sin((a0 + a1) / 2)]);
      const idx = this.base;
      this.pushVert(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r, ...n, color);
      this.pushVert(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r, ...n, color);
      this.pushVert(cx, y1, cz, ...n, color);
      this.idx.push(idx, idx + 1, idx + 2);
      this.base += 3;
    }
    return this;
  }
  build(gl) {
    const mesh = new Mesh(gl);
    mesh.upload(this.pos, this.nor, this.col, this.uv, this.idx);
    return mesh;
  }
}

export class Mesh {
  constructor(gl) {
    this.gl = gl;
    this.count = 0;
    this.buffers = {};
  }
  upload(pos, nor, col, uv, idx) {
    const gl = this.gl;
    const mk = (data, type) => {
      const b = gl.createBuffer();
      gl.bindBuffer(type, b);
      gl.bufferData(type, data, gl.STATIC_DRAW);
      return b;
    };
    this.buffers.pos = mk(new Float32Array(pos), gl.ARRAY_BUFFER);
    this.buffers.nor = mk(new Float32Array(nor), gl.ARRAY_BUFFER);
    this.buffers.col = mk(new Float32Array(col), gl.ARRAY_BUFFER);
    this.buffers.uv = mk(new Float32Array(uv), gl.ARRAY_BUFFER);
    this.buffers.idx = mk(new Uint32Array(idx), gl.ELEMENT_ARRAY_BUFFER);
    this.count = idx.length;
  }
}

// ---------------------------------------------------------------- renderer
const VERT = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
attribute vec2 aUv;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vCol;
varying vec3 vNor;
varying vec2 vUv;
varying float vDist;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  vUv = aUv;
  gl_Position = uMVP * vec4(aPos, 1.0);
  vDist = -gl_Position.z;
  gl_Position = gl_Position;
  vDist = length(world.xyz - uCamPos);
}
`;
const VERT2 = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
attribute vec2 aUv;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform vec3 uCamPos;
varying vec3 vCol;
varying vec3 vNor;
varying vec2 vUv;
varying float vDist;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  vUv = aUv;
  vec4 clip = uMVP * vec4(aPos, 1.0);
  gl_Position = clip;
  vDist = length(world.xyz - uCamPos);
}
`;
const FRAG = `
precision mediump float;
varying vec3 vCol;
varying vec3 vNor;
varying vec2 vUv;
varying float vDist;
uniform sampler2D uTex;
uniform float uUseTex;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissive;
uniform float uAlpha;
void main() {
  vec3 n = normalize(vNor);
  vec3 base = vCol;
  if (uUseTex > 0.5) base *= texture2D(uTex, vUv).rgb;
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 lit = base * (uSkyCol + uSunCol * diff) + base * uEmissive;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  vec3 outCol = mix(lit, uFogCol, f);
  gl_FragColor = vec4(outCol, uAlpha);
}
`;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    gl.getExtension('OES_element_index_uint');
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT2));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);
    this.prog = prog;
    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNor: gl.getAttribLocation(prog, 'aNor'),
      aCol: gl.getAttribLocation(prog, 'aCol'),
      aUv: gl.getAttribLocation(prog, 'aUv'),
      uMVP: gl.getUniformLocation(prog, 'uMVP'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uUseTex: gl.getUniformLocation(prog, 'uUseTex'),
      uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
      uSunCol: gl.getUniformLocation(prog, 'uSunCol'),
      uSkyCol: gl.getUniformLocation(prog, 'uSkyCol'),
      uFogCol: gl.getUniformLocation(prog, 'uFogCol'),
      uFogNear: gl.getUniformLocation(prog, 'uFogNear'),
      uFogFar: gl.getUniformLocation(prog, 'uFogFar'),
      uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
      uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
    };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.view = Mat4.identity();
    this.proj = Mat4.identity();
    this.sunDir = [0.45, 0.8, 0.35];
    this.sunCol = [1.05, 0.95, 0.8];
    this.skyCol = [0.42, 0.48, 0.55];
    this.fogCol = [0.98, 0.8, 0.62];
    this.fogNear = 120;
    this.fogFar = 420;
    this.camPos = [0, 0, 0];
  }
  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.proj = Mat4.perspective((62 * Math.PI) / 180, w / h, 0.1, 900);
  }
  makeTexture(canvas) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }
  begin() {
    const gl = this.gl;
    gl.clearColor(this.fogCol[0], this.fogCol[1], this.fogCol[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3fv(this.loc.uSunDir, norm3(this.sunDir));
    gl.uniform3fv(this.loc.uSunCol, this.sunCol);
    gl.uniform3fv(this.loc.uSkyCol, this.skyCol);
    gl.uniform3fv(this.loc.uFogCol, this.fogCol);
    gl.uniform1f(this.loc.uFogNear, this.fogNear);
    gl.uniform1f(this.loc.uFogFar, this.fogFar);
    gl.uniform3fv(this.loc.uCamPos, this.camPos);
  }
  draw(mesh, model, opts = {}) {
    const gl = this.gl;
    const vp = Mat4.multiply(this.proj, this.view);
    const mvp = Mat4.multiply(vp, model);
    gl.uniformMatrix4fv(this.loc.uMVP, false, mvp);
    gl.uniformMatrix4fv(this.loc.uModel, false, model);
    gl.uniform1f(this.loc.uEmissive, opts.emissive || 0);
    gl.uniform1f(this.loc.uAlpha, opts.alpha === undefined ? 1 : opts.alpha);
    if (opts.texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, opts.texture);
      gl.uniform1i(this.loc.uTex, 0);
      gl.uniform1f(this.loc.uUseTex, 1);
    } else {
      gl.uniform1f(this.loc.uUseTex, 0);
    }
    if (opts.alpha !== undefined && opts.alpha < 1) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const bind = (loc, buf, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bind(this.loc.aPos, mesh.buffers.pos, 3);
    bind(this.loc.aNor, mesh.buffers.nor, 3);
    bind(this.loc.aCol, mesh.buffers.col, 3);
    bind(this.loc.aUv, mesh.buffers.uv, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.buffers.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }
}

// ---------------------------------------------------------------- scene graph
// A movable node: position, euler rotation, scale, an optional mesh, children.
export class Obj {
  constructor(mesh = null, opts = {}) {
    this.mesh = mesh;
    this.texture = opts.texture || null;
    this.emissive = opts.emissive || 0;
    this.alpha = opts.alpha;
    this.pos = [0, 0, 0];
    this.rot = [0, 0, 0];
    this.scale = [1, 1, 1];
    this.children = [];
    this.visible = true;
  }
  add(child) {
    this.children.push(child);
    return child;
  }
  localMatrix() {
    return Mat4.compose(
      this.pos[0], this.pos[1], this.pos[2],
      this.rot[0], this.rot[1], this.rot[2],
      this.scale[0], this.scale[1], this.scale[2],
    );
  }
  render(renderer, parent) {
    if (!this.visible) return;
    const world = Mat4.multiply(parent, this.localMatrix());
    if (this.mesh) {
      renderer.draw(this.mesh, world, {
        texture: this.texture,
        emissive: this.emissive,
        alpha: this.alpha,
      });
    }
    for (const c of this.children) c.render(renderer, world);
  }
}

export function hexColor(hex) {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}
