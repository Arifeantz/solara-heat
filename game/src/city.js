// city.js — Port Solana: the game's own sun-soaked coastal city.
//
// A seeded generator lays out a grid of avenues, pastel towers, shops, parks
// and parking lots, a beach promenade with palms and a lighthouse, and bakes
// almost everything into a handful of merged meshes (one per texture), so the
// whole city draws in a few calls. It also hands the other systems what they
// need: building colliders, the road graph traffic drives on, the sidewalk
// loops pedestrians walk, and the named landmarks the missions use.

import { GeoBuilder, Mesh, Obj, Mat4, hexColor } from './engine.js';
import { Rng } from './random.js';

export const GRID_LINES = [-180, -90, 0, 90, 180];
export const ROAD_WIDTH = 14;
export const BLOCK_SIZE = 76;
export const CITY_EDGE = 252;

const PASTELS = [0xf7d9c4, 0xf9e8d2, 0xfce8ec, 0xd8ecf3, 0xe6f2d8, 0xfff3b0, 0xf3d1bf, 0xdfe7f5, 0xfbe3d3, 0xe8dff0];
const ROOFS = [0xb08968, 0x9c6644, 0xa26769, 0x6d6875, 0x8d6e63];

// copy one builder's geometry into another under a matrix (palms, umbrellas)
function mergeInto(dst, src, matrix) {
  const base = dst.base;
  for (let i = 0; i < src.pos.length; i += 3) {
    const p = Mat4.transformPoint(matrix, src.pos[i], src.pos[i + 1], src.pos[i + 2]);
    dst.pos.push(p[0], p[1], p[2]);
    // normals: rotation part only (columns of the matrix, normalised)
    const nx = src.nor[i], ny = src.nor[i + 1], nz = src.nor[i + 2];
    let ox = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
    let oy = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
    let oz = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;
    const l = Math.hypot(ox, oy, oz) || 1;
    dst.nor.push(ox / l, oy / l, oz / l);
    dst.col.push(src.col[i], src.col[i + 1], src.col[i + 2]);
    dst.uv.push(src.uv[i / 3 * 2] || 0, src.uv[i / 3 * 2 + 1] || 0);
  }
  for (const ix of src.idx) dst.idx.push(ix + base);
  dst.base += src.pos.length / 3;
}

// one palm tree, baked at the origin, about 7 m tall, leaning a little
function palmGeometry(rng) {
  const b = new GeoBuilder();
  const trunkCol = hexColor(0x8a6b4f);
  const lean = rng.range(0.04, 0.14) * (rng.chance(0.5) ? 1 : -1);
  let x = 0, y = 0;
  for (let s = 0; s < 4; s++) {
    const seg = new GeoBuilder();
    seg.cylinder(0, 0.8, 0, 0.16 - s * 0.02, 0.19 - s * 0.02, 1.6, 6, trunkCol);
    mergeInto(b, seg, Mat4.compose(x, y, 0, 0, 0, lean * s * 0.4, 1, 1, 1));
    x += Math.sin(lean) * 1.5 * (s + 1) * 0.4;
    y += 1.55;
  }
  const topX = x, topY = y + 0.6;
  const frondCol = hexColor(0x3f9e4d);
  const frondCol2 = hexColor(0x57b25e);
  for (let i = 0; i < 7; i++) {
    const f = new GeoBuilder();
    f.cone(0, 1.7, 0, 0.42, 3.4, 4, i % 2 ? frondCol : frondCol2);
    const m = Mat4.compose(topX, topY, 0, 1.25, (i / 7) * Math.PI * 2, 0, 1, 1, 0.28);
    mergeInto(b, f, m);
  }
  const nut = new GeoBuilder();
  nut.cylinder(topX, topY - 0.1, 0, 0.22, 0.22, 0.3, 6, hexColor(0x6f5138));
  mergeInto(b, nut, Mat4.identity());
  return b;
}

function buildingSides(b, cx, cz, w, d, h, tint) {
  // four textured walls + a plain roof; uv scaled so windows stay one size
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const uw = Math.max(1, Math.round(w / 11));
  const ud = Math.max(1, Math.round(d / 11));
  const uh = Math.max(1, Math.round(h / 11));
  b.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], tint, [0, 0, uw, uh]);
  b.quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], tint, [0, 0, uw, uh]);
  b.quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], tint, [0, 0, ud, uh]);
  b.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], tint, [0, 0, ud, uh]);
  const roof = hexColor(0x000000);
  roof[0] = tint[0] * 0.55; roof[1] = tint[1] * 0.52; roof[2] = tint[2] * 0.5;
  b.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], roof, [0, 0, 1, 1]);
}

export function buildCity(gl, textures) {
  const rng = new Rng(20261121);
  const root = new Obj();
  const colliders = [];
  const sidewalkLoops = [];
  const parkedSpots = [];

  const asphalt = new GeoBuilder();
  const plain = new GeoBuilder();
  const facade = new GeoBuilder();
  const shop = new GeoBuilder();
  const sand = new GeoBuilder();

  const concrete = hexColor(0xcfc8bb);
  const concreteDark = hexColor(0xbdb5a4);
  const grass = hexColor(0x79b657);
  const plaza = hexColor(0xd9c9a3);

  // ---- ground: island base, sand ring, sea
  const base = new GeoBuilder();
  base.quad([-300, -0.06, 300], [300, -0.06, 300], [300, -0.06, -300], [-300, -0.06, -300], [0, 1, 0], hexColor(0x9aa08e), [0, 0, 1, 1]);
  const baseMesh = base.build(gl);
  root.add(new Obj(baseMesh));
  sand.quad([-320, -0.02, 320], [320, -0.02, 320], [320, -0.02, -320], [-320, -0.02, -320], [0, 1, 0], [1, 1, 1], [0, 0, 40, 40]);
  const sea = new GeoBuilder();
  sea.quad([-900, -0.55, 900], [900, -0.55, 900], [900, -0.55, -900], [-900, -0.55, -900], [0, 1, 0], hexColor(0x2e8fa8), [0, 0, 1, 1]);
  const seaObj = new Obj(sea.build(gl), { emissive: 0.12 });
  root.add(seaObj);

  // ---- roads (asphalt texture) with dashed centre lines (plain)
  const dashCol = hexColor(0xf7e08a);
  const edgeCol = hexColor(0xe8e4da);
  for (const gx of GRID_LINES) {
    asphalt.quad([gx - 7, 0, 252], [gx + 7, 0, 252], [gx + 7, 0, -252], [gx - 7, 0, -252], [0, 1, 0], [1, 1, 1], [0, 0, 1, 63]);
    for (let z = -246; z < 250; z += 12) {
      plain.quad([gx - 0.18, 0.03, z + 3.4], [gx + 0.18, 0.03, z + 3.4], [gx + 0.18, 0.03, z], [gx - 0.18, 0.03, z], [0, 1, 0], dashCol);
    }
    plain.quad([gx - 7, 0.025, 252], [gx - 6.6, 0.025, 252], [gx - 6.6, 0.025, -252], [gx - 7, 0.025, -252], [0, 1, 0], edgeCol);
    plain.quad([gx + 6.6, 0.025, 252], [gx + 7, 0.025, 252], [gx + 7, 0.025, -252], [gx + 6.6, 0.025, -252], [0, 1, 0], edgeCol);
  }
  for (const gz of GRID_LINES) {
    asphalt.quad([-252, 0.005, gz + 7], [252, 0.005, gz + 7], [252, 0.005, gz - 7], [-252, 0.005, gz - 7], [0, 1, 0], [1, 1, 1], [0, 0, 63, 1]);
    for (let x = -246; x < 250; x += 12) {
      plain.quad([x, 0.035, gz - 0.18], [x + 3.4, 0.035, gz - 0.18], [x + 3.4, 0.035, gz + 0.18], [x, 0.035, gz + 0.18], [0, 1, 0], dashCol);
    }
  }

  // ---- blocks: sidewalks, then a building layout per block
  const centers = [-135, -45, 45, 135];
  for (const cx of centers) {
    for (const cz of centers) {
      // sidewalk slab and inner plaza
      plain.quad([cx - 41, 0.04, cz + 41], [cx + 41, 0.04, cz + 41], [cx + 41, 0.04, cz - 41], [cx - 41, 0.04, cz - 41], [0, 1, 0], concrete);
      plain.quad([cx - 38, 0.06, cz + 38], [cx + 38, 0.06, cz + 38], [cx + 38, 0.06, cz - 38], [cx - 38, 0.06, cz - 38], [0, 1, 0], concreteDark);
      sidewalkLoops.push({ cx, cz, half: 39.5 });
      const centrality = 1 - Math.min(1, Math.hypot(cx, cz) / 260);
      const roll = rng.next();
      if (roll < 0.13) {
        // a small park: lawn, palms, benches
        plain.quad([cx - 36, 0.09, cz + 36], [cx + 36, 0.09, cz + 36], [cx + 36, 0.09, cz - 36], [cx - 36, 0.09, cz - 36], [0, 1, 0], grass);
        for (let i = 0; i < 7; i++) {
          const px = cx + rng.range(-30, 30), pz = cz + rng.range(-30, 30);
          mergeInto(plain, palmGeometry(rng), Mat4.compose(px, 0.05, pz, 0, rng.range(0, 6.28), 0, 1, 1, 1));
        }
        for (let i = 0; i < 4; i++) {
          plain.box(cx + rng.range(-28, 28), 0.45, cz + rng.range(-28, 28), 2.2, 0.5, 0.7, hexColor(0x7a5c3e));
        }
      } else if (roll < 0.23) {
        // a parking lot: slab, bay markings, room for parked cars
        plain.quad([cx - 36, 0.09, cz + 36], [cx + 36, 0.09, cz + 36], [cx + 36, 0.09, cz - 36], [cx - 36, 0.09, cz - 36], [0, 1, 0], hexColor(0x8f8c85));
        for (let i = 0; i < 6; i++) {
          const px = cx - 30 + i * 12;
          plain.quad([px, 0.11, cz + 30], [px + 0.3, 0.11, cz + 30], [px + 0.3, 0.11, cz + 12], [px, 0.11, cz + 12], [0, 1, 0], edgeCol);
          parkedSpots.push({ x: px + 5, z: cz + 21, heading: Math.PI });
          parkedSpots.push({ x: px + 5, z: cz - 21, heading: 0 });
        }
      } else if (roll < 0.55) {
        // one tower
        const w = rng.range(30, 44), d = rng.range(30, 44);
        const h = rng.range(20, 34) + centrality * rng.range(8, 26);
        const tint = hexColor(rng.pick(PASTELS));
        buildingSides(facade, cx, cz, w, d, h, tint);
        plain.box(cx, h + 1, cz, w * 0.4, 2, d * 0.4, hexColor(rng.pick(ROOFS)));
        plain.box(cx + w * 0.2, h + 0.7, cz - d * 0.2, 4, 1.4, 4, hexColor(0x9aa0a4));
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      } else if (roll < 0.8) {
        // two mid-rise buildings
        for (const off of [-19, 19]) {
          const w = rng.range(26, 34), d = rng.range(30, 40);
          const h = rng.range(11, 22) + centrality * 8;
          const tint = hexColor(rng.pick(PASTELS));
          buildingSides(facade, cx + off, cz, w, d, h, tint);
          plain.box(cx + off, h + 0.8, cz, w * 0.5, 1.6, d * 0.3, hexColor(rng.pick(ROOFS)));
          colliders.push({ minX: cx + off - w / 2, maxX: cx + off + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        }
      } else {
        // four low shops around a little plaza
        plain.quad([cx - 36, 0.09, cz + 36], [cx + 36, 0.09, cz + 36], [cx + 36, 0.09, cz - 36], [cx - 36, 0.09, cz - 36], [0, 1, 0], plaza);
        for (const ox of [-19, 19]) {
          for (const oz of [-19, 19]) {
            const w = rng.range(24, 30), d = rng.range(24, 30), h = rng.range(6, 9.5);
            const tint = hexColor(rng.pick(PASTELS));
            buildingSides(shop, cx + ox, cz + oz, w, d, h, tint);
            colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
          }
        }
      }
    }
  }

  // ---- promenade and beach dressing along the south shore
  plain.quad([-252, 0.05, 226], [252, 0.05, 226], [252, 0.05, 206], [-252, 0.05, 206], [0, 1, 0], hexColor(0xe6d3ac));
  for (let x = -240; x <= 240; x += 24) {
    mergeInto(plain, palmGeometry(rng), Mat4.compose(x + rng.range(-3, 3), 0.05, 216 + rng.range(-3, 3), 0, rng.range(0, 6.28), 0, 1.05, 1.05, 1.05));
    if (rng.chance(0.7)) {
      // a beach umbrella further down the sand
      const ux = x + rng.range(-6, 6), uz = rng.range(238, 262);
      const pole = new GeoBuilder();
      pole.cylinder(0, 1.1, 0, 0.05, 0.05, 2.2, 5, hexColor(0xe8e2d4));
      pole.cone(0, 2.6, 0, 2.3, 0.9, 8, hexColor(rng.pick([0xe4572e, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xe63946])));
      mergeInto(plain, pole, Mat4.compose(ux, 0, uz, 0, 0, 0, 1, 1, 1));
    }
  }
  // street lights along every avenue
  const poleCol = hexColor(0x3c4147);
  const lampCol = hexColor(0xffe9a8);
  for (const gx of GRID_LINES) {
    for (let z = -228; z <= 228; z += 38) {
      if (GRID_LINES.some((g) => Math.abs(g - z) < 12)) continue;
      const lamp = new GeoBuilder();
      lamp.cylinder(0, 3, 0, 0.09, 0.12, 6, 5, poleCol);
      lamp.box(0, 6.1, 0, 0.5, 0.3, 0.5, lampCol);
      mergeInto(plain, lamp, Mat4.compose(gx - 8.2, 0, z, 0, 0, 0, 1, 1, 1));
    }
  }

  // ---- landmarks -------------------------------------------------------
  const landmarks = {};
  const sign = (b, x, y, z, w, h, d, color) => b.box(x, y, z, w, h, d, hexColor(color));

  // Café Solmar — Marina's place, south-east of the centre, facing the shore avenue
  {
    const cx = 45, cz = 152;
    buildingSides(shop, cx, cz, 34, 22, 8, hexColor(0xffe9c9));
    sign(plain, cx, 9.2, cz + 11.4, 20, 2.2, 0.8, 0xe4572e);
    colliders.push({ minX: cx - 17, maxX: cx + 17, minZ: cz - 11, maxZ: cz + 11 });
    landmarks.cafe = { x: cx, z: cz + 20, name: 'Café Solmar' };
  }
  // Venn Auto garage — north-west of centre
  {
    const cx = -45, cz = -58;
    buildingSides(facade, cx, cz, 36, 24, 9, hexColor(0xd8dee2));
    sign(plain, cx, 10.2, cz - 12.4, 22, 2.2, 0.8, 0x2a9d8f);
    plain.box(cx, 2.2, cz - 12.2, 26, 4.4, 0.6, hexColor(0x22262b));
    colliders.push({ minX: cx - 18, maxX: cx + 18, minZ: cz - 12, maxZ: cz + 12 });
    landmarks.garage = { x: cx, z: cz - 20, name: 'Venn Auto Repairs' };
  }
  // Police headquarters — north-east corner block
  {
    const cx = 135, cz = -152;
    buildingSides(facade, cx, cz, 38, 26, 13, hexColor(0xdfe7f5));
    sign(plain, cx, 14.2, cz - 13.4, 24, 2.2, 0.8, 0x1d4ed8);
    colliders.push({ minX: cx - 19, maxX: cx + 19, minZ: cz - 13, maxZ: cz + 13 });
    landmarks.police = { x: cx - 10, z: cz - 22, name: 'Solana Police HQ' };
  }
  // St. Solana hospital — west side
  {
    const cx = -152, cz = 45;
    buildingSides(facade, cx, cz, 26, 38, 12, hexColor(0xf4f6f6));
    plain.box(cx - 13.4, 8, cz, 0.8, 5, 1.8, hexColor(0xd64545));
    plain.box(cx - 13.4, 8, cz, 0.8, 1.8, 5, hexColor(0xd64545));
    colliders.push({ minX: cx - 13, maxX: cx + 13, minZ: cz - 19, maxZ: cz + 19 });
    landmarks.hospital = { x: cx + 22, z: cz, name: 'St. Solana Hospital' };
  }
  // The docks — crates and a warehouse on the west shore
  {
    const cx = -232, cz = 45;
    buildingSides(facade, cx, cz, 30, 44, 10, hexColor(0xc9b18c));
    colliders.push({ minX: cx - 15, maxX: cx + 15, minZ: cz - 22, maxZ: cz + 22 });
    const crateCols = [0xb08968, 0x457b9d, 0xbc4749, 0x606c38];
    for (let i = 0; i < 10; i++) {
      const px = -206 + rng.range(-6, 10), pz = cz + rng.range(-26, 26);
      const s = rng.range(2.4, 3.6);
      plain.box(px, s / 2, pz, s, s, s, hexColor(rng.pick(crateCols)));
      if (rng.chance(0.4)) plain.box(px, s + s * 0.3, pz, s * 0.8, s * 0.6, s * 0.8, hexColor(rng.pick(crateCols)));
    }
    landmarks.docks = { x: -204, z: cz, name: 'Port Solana Docks' };
  }
  // The lighthouse on the south-east point
  {
    const cx = 232, cz = 288;
    const lh = new GeoBuilder();
    lh.cylinder(0, 5, 0, 2.6, 3.4, 10, 10, hexColor(0xf4f1ea));
    lh.cylinder(0, 8.2, 0, 2.85, 3.0, 1.6, 10, hexColor(0xd64545));
    lh.cylinder(0, 2.6, 0, 3.15, 3.3, 1.4, 10, hexColor(0xd64545));
    lh.cylinder(0, 10.8, 0, 1.5, 1.5, 1.6, 8, hexColor(0x333a40));
    lh.cone(0, 12.4, 0, 2.0, 1.8, 8, hexColor(0x27313a));
    mergeInto(plain, lh, Mat4.compose(cx, 0, cz, 0, 0, 0, 1, 1, 1));
    colliders.push({ minX: cx - 4, maxX: cx + 4, minZ: cz - 4, maxZ: cz + 4 });
    landmarks.lighthouse = { x: cx - 14, z: cz - 8, name: 'Solana Point Lighthouse' };
  }

  // ---- bus stops: a shelter, a bench and a sign on three corners.
  // The buses themselves are a rumour in Port Solana (ask any CabCo
  // passenger), but the stops are real, and people wait at them anyway.
  const shelterAt = (sx, sz, ry) => {
    const s = new GeoBuilder();
    const roofCol = hexColor(0x2a6f77);
    const postCol = hexColor(0x3c4147);
    for (const px of [-1.9, 1.9]) {
      for (const pz of [-0.8, 0.8]) {
        s.cylinder(px, 1.25, pz, 0.06, 0.07, 2.5, 5, postCol);
      }
    }
    s.box(0, 2.6, 0, 4.6, 0.14, 2.2, roofCol); // the shelter roof
    s.box(0, 1.35, -0.85, 4.4, 0.75, 0.08, hexColor(0x9fd8e8)); // glass back
    s.box(0, 0.55, 0, 3.6, 0.1, 0.5, hexColor(0x7a5c3e)); // the bench seat
    s.box(-1.6, 0.28, 0, 0.1, 0.55, 0.45, postCol);
    s.box(1.6, 0.28, 0, 0.1, 0.55, 0.45, postCol);
    s.cylinder(2.6, 1.5, 0, 0.05, 0.06, 3, 5, postCol); // the stop pole
    s.box(2.6, 2.9, 0, 0.7, 0.55, 0.08, hexColor(0xe9c46a)); // its yellow flag
    mergeInto(plain, s, Mat4.compose(sx, 0.02, sz, 0, ry, 0, 1, 1, 1));
  };
  shelterAt(8.6, -60, Math.PI / 2);
  shelterAt(-98.6, 30, -Math.PI / 2);
  shelterAt(98.6, 148, Math.PI / 2);

  // ---- bake the merged meshes
  const addBaked = (builder, texture, emissive) => {
    if (builder.idx.length === 0) return;
    const obj = new Obj(builder.build(gl), { texture: texture || null, emissive: emissive || 0 });
    root.add(obj);
  };
  addBaked(asphalt, textures.asphalt);
  addBaked(facade, textures.facade);
  addBaked(shop, textures.shop);
  addBaked(sand, textures.sand);
  addBaked(plain, null);

  return {
    group: root,
    sea: seaObj,
    colliders,
    sidewalkLoops,
    parkedSpots,
    landmarks,
    spawn: { x: 6, z: 200, heading: Math.PI },
  };
}

// circle-vs-buildings collision: push (x,z) out of every collider it enters
export function collideBuildings(colliders, x, z, radius) {
  for (const c of colliders) {
    if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) {
      const dxl = x - (c.minX - radius), dxr = (c.maxX + radius) - x;
      const dzl = z - (c.minZ - radius), dzr = (c.maxZ + radius) - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = c.minX - radius;
      else if (m === dxr) x = c.maxX + radius;
      else if (m === dzl) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  const edge = CITY_EDGE + 40;
  if (x < -edge) x = -edge;
  if (x > edge) x = edge;
  if (z < -edge) z = -edge;
  if (z > 292 + 60) z = 352;
  return [x, z];
}
