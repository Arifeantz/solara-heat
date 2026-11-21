// city.js — Port Solana itself: the avenue grid and everything on it.
//
// The city is a square island town. Five avenues run each way on the
// GRID_LINES below, fourteen metres wide, leaving seventy-six-metre
// blocks between them and a waterfront strip inside the CITY_EDGE.
// Every block is built by code at boot: towers in pastel tints, a
// hotel, a park, a working dockyard on the west shore, and the four
// named buildings the story leans on — Café Solmar on the south
// promenade, the Police HQ and St. Solana Hospital on the north, and
// Venn Auto Repairs tucked into a mid-town block. South of the edge a
// sand spit runs out to the Solana Point lighthouse.
//
// Almost everything is baked into a handful of merged meshes (one per
// texture, plus a plain one) so the whole town draws in a few calls.
// What the other systems need comes back in the return value: the
// scene group, an AABB collider per building, the landmark table
// (every entry {x, z, name}), parked-car spots, pedestrian loops,
// the player spawn, and the sea object, whose emissive main.js
// breathes with the hour.

import { GeoBuilder, Obj, Mat4, hexColor } from './engine.js';
import { Rng } from './random.js';

export const GRID_LINES = [-180, -90, 0, 90, 180];
export const ROAD_WIDTH = 14;
export const BLOCK_SIZE = 76;
export const CITY_EDGE = 252;

const HALF_ROAD = ROAD_WIDTH / 2;

// ------------------------------------------------------------ collision
//
// Buildings are axis-aligned boxes on the ground. collideBuildings
// takes a wanted position and a radius, and returns the position
// pushed out of every box it overlaps — the smallest exit each time,
// twice around so corners resolve instead of sticking.
export function collideBuildings(colliders, x, z, radius) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const minX = c.minX - radius, maxX = c.maxX + radius;
      const minZ = c.minZ - radius, maxZ = c.maxZ + radius;
      if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
      // inside: leave by whichever wall is closest
      const exits = [
        { d: x - minX, x: minX, z },
        { d: maxX - x, x: maxX, z },
        { d: z - minZ, x, z: minZ },
        { d: maxZ - z, x, z: maxZ },
      ];
      exits.sort((a, b) => a.d - b.d);
      x = exits[0].x;
      z = exits[0].z;
    }
  }
  return { x, z };
}

// ------------------------------------------------------------ helpers

// a flat ground quad in one builder, corners (x0, z0)-(x1, z1) at y
function groundQuad(b, x0, z0, x1, z1, y, color, uv) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color, uv || [0, 0, 1, 1]);
}

// four textured walls and a flat roof for a building centred at
// (cx, cz); the uv scales with the walls so windows stay one size
function walls(b, cx, cz, w, d, h, tint) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const uw = Math.max(1, Math.round(w / 11));
  const ud = Math.max(1, Math.round(d / 11));
  const uh = Math.max(1, Math.round(h / 11));
  b.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], tint, [0, 0, uw, uh]);
  b.quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], tint, [0, 0, uw, uh]);
  b.quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], tint, [0, 0, ud, uh]);
  b.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], tint, [0, 0, ud, uh]);
  const roof = [tint[0] * 0.52, tint[1] * 0.5, tint[2] * 0.48];
  b.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], roof, [0, 0, 1, 1]);
}

// a palm, built at the origin and merged where it is planted: a
// leaning stack of trunk rings and a crown of drooping fronds
function palmInto(b, x, z, rng, scale) {
  const palm = new GeoBuilder();
  const bark = hexColor(0x8a6b45);
  let px = 0, py = 0;
  for (let s = 0; s < 5; s++) {
    const ring = new GeoBuilder();
    ring.cylinder(0, 0.7, 0, 0.14 - s * 0.01, 0.17 - s * 0.01, 1.4, 6, bark);
    mergeLocal(palm, ring, Mat4.compose(px, py, 0, 0, 0, 0.06 * s, 1, 1, 1));
    px += 0.08 * s;
    py += 1.32;
  }
  const greens = [hexColor(0x3e9e52), hexColor(0x55b567), hexColor(0x2f7d40)];
  for (let i = 0; i < 8; i++) {
    const frond = new GeoBuilder();
    frond.cone(0, 1.4, 0, 0.34, 3.0, 4, greens[i % 3]);
    mergeLocal(palm, frond, Mat4.compose(px, py + 0.4, 0, 1.25, (i / 8) * Math.PI * 2 + rng.range(-0.15, 0.15), 0, 1, 1, 0.28));
  }
  mergeLocal(b, palm, Mat4.compose(x, 0, z, 0, rng.range(0, Math.PI * 2), 0, scale, scale, scale));
}

// copy one builder's geometry into another under a matrix — the
// same small vertex-copy the districts perform with mergeGeo from
// airport.js, kept local here so the city imports no district
function mergeLocal(dst, src, matrix) {
  const base = dst.base;
  for (let i = 0; i < src.pos.length; i += 3) {
    const p = Mat4.transformPoint(matrix, src.pos[i], src.pos[i + 1], src.pos[i + 2]);
    dst.pos.push(p[0], p[1], p[2]);
    const nx = src.nor[i], ny = src.nor[i + 1], nz = src.nor[i + 2];
    let ox = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
    let oy = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
    let oz = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;
    const l = Math.hypot(ox, oy, oz) || 1;
    dst.nor.push(ox / l, oy / l, oz / l);
    dst.col.push(src.col[i], src.col[i + 1], src.col[i + 2]);
    dst.uv.push(src.uv[(i / 3) * 2] || 0, src.uv[(i / 3) * 2 + 1] || 0);
  }
  for (const ix of src.idx) dst.idx.push(ix + base);
  dst.base += src.pos.length / 3;
}

// ------------------------------------------------------------ the city

export function buildCity(gl, textures) {
  const rng = new Rng(20261);
  const group = new Obj();
  const colliders = [];
  const parkedSpots = [];
  const landmarks = {};
  const sidewalkLoops = [];

  const asphalt = new GeoBuilder();
  const facade = new GeoBuilder();
  const shop = new GeoBuilder();
  const brick = new GeoBuilder();
  const plain = new GeoBuilder();

  const concrete = hexColor(0xb9b2a2);
  const pavement = hexColor(0xcfc8b8);
  const grassCol = hexColor(0x74ad58);
  const white = hexColor(0xf2f0eb);
  const darkMetal = hexColor(0x3c4147);

  // ---- the sea and the island: water to the horizon, sand under all
  const seaBuilder = new GeoBuilder();
  groundQuad(seaBuilder, -900, -900, 900, 900, -0.35, hexColor(0x2a6f8f), [0, 0, 60, 60]);
  const sea = new Obj(seaBuilder.build(gl), { emissive: 0.1 });
  sea.pos = [0, 0, 0];
  group.add(sea);
  groundQuad(plain, -345, -345, 345, 345, -0.06, hexColor(0xe2cca4), [0, 0, 26, 26]);
  // the city's slab: pale ground under roads, blocks and promenades
  groundQuad(plain, -CITY_EDGE, -CITY_EDGE, CITY_EDGE, CITY_EDGE, 0, concrete, [0, 0, 40, 40]);

  // ---- the avenues: asphalt strips on every grid line, both ways,
  // with a dashed centreline that pauses at the intersections
  for (const g of GRID_LINES) {
    groundQuad(asphalt, g - HALF_ROAD, -CITY_EDGE, g + HALF_ROAD, CITY_EDGE, 0.02, [1, 1, 1], [0, 0, 1, 36]);
    groundQuad(asphalt, -CITY_EDGE, g - HALF_ROAD, CITY_EDGE, g + HALF_ROAD, 0.021, [1, 1, 1], [0, 0, 36, 1]);
  }
  const dashCol = hexColor(0xf7e08a);
  for (const g of GRID_LINES) {
    for (let t = -CITY_EDGE + 6; t < CITY_EDGE - 6; t += 12) {
      if (GRID_LINES.some((o) => Math.abs(t - o) < 11)) continue;
      groundQuad(plain, g - 0.18, t, g + 0.18, t + 3.2, 0.032, dashCol);
      groundQuad(plain, t, g - 0.18, t + 3.2, g + 0.18, 0.033, dashCol);
    }
  }
  // pavements: a pale rim around every interior block
  const blockCentres = [-135, -45, 45, 135];
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const e = BLOCK_SIZE / 2 + 1.6;
      groundQuad(plain, bx - e, bz - e, bx + e, bz - e + 3.2, 0.012, pavement);
      groundQuad(plain, bx - e, bz + e - 3.2, bx + e, bz + e, 0.012, pavement);
      groundQuad(plain, bx - e, bz - e, bx - e + 3.2, bz + e, 0.012, pavement);
      groundQuad(plain, bx + e - 3.2, bz - e, bx + e, bz + e, 0.012, pavement);
    }
  }

  // ---- street lamps down both sides of every avenue
  for (const g of GRID_LINES) {
    for (let t = -CITY_EDGE + 22; t < CITY_EDGE; t += 45) {
      for (const sideSign of [-1, 1]) {
        if ((t / 45 + g) % 2 === 0 && sideSign < 0) continue; // stagger
        const lx = g + sideSign * (HALF_ROAD + 1.1);
        plain.cylinder(lx, 2.75, t, 0.07, 0.1, 5.5, 5, darkMetal);
        plain.box(lx, 5.6, t, 0.5, 0.28, 0.5, hexColor(0xfff3b0));
        const lz = t + sideSign * (HALF_ROAD + 1.1);
        plain.cylinder(t, 2.75, lz, 0.07, 0.1, 5.5, 5, darkMetal);
        plain.box(t, 5.6, lz, 0.5, 0.28, 0.5, hexColor(0xfff3b0));
      }
    }
  }

  // ------------------------------------------------------------ buildings
  const tints = [0xf7e3c2, 0xdfe7f5, 0xfce8ec, 0xd8ecf3, 0xf2e6c9, 0xe4f0dc, 0xfdf3d8, 0xe8e2d4];

  // one tower on a block: textured walls, a parapet, roof clutter,
  // and a collider that matches its footprint
  const tower = (cx, cz, w, d, h, tintHex, builder) => {
    walls(builder || facade, cx, cz, w, d, h, hexColor(tintHex));
    const cap = hexColor(0x8f8574);
    plain.box(cx, h + 0.25, cz - d / 2 + 0.3, w, 0.5, 0.6, cap);
    plain.box(cx, h + 0.25, cz + d / 2 - 0.3, w, 0.5, 0.6, cap);
    plain.box(cx - w / 2 + 0.3, h + 0.25, cz, 0.6, 0.5, d, cap);
    plain.box(cx + w / 2 - 0.3, h + 0.25, cz, 0.6, 0.5, d, cap);
    if (rng.chance(0.6)) {
      plain.box(cx + rng.range(-w / 4, w / 4), h + 0.8, cz + rng.range(-d / 4, d / 4),
        rng.range(2, 4), 1.6, rng.range(2, 4), hexColor(0xa39a89));
    }
    if (rng.chance(0.3)) {
      // a little water tower, the old town's signature
      const wx = cx - w / 4, wz = cz + d / 4;
      plain.cylinder(wx, h + 1.6, wz, 1.1, 1.3, 2.2, 8, hexColor(0x8a6b45));
      plain.cone(wx, h + 3.1, wz, 1.5, 1.2, 8, hexColor(0x6d5136));
    }
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  };

  // the generic blocks: a tower, twins, four corners, or a car park
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      if (bx === -45 && bz === 135) continue; // Palmera Park, below
      if (bx === -135 && bz === 45) continue; // Venn Auto, below
      if (bx === 45 && bz === -45) continue; // the hotel, below
      const style = rng.int(0, 3);
      if (style === 0) {
        tower(bx + rng.range(-4, 4), bz + rng.range(-4, 4),
          rng.range(30, 44), rng.range(30, 44), rng.range(20, 58), rng.pick(tints));
      } else if (style === 1) {
        tower(bx - 17, bz, rng.range(22, 28), rng.range(34, 48), rng.range(14, 34), rng.pick(tints));
        tower(bx + 17, bz, rng.range(22, 28), rng.range(34, 48), rng.range(14, 40), rng.pick(tints));
      } else if (style === 2) {
        for (const ox of [-18, 18]) {
          for (const oz of [-18, 18]) {
            tower(bx + ox, bz + oz, rng.range(18, 24), rng.range(18, 24), rng.range(10, 26), rng.pick(tints));
          }
        }
      } else {
        // a parking block: asphalt, bays, two lamps, a low kiosk
        groundQuad(asphalt, bx - 34, bz - 34, bx + 34, bz + 34, 0.015, [1, 1, 1], [0, 0, 5, 5]);
        for (let i = 0; i < 6; i++) {
          groundQuad(plain, bx - 30 + i * 11, bz - 30, bx - 29 + i * 11, bz - 12, 0.025, white);
          groundQuad(plain, bx - 30 + i * 11, bz + 12, bx - 29 + i * 11, bz + 30, 0.025, white);
        }
        tower(bx, bz, 12, 10, 4, 0xd9d2c0, brick);
        parkedSpots.push(
          { x: bx - 24, z: bz - 21, heading: 0 },
          { x: bx - 2, z: bz - 21, heading: 0 },
          { x: bx + 20, z: bz + 21, heading: Math.PI },
        );
      }
      // a shop podium on the avenue face of some blocks
      if (rng.chance(0.45)) {
        const faceSouth = rng.chance(0.5);
        const pz = bz + (faceSouth ? 33 : -33);
        walls(shop, bx, pz, 30, 7, 5, hexColor(0xffffff));
        colliders.push({ minX: bx - 15, maxX: bx + 15, minZ: pz - 3.5, maxZ: pz + 3.5 });
      }
    }
  }

  // ---- Hotel Solana: the tall one on its block, with a porte-cochère
  {
    const cx = 45, cz = -45;
    tower(cx, cz - 4, 26, 30, 52, 0xf7e3c2);
    walls(shop, cx, cz + 16, 24, 6, 5.5, hexColor(0xffffff));
    colliders.push({ minX: cx - 12, maxX: cx + 12, minZ: cz + 13, maxZ: cz + 19 });
    plain.box(cx, 6.4, cz + 21, 20, 0.4, 5, hexColor(0xbc4749)); // the canopy
    for (const sx of [-9, 9]) plain.cylinder(cx + sx, 3, cz + 23, 0.14, 0.14, 6, 6, darkMetal);
    plain.box(cx, 55, cz - 4, 10, 2.2, 0.6, hexColor(0xbc4749)); // the roof sign board
    landmarks.hotel = { x: cx, z: cz + 26, name: 'Hotel Solana' };
    parkedSpots.push({ x: cx - 6, z: cz + 27, heading: Math.PI / 2 }, { x: cx + 6, z: cz + 27, heading: Math.PI / 2 });
  }

  // ---- Palmera Park: a green block of lawns, paths and palms
  {
    const cx = -45, cz = 135;
    groundQuad(plain, cx - 36, cz - 36, cx + 36, cz + 36, 0.014, grassCol);
    groundQuad(plain, cx - 36, cz - 1.2, cx + 36, cz + 1.2, 0.024, pavement);
    groundQuad(plain, cx - 1.2, cz - 36, cx + 1.2, cz + 36, 0.024, pavement);
    // the kiosk at the crossing: a counter, a striped roof
    plain.box(cx, 1.1, cz, 3.4, 2.2, 3.4, hexColor(0xf2f0eb));
    plain.cone(cx, 3.1, cz, 3.1, 1.6, 4, hexColor(0xbc4749));
    colliders.push({ minX: cx - 1.7, maxX: cx + 1.7, minZ: cz - 1.7, maxZ: cz + 1.7 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      plain.cylinder(cx + Math.cos(a) * 20, 0.5, cz + Math.sin(a) * 20, 1.6, 1.8, 0.35, 10, hexColor(0x8fae7e));
    }
    landmarks.park = { x: cx + 6, z: cz + 6, name: 'Palmera Park' };
    sidewalkLoops.push({ cx, cz, half: 26 });
  }

  // ---- Venn Auto Repairs: a workshop in its block, yard to the road
  {
    const cx = -148, cz = 56;
    walls(brick, cx, cz, 24, 18, 7, hexColor(0xffffff));
    plain.box(cx, 3.4, cz + 9.2, 14, 5.6, 0.3, hexColor(0x27313a)); // the open shutter face
    plain.box(cx, 7.6, cz, 16, 1.4, 0.5, hexColor(0xe4572e)); // the sign board
    // yard clutter: a tyre stack, a hoist frame, drums
    for (let i = 0; i < 3; i++) plain.cylinder(-128, 0.3 + i * 0.55, 74, 0.55, 0.55, 0.5, 10, hexColor(0x232a30));
    plain.box(-160, 1.6, 76, 0.25, 3.2, 0.25, darkMetal);
    plain.box(-156, 1.6, 76, 0.25, 3.2, 0.25, darkMetal);
    plain.box(-158, 3.3, 76, 4.4, 0.3, 0.3, darkMetal);
    colliders.push({ minX: cx - 12, maxX: cx + 12, minZ: cz - 9, maxZ: cz + 9 });
    landmarks.garage = { x: -132, z: 82, name: 'Venn Auto Repairs' };
    parkedSpots.push({ x: -126, z: 70, heading: Math.PI / 2 });
  }

  // ------------------------------------------------------------ named fronts
  // Café Solmar on the south promenade: a low warm building, a striped
  // awning over a terrace, and the plaza Dario washes up on.
  {
    const cx = 24, cz = 228;
    walls(shop, cx, cz, 22, 13, 6, hexColor(0xffe9c9));
    plain.box(cx, 4.4, cz - 7.6, 20, 0.3, 3.4, hexColor(0xbc4749)); // terrace awning
    for (const sx of [-9, 9]) plain.cylinder(cx + sx, 2.1, cz - 9, 0.09, 0.09, 4.2, 5, darkMetal);
    plain.box(cx, 7.1, cz, 12, 1.6, 0.5, hexColor(0x2a6f77)); // the café sign
    // terrace tables with umbrellas, waiting for the morning crowd
    for (const tx of [-7, 0, 7]) {
      plain.cylinder(cx + tx, 0.45, 212, 0.55, 0.55, 0.08, 9, white);
      plain.cylinder(cx + tx, 1, 212, 0.04, 0.04, 2, 5, darkMetal);
      plain.cone(cx + tx, 2.2, 212, 1.6, 0.7, 8, hexColor(0x2a9d8f));
    }
    colliders.push({ minX: cx - 11, maxX: cx + 11, minZ: cz - 6.5, maxZ: cz + 6.5 });
    landmarks.cafe = { x: cx, z: 200, name: 'Café Solmar' };
    sidewalkLoops.push({ cx: 24, cz: 206, half: 11 });
    parkedSpots.push({ x: 6, z: 214, heading: Math.PI }, { x: 42, z: 214, heading: Math.PI });
  }

  // Solana Police HQ on the north promenade: blue-grey, flag, steps.
  {
    const cx = -24, cz = -228;
    walls(facade, cx, cz, 26, 14, 11, hexColor(0xb9c8dc));
    plain.box(cx, 12, cz, 14, 1.8, 0.5, hexColor(0x2c4a72));
    plain.box(cx, 3.2, cz + 7.3, 5, 6.4, 0.4, hexColor(0x2c4048)); // glass doors
    for (let i = 0; i < 3; i++) plain.box(cx, 0.25 + i * 0.3, cz + 9 + i * 0.8, 10 - i * 1.4, 0.5, 0.9, concrete);
    plain.cylinder(cx + 16, 4.4, cz + 6, 0.07, 0.1, 8.8, 5, darkMetal); // flagpole
    plain.box(cx + 17.1, 8.2, cz + 6, 2.2, 1.2, 0.08, hexColor(0x457b9d));
    colliders.push({ minX: cx - 13, maxX: cx + 13, minZ: cz - 7, maxZ: cz + 7 });
    landmarks.police = { x: cx, z: -200, name: 'Solana Police HQ' };
    parkedSpots.push({ x: -44, z: -214, heading: 0 }, { x: -4, z: -214, heading: 0 });
  }

  // St. Solana Hospital, also north: white brick, a red cross, a
  // canopy over the ambulance bay.
  {
    const cx = 114, cz = -228;
    walls(brick, cx, cz, 28, 15, 13, hexColor(0xf4f6f7));
    plain.box(cx - 8, 8.5, cz + 7.7, 0.5, 3.4, 0.35, hexColor(0xd64545)); // the cross, upright
    plain.box(cx - 8, 8.5, cz + 7.7, 0.5, 0.35, 3.4, hexColor(0xd64545)); // (drawn on the face plane)
    plain.box(cx + 6, 3.4, cz + 10.5, 14, 0.35, 6, hexColor(0xd9d2c0)); // ambulance canopy
    for (const sx of [-6, 6]) plain.cylinder(cx + 6 + sx, 1.7, cz + 13, 0.12, 0.12, 3.4, 6, darkMetal);
    colliders.push({ minX: cx - 14, maxX: cx + 14, minZ: cz - 7.5, maxZ: cz + 7.5 });
    landmarks.hospital = { x: cx, z: -200, name: 'St. Solana Hospital' };
    parkedSpots.push({ x: 96, z: -212, heading: Math.PI / 2 }, { x: 132, z: -212, heading: -Math.PI / 2 });
  }

  // ------------------------------------------------------------ the docks
  // The west shore working quay: a concrete apron, three piers into
  // the sea, two cranes, and the container stacks of the ferry trade.
  {
    groundQuad(plain, -268, -24, -252, 104, 0.018, hexColor(0xa8a294));
    for (const pz of [0, 40, 80]) {
      groundQuad(plain, -296, pz - 3, -266, pz + 3, 0.02, hexColor(0x9b958a));
      for (const px of [-294, -280]) plain.cylinder(px, 0.4, pz, 0.22, 0.26, 1.4, 7, hexColor(0x5d4a33));
    }
    // the cranes: a post, a long jib over the water, a hanging crate
    for (const [kx, kz] of [[-262, 8], [-262, 66]]) {
      plain.cylinder(kx, 5, kz, 0.3, 0.42, 10, 8, hexColor(0xc96f2e));
      plain.box(kx - 5.5, 9.6, kz, 13, 0.5, 0.5, hexColor(0xc96f2e));
      plain.box(kx - 10.5, 6.8, kz, 0.06, 5.2, 0.06, darkMetal);
      plain.box(kx - 10.5, 3.9, kz, 1.7, 1.3, 1.7, hexColor(0xb08968));
      plain.box(kx + 2.4, 8.6, kz, 1.4, 1.2, 1.4, darkMetal);
      colliders.push({ minX: kx - 0.6, maxX: kx + 0.6, minZ: kz - 0.6, maxZ: kz + 0.6 });
    }
    // container stacks along the quay's landward edge
    const boxCols = [0xbc4749, 0x457b9d, 0x606c38, 0xe9c46a, 0x2a9d8f];
    for (let i = 0; i < 7; i++) {
      const cz2 = -14 + i * 16;
      const col = hexColor(boxCols[i % boxCols.length]);
      plain.box(-256.5, 1.3, cz2, 5.4, 2.6, 11, col);
      if (i % 2 === 0) plain.box(-256.5, 3.9, cz2, 5.4, 2.6, 11, hexColor(boxCols[(i + 2) % boxCols.length]));
      colliders.push({ minX: -259.2, maxX: -253.8, minZ: cz2 - 5.5, maxZ: cz2 + 5.5 });
    }
    landmarks.docks = { x: -246, z: 40, name: 'West Docks' };
    sidewalkLoops.push({ cx: -258, cz: 40, half: 8 });
    parkedSpots.push({ x: -246, z: -8, heading: Math.PI / 2 }, { x: -246, z: 88, heading: -Math.PI / 2 });
  }

  // ------------------------------------------------------------ the point
  // A sand spit south of the promenade, and the lighthouse at its
  // end: white drum, red bands, a lamp room with a warm heart.
  {
    groundQuad(plain, 82, 246, 110, 300, 0.01, hexColor(0xe2cca4), [0, 0, 3, 5]);
    const lx = 96, lz = 290;
    plain.cylinder(lx, 1, lz, 4.6, 5.2, 2, 12, hexColor(0x9b958a)); // the rock plinth
    plain.cylinder(lx, 6, lz, 2.6, 3.2, 10, 12, white);
    plain.cylinder(lx, 8.2, lz, 2.75, 2.75, 1.6, 12, hexColor(0xd64545));
    plain.cylinder(lx, 12.6, lz, 2.2, 2.2, 1.4, 12, hexColor(0xd64545));
    plain.cylinder(lx, 14.6, lz, 1.5, 1.5, 2.6, 10, hexColor(0x2c4048)); // the lamp room
    plain.cone(lx, 17, lz, 2.1, 2.2, 10, hexColor(0x27313a));
    colliders.push({ minX: lx - 3.4, maxX: lx + 3.4, minZ: lz - 3.4, maxZ: lz + 3.4 });
    landmarks.lighthouse = { x: lx, z: 280, name: 'Solana Point Lighthouse' };
    // the lamp itself: a small glowing sphere inside the lamp room
    const lampBuilder = new GeoBuilder();
    lampBuilder.cylinder(0, 0, 0, 0.85, 0.85, 1.5, 10, hexColor(0xffca7a));
    const lamp = new Obj(lampBuilder.build(gl), { texture: textures.glow, emissive: 1.4 });
    lamp.pos = [lx, 14.6, lz];
    group.add(lamp);
  }

  // ------------------------------------------------------------ greenery
  // Palms along the promenades and in the park, planted by the same
  // seeded hand so the town is identical at every boot.
  for (let x = -240; x <= 240; x += 32) {
    palmInto(plain, x + rng.range(-3, 3), 246, rng, rng.range(0.9, 1.15));
    palmInto(plain, x + rng.range(-3, 3), -246, rng, rng.range(0.9, 1.15));
  }
  for (let i = 0; i < 7; i++) {
    palmInto(plain, -45 + rng.range(-30, 30), 135 + rng.range(-30, 30), rng, rng.range(0.85, 1.1));
  }
  palmInto(plain, 88, 262, rng, 1);
  palmInto(plain, 104, 262, rng, 0.9);

  // a few more pedestrian loops around ordinary blocks
  sidewalkLoops.push(
    { cx: 45, cz: 45, half: 41 },
    { cx: -45, cz: -45, half: 41 },
    { cx: 135, cz: 135, half: 41 },
    { cx: -135, cz: -135, half: 41 },
  );

  // ---- bake the merged meshes into the group
  const addBaked = (builder, texture) => {
    if (builder.idx.length === 0) return;
    group.add(new Obj(builder.build(gl), { texture: texture || null }));
  };
  addBaked(asphalt, textures.asphalt);
  addBaked(facade, textures.facade);
  addBaked(shop, textures.shop);
  addBaked(brick, textures.brick);
  addBaked(plain, null);

  return {
    group,
    colliders,
    landmarks,
    parkedSpots,
    sidewalkLoops,
    spawn: { x: 16, z: 180 },
    sea,
  };
}
