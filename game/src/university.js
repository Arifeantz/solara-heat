// university.js — Solana Heights: the university quarter on the west shore.
//
// The avenue grid ends at the city's west edge; beyond it a strip of sand
// ran down to the sea with nothing on it but grass. This module builds the
// Heights on that strip: a coast road, a main hall with a columned
// portico, a glasshouse, a brick library, an open-air amphitheatre, a
// clock tower, dormitories, a student café, tennis courts, and an
// observatory whose dome still turns at night, watching a sky the
// city lights mostly leave alone.
//
// The shape of the return matches the city's: a baked group, colliders,
// landmarks, parked-car spots and sidewalk loops, folded into the world
// by main.js before traffic and pedestrians are placed. One update(now)
// keeps the dome turning, the fountain breathing and the flags awake.

import { GeoBuilder, Obj, Mat4, hexColor } from './engine.js';
import { Rng } from './random.js';
import { mergeGeo } from './airport.js';

// ------------------------------------------------------------ helpers

// A flat ground rectangle in one builder: corners (x0, z0) to (x1, z1).
function plot(b, x0, z0, x1, z1, y, color) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color, [0, 0, 1, 1]);
}

// A walled block in the textured builder: four windowed walls, a flat
// roof, a parapet rim standing proud of the roofline in the plain
// builder, and a stone plinth band around the foot. The uv is scaled so
// windows and bricks keep their size whatever the block's footprint.
function block(tex, plain, cx, cz, w, d, h, tintHex, capHex) {
  const tint = hexColor(tintHex);
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const uw = Math.max(1, Math.round(w / 11));
  const ud = Math.max(1, Math.round(d / 11));
  const uh = Math.max(1, Math.round(h / 11));
  tex.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], tint, [0, 0, uw, uh]);
  tex.quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], tint, [0, 0, uw, uh]);
  tex.quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], tint, [0, 0, ud, uh]);
  tex.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], tint, [0, 0, ud, uh]);
  const roof = [tint[0] * 0.5, tint[1] * 0.48, tint[2] * 0.46];
  tex.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], roof, [0, 0, 1, 1]);
  const cap = hexColor(capHex);
  plain.box(cx, h + 0.3, z0 + 0.35, w, 0.6, 0.7, cap);
  plain.box(cx, h + 0.3, z1 - 0.35, w, 0.6, 0.7, cap);
  plain.box(x0 + 0.35, h + 0.3, cz, 0.7, 0.6, d, cap);
  plain.box(x1 - 0.35, h + 0.3, cz, 0.7, 0.6, d, cap);
  plain.box(cx, 0.45, cz, w + 0.6, 0.9, d + 0.6, hexColor(0x8f8574));
}

// A slim shore palm of my own: a curved stack of trunk rings and a burst
// of flattened cones, built at the origin to be merged along the shore.
function palmGeo(rng) {
  const b = new GeoBuilder();
  const bark = hexColor(0x7d5f43);
  let px = 0, py = 0;
  for (let s = 0; s < 5; s++) {
    const ring = new GeoBuilder();
    ring.cylinder(0, 0.75, 0, 0.15 - s * 0.012, 0.18 - s * 0.012, 1.5, 6, bark);
    mergeGeo(b, ring, Mat4.compose(px, py, 0, 0, 0, 0.05 * s, 1, 1, 1));
    px += 0.07 * s;
    py += 1.45;
  }
  const greens = [hexColor(0x3c9950), hexColor(0x4cab60)];
  for (let i = 0; i < 8; i++) {
    const frond = new GeoBuilder();
    frond.cone(0, 1.5, 0, 0.4, 3.1, 4, greens[i % 2]);
    mergeGeo(b, frond, Mat4.compose(px, py + 0.5, 0, 1.3, (i / 8) * Math.PI * 2 + rng.range(-0.2, 0.2), 0, 1, 1, 0.3));
  }
  return b;
}

// ------------------------------------------------------------ the Heights

export function buildUniversity(gl, textures) {
  const rng = new Rng(2027);
  const group = new Obj();
  const colliders = [];
  const parkedSpots = [];
  const landmarks = {};

  const asphalt = new GeoBuilder();
  const plain = new GeoBuilder();
  const facade = new GeoBuilder();
  const brick = new GeoBuilder();
  const shop = new GeoBuilder();

  const grass = hexColor(0x6fae56);
  const lawn = hexColor(0x7fbb60);
  const concrete = hexColor(0xcac2b2);
  const concreteDark = hexColor(0xb0a890);
  const pathPale = hexColor(0xded3ba);
  const white = hexColor(0xf2f0eb);
  const darkMetal = hexColor(0x3c4147);
  const bronze = hexColor(0x7a6238);

  // ---- ground: grass over the whole shore strip, then the road
  plot(plain, -300, -218, -252, 218, 0.012, grass);
  asphalt.quad([-269, 0.03, 214], [-261, 0.03, 214], [-261, 0.03, -214], [-269, 0.03, -214], [0, 1, 0], [1, 1, 1], [0, 0, 1, 54]);
  for (let z = -208; z <= 208; z += 12) {
    plot(plain, -265.18, z, -264.82, z + 3.4, 0.045, hexColor(0xf7e08a));
  }
  plot(plain, -261, -214, -253, 214, 0.02, concrete); // the east sidewalk
  // the gateway arch where the shore road meets the airfield road: two
  // stone posts and a beam, so arriving feels like arriving somewhere
  plain.box(-268.5, 3.1, -213, 1.1, 6.2, 1.1, hexColor(0xd9cfb8));
  plain.box(-256.5, 3.1, -213, 1.1, 6.2, 1.1, hexColor(0xd9cfb8));
  plain.box(-262.5, 6.6, -213, 13.5, 1.1, 1.5, hexColor(0x0e7c86));
  plain.box(-262.5, 6.6, -212.2, 12.6, 0.5, 0.08, white);

  // lamps down the coast road, palms along the sea edge
  for (let z = -200; z <= 200; z += 36) {
    plain.cylinder(-270.4, 3, z, 0.09, 0.12, 6, 5, darkMetal);
    plain.box(-270.4, 6.1, z, 0.5, 0.3, 0.5, hexColor(0xffe9a8));
  }
  for (let z = -196; z <= 196; z += 44) {
    mergeGeo(plain, palmGeo(rng), Mat4.compose(-296.5 + rng.range(-1.5, 1.5), 0, z + rng.range(-6, 6), 0, rng.range(0, 6.28), 0, 1.05, 1.05, 1.05));
  }

  // ---- the observatory on the north rise: a drum, a dome, a telescope
  {
    const cx = -283, cz = -196;
    plot(plain, -297, -213, -269, -179, 0.02, concreteDark);
    plain.cylinder(cx, 3.5, cz, 6.2, 6.8, 7, 14, hexColor(0xe8e0cc));
    plain.cylinder(cx, 7.3, cz, 6.5, 6.5, 0.6, 14, hexColor(0x8a4b2a));
    // a slit door and two small windows punched into the drum's face
    plain.box(cx + 6.35, 1.6, cz, 0.3, 3.2, 1.6, hexColor(0x27313a));
    plain.box(cx + 4.6, 4.6, cz - 4.6, 0.25, 1.1, 1.1, hexColor(0x2c4048));
    plain.box(cx + 4.6, 4.6, cz + 4.6, 0.25, 1.1, 1.1, hexColor(0x2c4048));
    colliders.push({ minX: cx - 6.8, maxX: cx + 6.8, minZ: cz - 6.8, maxZ: cz + 6.8 });
    landmarks.observatory = { x: -268, z: cz, name: 'Heights Observatory' };
  }

  // ---- the main hall: the quarter's face, with a columned portico
  {
    const cx = -282, cz = -140;
    block(facade, plain, cx, cz, 20, 36, 13, 0xf7e3c2, 0x8a4b2a);
    // entrance steps climbing to the portico on the road side
    for (let i = 0; i < 3; i++) {
      plain.box(cx + 10.6 + i * 0.55, 0.25 + i * 0.28, cz, 1.1 - i * 0.3, 0.5, 12, hexColor(0xd9cfb8));
    }
    // four columns and the pediment they carry (a prism, ridge along X,
    // its triangular end facing the road like a temple front)
    for (const off of [-4.8, -1.6, 1.6, 4.8]) {
      plain.cylinder(cx + 11.4, 3.4, cz + off, 0.42, 0.48, 6.8, 8, white);
    }
    plain.box(cx + 11.4, 7.1, cz, 1.2, 0.5, 12.4, white);
    const ped = new GeoBuilder();
    ped.prism(0, 0, 0, 1.6, 3.0, 12.4, white);
    mergeGeo(plain, ped, Mat4.compose(cx + 11.4, 8.8, cz, 0, 0, 0, 1, 1, 1));
    // the hall's name board over the steps, and its two flag poles
    plain.box(cx + 10.15, 11.3, cz, 0.5, 2.0, 14, hexColor(0x0e7c86));
    for (const off of [-8.5, 8.5]) {
      plain.cylinder(cx + 13.5, 4.4, cz + off, 0.07, 0.1, 8.8, 6, darkMetal);
    }
    colliders.push({ minX: cx - 10, maxX: cx + 10, minZ: cz - 18, maxZ: cz + 18 });
    landmarks.university = { x: -264, z: cz, name: 'Solana Heights University' };
  }

  // ---- the lecture hall, plainer and proud of it
  block(facade, plain, -283, -90, 18, 22, 9, 0xdfe7f5, 0x6d6875);
  plain.box(-273.8, 5.4, -90, 0.4, 1.6, 9, hexColor(0x457b9d));
  colliders.push({ minX: -292, maxX: -274, minZ: -101, maxZ: -79 });

  // ---- the quad: a lawn with a walking square, a fountain, a founder
  plot(plain, -295, -72, -270, -12, 0.025, lawn);
  // the walking square the students pace between lectures
  plot(plain, -296.8, -54.8, -271.2, -53.2, 0.035, pathPale);
  plot(plain, -296.8, -29.2, -271.2, -27.6, 0.035, pathPale);
  plot(plain, -296.8, -54.8, -295.2, -27.6, 0.035, pathPale);
  plot(plain, -272.8, -54.8, -271.2, -27.6, 0.035, pathPale);
  // the cross paths through the fountain
  plot(plain, -284.8, -72, -283.2, -12, 0.033, pathPale);
  plot(plain, -295, -42.8, -270, -41.2, 0.033, pathPale);
  {
    // the fountain: a stone basin, a pillar, a top bowl. Its water is a
    // living object added below, so the update can make it breathe.
    const fx = -284, fz = -42;
    plain.cylinder(fx, 0.45, fz, 3.4, 3.7, 0.9, 14, hexColor(0xb9b0a0));
    plain.cylinder(fx, 1.5, fz, 0.35, 0.5, 2.2, 8, hexColor(0xa39a89));
    plain.cylinder(fx, 2.7, fz, 1.1, 0.8, 0.5, 10, hexColor(0xb9b0a0));
    colliders.push({ minX: fx - 3.7, maxX: fx + 3.7, minZ: fz - 3.7, maxZ: fz + 3.7 });
    // the founder, in bronze, pointing at the sea he never crossed
    const sx = -284, sz = -17;
    plain.box(sx, 0.8, sz, 1.8, 1.6, 1.8, hexColor(0x8f8574));
    plain.box(sx, 2.2, sz, 0.55, 1.3, 0.4, bronze); // legs together, mid-stride
    plain.box(sx, 3.3, sz, 0.8, 1.1, 0.45, bronze); // the greatcoat torso
    plain.box(sx + 0.55, 3.7, sz, 0.85, 0.22, 0.22, bronze); // the pointing arm
    plain.box(sx - 0.45, 3.2, sz, 0.6, 0.2, 0.2, bronze); // the resting arm
    plain.cylinder(sx, 4.15, sz, 0.26, 0.28, 0.55, 8, bronze); // the head
    colliders.push({ minX: sx - 1, maxX: sx + 1, minZ: sz - 1, maxZ: sz + 1 });
  }
  // benches facing the fountain, and a rack of imaginary bicycles
  for (const [bx, bz, ry] of [[-279, -47, 0.6], [-289, -47, -0.6], [-279, -37, 2.5], [-289, -37, -2.5]]) {
    const bench = new GeoBuilder();
    bench.box(0, 0.45, 0, 2.2, 0.12, 0.55, hexColor(0x7a5c3e));
    bench.box(0, 0.85, -0.28, 2.2, 0.5, 0.1, hexColor(0x7a5c3e));
    bench.box(-0.9, 0.22, 0, 0.12, 0.45, 0.5, darkMetal);
    bench.box(0.9, 0.22, 0, 0.12, 0.45, 0.5, darkMetal);
    mergeGeo(plain, bench, Mat4.compose(bx, 0, bz, 0, ry, 0, 1, 1, 1));
  }
  for (let i = 0; i < 5; i++) {
    plain.box(-271.5, 0.5, -64 + i * 1.1, 0.08, 1.0, 0.08, darkMetal);
  }

  // ---- the greenhouse between the halls: glass, warmth, orchids.
  // A pale glass box under a prism roof (the engine's prism earns its
  // keep here), with planting benches visible through the walls and a
  // gravel garden of flower beds laid out in front of it.
  {
    const cx = -283, cz = -111;
    plot(plain, -296, -120, -270, -102, 0.022, hexColor(0xd9cfb8));
    plain.box(cx, 1.5, cz, 15, 3, 11, hexColor(0xbfe0e8)); // glass walls
    plain.box(cx, 3.15, cz, 15.6, 0.3, 11.6, white); // the wall plate
    for (const off of [-5.2, 0, 5.2]) {
      plain.box(cx + off, 1.5, cz - 5.6, 0.35, 3.2, 0.35, white);
      plain.box(cx + off, 1.5, cz + 5.6, 0.35, 3.2, 0.35, white);
    }
    const roof = new GeoBuilder();
    roof.prism(0, 0, 0, 16, 2.6, 11.6, hexColor(0xd9eef2));
    mergeGeo(plain, roof, Mat4.compose(cx, 4.5, cz, 0, 0, 0, 1, 1, 1));
    // inside: two planting benches and the green they carry
    for (const off of [-2.8, 2.8]) {
      plain.box(cx, 0.95, cz + off, 12, 0.18, 1.6, hexColor(0x7a5c3e));
      plain.box(cx, 1.25, cz + off, 11.4, 0.45, 1.3, hexColor(0x3f7d3a));
    }
    colliders.push({ minX: cx - 7.5, maxX: cx + 7.5, minZ: cz - 5.5, maxZ: cz + 5.5 });
    // flower beds in the plot's four corners: dark soil, a bright
    // heart of colour, small enough to tend from the gravel
    const bedCols = [0xe4572e, 0xe9c46a, 0xbc4749, 0x9a86c8];
    const corners = [[-294.5, -118.5], [-271.5, -118.5], [-294.5, -103.5], [-271.5, -103.5]];
    corners.forEach(([bx, bz], i) => {
      plot(plain, bx - 2, bz - 1.1, bx + 2, bz + 1.1, 0.035, hexColor(0x4a3826));
      plot(plain, bx - 1.5, bz - 0.7, bx + 1.5, bz + 0.7, 0.045, hexColor(bedCols[i]));
    });
  }

  // ---- the library in brick: the quarter's quiet heart
  block(brick, plain, -282, 6, 20, 26, 11, 0xffffff, 0x5d4a38);
  plain.box(-271.8, 8.6, 6, 0.5, 1.9, 12, hexColor(0x2a6f77));
  plain.box(-271.8, 3.4, 6, 0.4, 4.6, 3.2, hexColor(0x2c4048)); // the glass door
  for (let i = 0; i < 3; i++) {
    plain.box(-271.2 + i * 0.5, 0.2 + i * 0.2, 6, 1.0 - i * 0.24, 0.4, 5, hexColor(0xd9cfb8));
  }
  colliders.push({ minX: -292, maxX: -272, minZ: -7, maxZ: 19 });
  landmarks.library = { x: -264, z: 6, name: 'University Library' };

  // ---- the open-air amphitheatre south of the library: four stone
  // arcs stepping down to a stage slab, where the drama society performs
  // to the gulls every spring whether the gulls asked or not
  {
    const sx = -282, sz = 40;
    plot(plain, -298, 22, -266, 41.5, 0.02, hexColor(0x8fae7e));
    for (let row = 0; row < 4; row++) {
      const radius = 8.5 + row * 2.6;
      const seatY = 0.35 + row * 0.55;
      for (let k = 0; k <= 8; k++) {
        const a = -Math.PI / 2 + (k / 8 - 0.5) * 1.9; // an arc opening south
        const bx = sx + Math.cos(a) * radius;
        const bz = sz + Math.sin(a) * radius * 0.8;
        const seg = new GeoBuilder();
        seg.box(0, 0, 0, 2.9, seatY + 0.35, 1.1, hexColor(row % 2 ? 0xcfc4a8 : 0xbfb294));
        mergeGeo(plain, seg, Mat4.compose(bx, seatY / 2, bz, 0, -a - Math.PI / 2, 0, 1, 1, 1));
      }
    }
    plain.box(sx, 0.3, sz + 3.5, 9, 0.6, 4.5, hexColor(0xa89a78)); // the stage
    for (const off of [-5.5, 5.5]) {
      plain.cylinder(sx + off, 2.1, sz + 4.6, 0.3, 0.36, 4.2, 8, hexColor(0xe9dfc8));
      plain.box(sx + off, 4.4, sz + 4.6, 1.1, 0.4, 1.1, white);
    }
    plain.box(sx, 4.9, sz + 4.6, 12.2, 0.5, 1.2, white); // the stage beam
    colliders.push({ minX: sx - 16, maxX: sx + 16, minZ: sz - 13, maxZ: sz + 6 });
  }

  // ---- the clock tower: thirty metres of confidence over the quad
  {
    const cx = -276, cz = 50;
    plain.box(cx, 15, cz, 7, 30, 7, hexColor(0xe8dfc8));
    plain.box(cx, 15, cz, 7.6, 30, 0.5, hexColor(0xcbbfa5)); // a shade band
    const roof = new GeoBuilder();
    roof.cone(0, 0, 0, 5.4, 6, 4, hexColor(0x8a4b2a));
    mergeGeo(plain, roof, Mat4.compose(cx, 33, cz, 0, Math.PI / 4, 0, 1, 1, 1));
    // clock faces east and west, both agreeing it is twenty past four
    for (const s of [-1, 1]) {
      plain.box(cx + s * 3.6, 26, cz, 0.25, 4.4, 4.4, white);
      const handA = new GeoBuilder();
      handA.box(0, 0.8, 0, 0.28, 1.7, 0.1, hexColor(0x232a30));
      mergeGeo(plain, handA, Mat4.compose(cx + s * 3.78, 26, cz, 0, 0, s * 0.5, 1, 1, 1));
      const handB = new GeoBuilder();
      handB.box(0, 0.55, 0, 0.22, 1.2, 0.1, hexColor(0x232a30));
      mergeGeo(plain, handB, Mat4.compose(cx + s * 3.78, 26, cz, 0, 0, s * 2.2, 1, 1, 1));
    }
    plain.box(cx, 1.8, cz + 3.6, 2.2, 3.6, 0.3, hexColor(0x27313a)); // its door
    colliders.push({ minX: cx - 3.8, maxX: cx + 3.8, minZ: cz - 3.8, maxZ: cz + 3.8 });
    landmarks.clocktower = { x: -267, z: cz, name: 'The Clock Tower' };
  }

  // ---- two dormitories on their own green, laundry not included
  plot(plain, -296, 76, -269, 144, 0.02, lawn);
  const dormCols = [0xfce8ec, 0xd8ecf3];
  for (let i = 0; i < 2; i++) {
    const cz = 92 + i * 36;
    block(facade, plain, -283, cz, 18, 22, 10, dormCols[i], 0x6d6875);
    plain.box(-273.8, 6.2, cz, 0.4, 1.5, 8, hexColor(i ? 0xe4572e : 0x2a9d8f));
    colliders.push({ minX: -292, maxX: -274, minZ: cz - 11, maxZ: cz + 11 });
  }
  // a volleyball net strung across the dorm green, sagging honestly
  plain.cylinder(-284, 0.9, 110, 0.06, 0.06, 1.8, 5, darkMetal);
  plain.cylinder(-278, 0.9, 110, 0.06, 0.06, 1.8, 5, darkMetal);
  plain.box(-281, 1.45, 110, 6, 0.7, 0.06, hexColor(0xf2f0eb));

  // ---- the Union café: small, warm, open implausibly late
  block(shop, plain, -281, 168, 16, 14, 6, 0xffe9c9, 0x8a4b2a);
  plain.box(-281, 7.0, 175.4, 11, 1.7, 0.7, hexColor(0xbc4749));
  for (const off of [-4.5, 4.5]) {
    // two café tables on the pavement, umbrellas up against the sun
    plain.cylinder(-274.5, 0.45, 168 + off, 0.5, 0.5, 0.08, 10, white);
    plain.cylinder(-274.5, 1.0, 168 + off, 0.04, 0.04, 2.0, 5, darkMetal);
    const umb = new GeoBuilder();
    umb.cone(0, 0, 0, 1.7, 0.7, 8, hexColor(0x2a9d8f));
    mergeGeo(plain, umb, Mat4.compose(-274.5, 2.1, 168 + off, 0, 0, 0, 1, 1, 1));
  }
  colliders.push({ minX: -289, maxX: -273, minZ: 161, maxZ: 175 });
  landmarks.union = { x: -264, z: 168, name: 'The Union Café' };

  // the bike rack by the café door: four steel hoops and the three
  // bicycles the quarter actually runs on, frames and wheels and all
  {
    const bx = -271.5, bz = 163;
    for (let i = 0; i < 4; i++) {
      plain.box(bx, 0.45, bz + i * 1.1, 0.08, 0.9, 0.08, darkMetal);
      plain.box(bx, 0.92, bz + i * 1.1, 0.08, 0.08, 0.75, darkMetal);
      plain.box(bx, 0.45, bz + i * 1.1 + 0.7, 0.08, 0.9, 0.08, darkMetal);
    }
    const bikeCols = [0xbc4749, 0x457b9d, 0xe9c46a];
    for (let i = 0; i < 3; i++) {
      const z = bz + 0.35 + i * 1.1;
      const frame = hexColor(bikeCols[i]);
      // wheels are cylinders turned on their side: axis along Z
      for (const wx of [bx - 0.55, bx + 0.55]) {
        const wheel = new GeoBuilder();
        wheel.cylinder(0, 0, 0, 0.3, 0.3, 0.07, 8, darkMetal);
        mergeGeo(plain, wheel, Mat4.compose(wx, 0.34, z, Math.PI / 2, 0, 0, 1, 1, 1));
      }
      plain.box(bx, 0.62, z, 1.0, 0.07, 0.07, frame);
      plain.box(bx + 0.42, 0.78, z, 0.07, 0.4, 0.07, frame);
      plain.box(bx + 0.5, 0.95, z, 0.07, 0.07, 0.5, darkMetal);
    }
  }

  // ---- the tennis courts at the south end, fenced with good intentions
  for (const ccx of [-289, -277]) {
    plot(plain, ccx - 5, 188, ccx + 5, 212, 0.03, hexColor(0x4a7d5a));
    plot(plain, ccx - 5, 199.6, ccx + 5, 200.4, 0.04, white); // the net line
    plot(plain, ccx - 4.4, 189, ccx + 4.4, 189.5, 0.04, white);
    plot(plain, ccx - 4.4, 210.5, ccx + 4.4, 211, 0.04, white);
    plain.box(ccx, 0.5, 200, 10.4, 0.9, 0.12, hexColor(0x2c3438)); // the net
    plain.cylinder(ccx - 5.2, 0.5, 200, 0.06, 0.06, 1.0, 5, darkMetal);
    plain.cylinder(ccx + 5.2, 0.5, 200, 0.06, 0.06, 1.0, 5, darkMetal);
  }

  // ---- parking: a north lot by the observatory road, a south lot by
  // the dorms, both on the east sidewalk's far side
  plot(plain, -261, -198, -252, -172, 0.025, concreteDark);
  plot(plain, -261, 98, -252, 124, 0.025, concreteDark);
  parkedSpots.push(
    { x: -256.5, z: -192, heading: Math.PI / 2 },
    { x: -256.5, z: -184, heading: Math.PI / 2 },
    { x: -256.5, z: -176, heading: Math.PI / 2 },
    { x: -256.5, z: 104, heading: -Math.PI / 2 },
    { x: -256.5, z: 112, heading: -Math.PI / 2 },
    { x: -256.5, z: 120, heading: -Math.PI / 2 },
  );

  // students pace the quad square and circle the dorm green
  const sidewalkLoops = [
    { cx: -284, cz: -42, half: 12 },
    { cx: -283, cz: 110, half: 12 },
  ];

  // ---- the old jetty: planks out over the water west of the clock
  // tower, where the rowing club keeps one boat and a great many
  // opinions. The deck is baked here; the boat is a living object.
  {
    const jz = 66;
    for (let px = -300; px >= -314; px -= 2.3) {
      plain.box(px, 0.32, jz, 2.4, 0.16, 3.4, hexColor(0x8a6f4d));
      for (const off of [-1.4, 1.4]) {
        plain.cylinder(px, -0.5, jz + off, 0.12, 0.14, 1.4, 6, hexColor(0x5d4a33));
      }
    }
    plain.box(-313, 0.75, jz, 1.6, 0.12, 0.5, hexColor(0x7a5c3e)); // the bench
    plain.cylinder(-300.8, 1.1, jz - 1.5, 0.05, 0.06, 1.6, 5, darkMetal);
    plain.box(-300.8, 2.0, jz - 1.5, 0.3, 0.34, 0.3, hexColor(0xffca7a)); // jetty lamp
  }

  // ---- bake the merged meshes
  const addBaked = (builder, texture) => {
    if (builder.idx.length === 0) return;
    group.add(new Obj(builder.build(gl), { texture: texture || null }));
  };
  addBaked(asphalt, textures.asphalt);
  addBaked(facade, textures.facade);
  addBaked(brick, textures.brick);
  addBaked(shop, textures.shop);
  addBaked(plain, null);

  // ---- the living details: a turning dome with its telescope, the
  // fountain's water, and the main hall's two flags
  const domeBuilder = new GeoBuilder();
  domeBuilder.cylinder(0, 0, 0, 0.9, 6.1, 3.6, 14, hexColor(0xb9c0c4));
  domeBuilder.cylinder(0, 2.1, 0, 0.8, 0.8, 0.5, 10, hexColor(0x8f979c));
  const dome = new Obj(domeBuilder.build(gl));
  dome.pos = [-283, 9.2, -196];
  group.add(dome);
  const scope = new Obj(new GeoBuilder().box(0, 0, 0, 5.6, 0.85, 0.85, hexColor(0xe8e4da)).build(gl));
  scope.pos = [1.8, 1.6, 0];
  scope.rot = [0, 0, -0.5];
  dome.add(scope);

  const water = new Obj(new GeoBuilder().cylinder(0, 0, 0, 3.0, 3.0, 0.18, 14, hexColor(0x3fa7bd)).build(gl), { emissive: 0.22 });
  water.pos = [-284, 0.82, -42];
  group.add(water);
  const spray = new Obj(new GeoBuilder().cone(0, 0, 0, 0.85, 1.9, 8, hexColor(0xcfeef5)).build(gl), { emissive: 0.3, alpha: 0.4 });
  spray.pos = [-284, 3.4, -42];
  group.add(spray);

  const flagCols = [0x0e7c86, 0xff7847];
  const flags = [];
  for (let i = 0; i < 2; i++) {
    const flag = new Obj(new GeoBuilder().box(0.85, 0, 0, 1.7, 1.0, 0.07, hexColor(flagCols[i])).build(gl), { emissive: 0.12 });
    flag.pos = [-268.5, 8.2, -148.5 + i * 17]; // at the main hall's flagpoles
    group.add(flag);
    flags.push(flag);
  }

  // the rowing club's boat, moored off the jetty: a hull, two thwarts
  // and a pair of oars shipped, riding whatever the water is doing
  const boatB = new GeoBuilder();
  boatB.box(0, 0, 0, 3.6, 0.5, 1.3, hexColor(0x2a6f77));
  boatB.box(1.95, 0.08, 0, 0.7, 0.34, 0.9, hexColor(0x2a6f77));
  boatB.box(-0.6, 0.32, 0, 0.14, 0.14, 1.1, hexColor(0x7a5c3e));
  boatB.box(0.7, 0.32, 0, 0.14, 0.14, 1.1, hexColor(0x7a5c3e));
  boatB.box(0.05, 0.42, 0.75, 2.2, 0.07, 0.16, hexColor(0x9a7d52));
  boatB.box(0.05, 0.42, -0.75, 2.2, 0.07, 0.16, hexColor(0x9a7d52));
  const rowboat = new Obj(boatB.build(gl));
  rowboat.pos = [-310, 0.1, 71.5];
  rowboat.rot = [0, 0.5, 0];
  group.add(rowboat);

  return {
    group,
    colliders,
    landmarks,
    parkedSpots,
    sidewalkLoops,
    update(now) {
      dome.rot[1] = now * 0.11;
      const breathe = 1 + Math.sin(now * 1.7) * 0.03;
      water.scale = [breathe, 1, breathe];
      water.emissive = 0.2 + Math.sin(now * 2.3) * 0.06;
      spray.rot[1] = now * 2.1;
      for (let i = 0; i < flags.length; i++) {
        flags[i].rot[1] = Math.sin(now * 2.6 + i * 1.7) * 0.34;
        flags[i].rot[2] = Math.sin(now * 3.9 + i) * 0.1;
      }
      rowboat.pos[1] = 0.1 + Math.sin(now * 1.1) * 0.07;
      rowboat.rot[2] = Math.sin(now * 0.9 + 1) * 0.045;
    },
  };
}
