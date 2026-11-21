// engine.js — the whole renderer, in one file, by hand.
//
// Solara Heat runs on a small WebGL engine written for this game:
// column-major 4×4 matrices, a geometry builder that bakes coloured
// (and optionally textured) triangles into merged meshes, a scene
// graph of Objs with position/rotation/scale, and a Renderer that
// draws the graph with one shader — a warm directional sun, a soft
// sky bounce, per-object emissive, distance fog, and alpha where an
// object asks for it. No libraries, no assets: every vertex in Port
// Solana is placed by code in this project.
//
// Conventions the rest of the game relies on:
//   · ground-plane positions are (x, z), heights are y, and a heading
//     θ faces (sin θ, cos θ) on the ground;
//   · matrices are column-major, stored in Float32Array(16), and a
//     point transforms as M · [x, y, z, 1];
//   · geometry is built around its own origin and centred where the
//     builder's arguments say it is — a box at (cx, cy, cz) spans
//     cy ± h/2, a cylinder stands cy ± h/2, and so on;
//   · colours travel as [r, g, b] triples in 0..1 (see hexColor).

// ------------------------------------------------------------ matrices

export const Mat4 = {
  identity() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  },

  // a · b: the transform that applies b first, then a
  multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },

  // a model matrix from a position, an Euler rotation (applied as
  // yaw about Y, then pitch about X, then roll about Z) and a scale —
  // the one constructor every placed object in the game goes through
  compose(x, y, z, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), sxn = Math.sin(rx);
    const cy = Math.cos(ry), syn = Math.sin(ry);
    const cz = Math.cos(rz), szn = Math.sin(rz);
    // R = Ry · Rx · Rz, written out entry by entry
    const r00 = cy * cz + syn * sxn * szn;
    const r01 = -cy * szn + syn * sxn * cz;
    const r02 = syn * cx;
    const r10 = cx * szn;
    const r11 = cx * cz;
    const r12 = -sxn;
    const r20 = -syn * cz + cy * sxn * szn;
    const r21 = syn * szn + cy * sxn * cz;
    const r22 = cy * cx;
    return new Float32Array([
      r00 * sx, r10 * sx, r20 * sx, 0,
      r01 * sy, r11 * sy, r21 * sy, 0,
      r02 * sz, r12 * sz, r22 * sz, 0,
      x, y, z, 1,
    ]);
  },

  // the view matrix that puts the camera at eye, looking at target
  lookAt(eye, target, up) {
    let zx = eye[0] - target[0];
    let zy = eye[1] - target[1];
    let zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;
    // x axis: up × z, normalised
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;
    // y axis: z × x
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1,
    ]);
  },

  // a perspective projection: vertical field of view in radians
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

  // apply a matrix to one point, with the perspective divide the
  // affine matrices in this game never actually need but get anyway
  transformPoint(m, x, y, z) {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const inv = w !== 0 ? 1 / w : 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) * inv,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) * inv,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) * inv,
    ];
  },
};

// a 0xRRGGBB colour as the [r, g, b] triple the builders take
export function hexColor(hex) {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

// ------------------------------------------------------------ geometry
//
// A GeoBuilder accumulates vertices (position, normal, colour, uv)
// and indices into plain arrays. The district modules merge smaller
// builders into bigger ones under matrices (see mergeGeo in
// airport.js), which reads these arrays directly — and reads `base`,
// the running vertex count, to offset the merged indices. Every
// primitive below therefore keeps `base` exactly equal to the number
// of vertices pushed so far.

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
    this.base = 0;
  }

  _syncBase() {
    this.base = this.pos.length / 3;
  }

  _vertex(x, y, z, nx, ny, nz, color, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(color[0], color[1], color[2]);
    this.uv.push(u, v);
  }

  // one quad: corners a, b, c, d in order, one shared normal, and a
  // uv rectangle [u0, v0, u1, v1] laid over them in the same order
  quad(a, b, c, d, normal, color, uv) {
    const s = this.base;
    const [u0, v0, u1, v1] = uv;
    this._vertex(a[0], a[1], a[2], normal[0], normal[1], normal[2], color, u0, v0);
    this._vertex(b[0], b[1], b[2], normal[0], normal[1], normal[2], color, u1, v0);
    this._vertex(c[0], c[1], c[2], normal[0], normal[1], normal[2], color, u1, v1);
    this._vertex(d[0], d[1], d[2], normal[0], normal[1], normal[2], color, u0, v1);
    this.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    this._syncBase();
    return this;
  }

  // one triangle, for the ends of prisms and other small caps
  tri(a, b, c, normal, color) {
    const s = this.base;
    this._vertex(a[0], a[1], a[2], normal[0], normal[1], normal[2], color, 0, 0);
    this._vertex(b[0], b[1], b[2], normal[0], normal[1], normal[2], color, 1, 0);
    this._vertex(c[0], c[1], c[2], normal[0], normal[1], normal[2], color, 0.5, 1);
    this.idx.push(s, s + 1, s + 2);
    this._syncBase();
    return this;
  }

  // a box centred at (cx, cy, cz) with size (w, h, d); every face
  // carries the full 0..1 uv so a texture reads once per face
  box(cx, cy, cz, w, h, d, color) {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const y0 = cy - h / 2, y1 = cy + h / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const uv = [0, 0, 1, 1];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, uv);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, uv);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, uv);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, uv);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color, uv);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color, uv);
    return this;
  }

  // a cylinder centred at (cx, cy, cz): radius rBottom at the foot,
  // rTop at the head, `height` tall, `seg` sides, capped both ends
  cylinder(cx, cy, cz, rTop, rBottom, height, seg, color) {
    const y0 = cy - height / 2;
    const y1 = cy + height / 2;
    // the side wall, one quad per segment, normals pointing outward
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const s = this.base;
      this._vertex(cx + c0 * rBottom, y0, cz + s0 * rBottom, c0, 0, s0, color, i / seg, 0);
      this._vertex(cx + c1 * rBottom, y0, cz + s1 * rBottom, c1, 0, s1, color, (i + 1) / seg, 0);
      this._vertex(cx + c1 * rTop, y1, cz + s1 * rTop, c1, 0, s1, color, (i + 1) / seg, 1);
      this._vertex(cx + c0 * rTop, y1, cz + s0 * rTop, c0, 0, s0, color, i / seg, 1);
      this.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
      this._syncBase();
    }
    // the caps: fans around a centre vertex
    for (const [ry, r, ny] of [[y1, rTop, 1], [y0, rBottom, -1]]) {
      const centre = this.base;
      this._vertex(cx, ry, cz, 0, ny, 0, color, 0.5, 0.5);
      this._syncBase();
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const s = this.base;
        this._vertex(cx + Math.cos(a0) * r, ry, cz + Math.sin(a0) * r, 0, ny, 0, color,
          0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5);
        this._vertex(cx + Math.cos(a1) * r, ry, cz + Math.sin(a1) * r, 0, ny, 0, color,
          0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5);
        this._syncBase();
        if (ny > 0) this.idx.push(centre, s, s + 1);
        else this.idx.push(centre, s + 1, s);
      }
    }
    return this;
  }

  // a cone centred at (cx, cy, cz): a base disc of radius r at the
  // foot and the apex a full `height` above it, `seg` sides, capped
  cone(cx, cy, cz, r, height, seg, color) {
    const y0 = cy - height / 2;
    const y1 = cy + height / 2;
    // the slope normal leans outward and up in proportion to the
    // cone's own slope, so the light falls on it honestly
    const lean = r / Math.hypot(r, height);
    const rise = height / Math.hypot(r, height);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const n = [Math.cos(am) * rise, lean, Math.sin(am) * rise];
      const s = this.base;
      this._vertex(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r, n[0], n[1], n[2], color, i / seg, 0);
      this._vertex(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r, n[0], n[1], n[2], color, (i + 1) / seg, 0);
      this._vertex(cx, y1, cz, n[0], n[1], n[2], color, (i + 0.5) / seg, 1);
      this.idx.push(s, s + 1, s + 2);
      this._syncBase();
    }
    // the base cap
    const centre = this.base;
    this._vertex(cx, y0, cz, 0, -1, 0, color, 0.5, 0.5);
    this._syncBase();
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const s = this.base;
      this._vertex(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r, 0, -1, 0, color,
        0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5);
      this._vertex(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r, 0, -1, 0, color,
        0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5);
      this._syncBase();
      this.idx.push(centre, s + 1, s);
    }
    return this;
  }

  // a prism centred at (cx, cy, cz): a triangular cross-section in
  // the YZ plane — a base `d` wide at the foot, an apex ridge `h`
  // tall running along X — extruded `w` along X. Roof pieces and
  // pediments are what it is for.
  prism(cx, cy, cz, w, h, d, color) {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const yb = cy - h / 2, yt = cy + h / 2;
    const za = cz - d / 2, zb = cz + d / 2;
    const uv = [0, 0, 1, 1];
    // the two slopes: their normals lean out and up together
    const nl = Math.hypot(h, d / 2);
    const nA = [0, (d / 2) / nl, -h / nl];
    const nB = [0, (d / 2) / nl, h / nl];
    this.quad([x0, yb, za], [x1, yb, za], [x1, yt, cz], [x0, yt, cz], nA, color, uv);
    this.quad([x1, yb, zb], [x0, yb, zb], [x0, yt, cz], [x1, yt, cz], nB, color, uv);
    // the floor (rarely seen, always honest)
    this.quad([x0, yb, zb], [x1, yb, zb], [x1, yb, za], [x0, yb, za], [0, -1, 0], color, uv);
    // the triangular ends
    this.tri([x0, yb, zb], [x0, yb, za], [x0, yt, cz], [-1, 0, 0], color);
    this.tri([x1, yb, za], [x1, yb, zb], [x1, yt, cz], [1, 0, 0], color);
    return this;
  }

  // freeze the accumulated arrays into a GPU mesh
  build(gl) {
    return new Mesh(gl, this);
  }
}

// ------------------------------------------------------------ mesh
//
// A Mesh is one builder's worth of geometry on the GPU: four vertex
// buffers and an index buffer, drawn in a single call.

export class Mesh {
  constructor(gl, source) {
    this.count = source.idx.length;
    const upload = (data, itemSize, isIndex) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(isIndex ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER, buf);
      gl.bufferData(isIndex ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return buf;
    };
    this.posBuf = upload(new Float32Array(source.pos), 3, false);
    this.norBuf = upload(new Float32Array(source.nor), 3, false);
    this.colBuf = upload(new Float32Array(source.col), 3, false);
    this.uvBuf = upload(new Float32Array(source.uv), 2, false);
    this.idxBuf = upload(new Uint32Array(source.idx), 1, true);
  }

  draw(gl, loc) {
    const bind = (buf, location, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(location);
    };
    bind(this.posBuf, loc.aPos, 3);
    bind(this.norBuf, loc.aNor, 3);
    bind(this.colBuf, loc.aCol, 3);
    bind(this.uvBuf, loc.aUv, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
  }
}

// ------------------------------------------------------------ renderer

const VERT_SRC = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
attribute vec2 aUv;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
varying vec3 vCol;
varying vec3 vNor;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  vUv = aUv;
  gl_Position = uProj * uView * world;
}
`;

const FRAG_SRC = `
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uEmissive;
uniform float uAlpha;
uniform vec3 uCamPos;
varying vec3 vCol;
varying vec3 vNor;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec3 base = vCol;
  if (uUseTex > 0.5) base = base * texture2D(uTex, vUv).rgb;
  vec3 n = normalize(vNor);
  vec3 sunDir = normalize(vec3(0.45, 0.8, 0.3));
  float diff = max(dot(n, sunDir), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 light = vec3(0.46, 0.47, 0.5)
    + vec3(0.66, 0.6, 0.52) * diff
    + vec3(0.08, 0.1, 0.14) * sky;
  vec3 col = base * light + base * uEmissive;
  float dist = length(vWorld - uCamPos);
  float fog = smoothstep(260.0, 820.0, dist);
  col = mix(col, vec3(0.6, 0.7, 0.83), fog * 0.5);
  gl_FragColor = vec4(col, uAlpha);
}
`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { antialias: true, alpha: false };
    let gl = canvas.getContext('webgl2', opts);
    this.isGL2 = !!gl;
    if (!gl) {
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      gl.getExtension('OES_element_index_uint');
    }
    this.gl = gl;
    this.quality = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.view = Mat4.identity();
    this.camPos = [0, 30, 0];
    this.proj = Mat4.perspective(1.05, 1, 0.1, 1400);

    // one program for the whole game: compile, link, locate
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    let vertSrc = VERT_SRC;
    let fragSrc = FRAG_SRC;
    if (this.isGL2) {
      vertSrc = '#version 300 es\n#define attribute in\n#define varying out\n' + vertSrc;
      fragSrc = '#version 300 es\nprecision mediump float;\n#define varying in\n' +
        '#define texture2D texture\nout vec4 fragColor;\n#define gl_FragColor fragColor\n' + fragSrc;
    } else {
      fragSrc = 'precision mediump float;\n' + fragSrc;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNor: gl.getAttribLocation(prog, 'aNor'),
      aCol: gl.getAttribLocation(prog, 'aCol'),
      aUv: gl.getAttribLocation(prog, 'aUv'),
      uProj: gl.getUniformLocation(prog, 'uProj'),
      uView: gl.getUniformLocation(prog, 'uView'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uUseTex: gl.getUniformLocation(prog, 'uUseTex'),
      uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
      uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
      uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
    };
  }

  // size the drawing buffer for a CSS size, honouring the quality
  // scale (the C key in game) and the display's pixel ratio
  resize(w, h) {
    this.cssW = Math.max(1, w);
    this.cssH = Math.max(1, h);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = this.quality * dpr;
    this.canvas.width = Math.round(this.cssW * scale);
    this.canvas.height = Math.round(this.cssH * scale);
    this.proj = Mat4.perspective(1.05, this.cssW / this.cssH, 0.1, 1400);
  }

  setQuality(q) {
    this.quality = q;
    this.resize(this.cssW, this.cssH);
  }

  // upload one of textures.js's {width, height, data} images
  makeTexture(image) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, image.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  // clear the frame and set the per-frame uniforms
  begin() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.55, 0.7, 0.86, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE); // flat-shaded world: both faces honest
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uProj, false, this.proj);
    gl.uniformMatrix4fv(this.loc.uView, false, this.view);
    gl.uniform3fv(this.loc.uCamPos, this.camPos);
    gl.uniform1i(this.loc.uTex, 0);
  }

  // draw one mesh under one model matrix, with the material the
  // owning Obj carries (texture handle or null, emissive, alpha)
  draw(mesh, model, material) {
    const gl = this.gl;
    const alpha = material && material.alpha !== undefined ? material.alpha : 1;
    if (alpha < 1) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    gl.uniformMatrix4fv(this.loc.uModel, false, model);
    gl.uniform1f(this.loc.uEmissive, material && material.emissive ? material.emissive : 0);
    gl.uniform1f(this.loc.uAlpha, alpha);
    const tex = material ? material.texture : null;
    gl.uniform1f(this.loc.uUseTex, tex ? 1 : 0);
    if (tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }
    mesh.draw(gl, this.loc);
    if (alpha < 1) gl.depthMask(true);
  }
}

// ------------------------------------------------------------ scene graph
//
// An Obj is a node: an optional mesh, a material (texture, emissive,
// alpha), a local transform, and children. The whole world is one
// tree of these, rendered from the root each frame.

export class Obj {
  constructor(mesh = null, opts = {}) {
    this.mesh = mesh;
    this.texture = opts.texture || null;
    this.emissive = opts.emissive || 0;
    this.alpha = opts.alpha !== undefined ? opts.alpha : 1;
    this.pos = [0, 0, 0];
    this.rot = [0, 0, 0];
    this.scale = [1, 1, 1];
    this.visible = true;
    this.children = [];
  }

  add(child) {
    this.children.push(child);
    return this;
  }

  render(renderer, parent) {
    if (!this.visible) return;
    const local = Mat4.compose(
      this.pos[0], this.pos[1], this.pos[2],
      this.rot[0], this.rot[1], this.rot[2],
      this.scale[0], this.scale[1], this.scale[2],
    );
    const model = parent ? Mat4.multiply(parent, local) : local;
    if (this.mesh) renderer.draw(this.mesh, model, this);
    for (const child of this.children) child.render(renderer, model);
  }
}
