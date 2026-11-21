// marina.js — Solana Marina: a lagoon harbour cut into the east shore.
// A painted basin of harbour water, a plank boardwalk along its west
// bank, finger piers with moored sailboats, a fish market under striped
// canopies, and two channel buoys that ride the swell. Like the airfield
// it returns world data in the city's shape, and main.js merges it in
// before traffic and pedestrians are built, so boats get colliders,
// cars get shore parking and walkers get a boardwalk loop.

import { GeoBuilder, Obj, Mat4, hexColor } from './engine.js';
import { Rng } from './random.js';
import { mergeGeo } from './airport.js';

// A flat ground quad in the plain builder, corners (x0, z0)-(x1, z1) at y.
function groundQuad(b, x0, z0, x1, z1, y, color) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color, [0, 0, 1, 1]);
}

// ------------------------------------------------------------ the boats

// A moored sailboat, built at the origin with its bow towards +Z and
// merged at its berth. Hull colour and sail tint come in as parameters
// so the fleet is not a row of clones.
function buildBoat(hullHex, sailHex) {
  const b = new GeoBuilder();
  const hull = hexColor(hullHex);
  const sail = hexColor(sailHex);
  const white = hexColor(0xf2f0eb);
  const wood = hexColor(0x8a6b45);
  const glass = hexColor(0x9fd8e8);
  const dark = hexColor(0x232a30);
  // hull: a long box, a diamond bow, a flat stern, a pale deck inside
  b.box(0, 0.45, 0, 2.3, 0.9, 6.8, hull);
  const bow = new GeoBuilder();
  bow.box(0, 0.45, 0, 1.65, 0.85, 1.65, hull);
  mergeGeo(b, bow, Mat4.compose(0, 0, 3.95, 0, Math.PI / 4, 0, 1, 1, 1));
  b.box(0, 0.5, -3.5, 2.1, 0.8, 0.5, hull);
  b.box(0, 0.93, 0, 1.9, 0.1, 6.2, hexColor(0xe8e0cc)); // deck
  b.box(0, 1.0, -3.3, 1.7, 0.16, 0.7, wood); // stern bench
  // cabin trunk with a glass band, and a hatch on top
  b.box(0, 1.25, -0.7, 1.5, 0.6, 1.9, white);
  b.box(0, 1.32, -0.7, 1.54, 0.3, 1.7, glass);
  b.box(0, 1.62, -0.7, 0.9, 0.12, 1.1, wood);
  // mast and boom in dark metal
  b.cylinder(0, 3.9, 0.9, 0.07, 0.09, 6.6, 6, dark);
  const boom = new GeoBuilder();
  boom.cylinder(0, 0, 0, 0.05, 0.05, 3.4, 6, dark);
  mergeGeo(b, boom, Mat4.compose(0, 1.45, -0.75, Math.PI / 2 - 0.12, 0, 0, 1, 1, 1));
  // the mainsail: a triangle from masthead to boom end, drawn on both
  // faces so it never vanishes when the wind of the camera changes side
  b.quad([0, 6.9, 0.9], [0, 1.5, 0.85], [0, 1.5, -2.35], [0, 1.5, -2.35], [1, 0, 0], sail, [0, 0, 1, 1]);
  b.quad([0, 6.9, 0.9], [0, 1.5, -2.35], [0, 1.5, 0.85], [0, 1.5, 0.85], [-1, 0, 0], sail, [0, 0, 1, 1]);
  // the jib, from the masthead down to the bow
  b.quad([0, 6.5, 0.9], [0, 1.2, 1.0], [0, 1.1, 3.9], [0, 1.1, 3.9], [1, 0, 0], sail, [0, 0, 1, 1]);
  b.quad([0, 6.5, 0.9], [0, 1.1, 3.9], [0, 1.2, 1.0], [0, 1.2, 1.0], [-1, 0, 0], sail, [0, 0, 1, 1]);
  // a lifebuoy ring on the cabin side, and the outboard at the stern
  b.cylinder(0.82, 1.25, -0.7, 0.3, 0.3, 0.12, 10, hexColor(0xe4572e));
  b.box(0, 0.75, -3.85, 0.5, 0.7, 0.25, dark);
  return b;
}

// A working fishing boat: lower, beamier, no sail — a wheelhouse, a
// working deck aft and crates of the morning catch.
function buildFishingBoat() {
  const b = new GeoBuilder();
  const hull = hexColor(0x457b9d);
  const white = hexColor(0xf2f0eb);
  const glass = hexColor(0x9fd8e8);
  const dark = hexColor(0x232a30);
  b.box(0, 0.5, 0, 2.9, 1.0, 8.2, hull);
  const bow = new GeoBuilder();
  bow.box(0, 0.5, 0, 2.0, 0.95, 2.0, hull);
  mergeGeo(b, bow, Mat4.compose(0, 0, 4.7, 0, Math.PI / 4, 0, 1, 1, 1));
  b.box(0, 1.05, 0.2, 2.5, 0.12, 7.4, hexColor(0x6b7c86)); // working deck
  b.box(0, 1.7, 2.2, 2.1, 1.3, 1.9, white); // wheelhouse
  b.box(0, 1.95, 2.2, 2.14, 0.55, 1.7, glass);
  b.box(0, 2.5, 2.2, 1.6, 0.28, 1.3, dark); // wheelhouse roof
  b.cylinder(0.6, 3.0, 1.6, 0.09, 0.09, 0.9, 6, dark); // exhaust stack
  b.cylinder(0, 2.2, -1.2, 0.06, 0.08, 3.2, 6, dark); // deck mast
  b.box(0, 2.6, -1.2, 2.6, 0.1, 0.1, dark); // gaff across it
  // crates of fish on the aft deck, iced pale
  b.box(-0.7, 1.35, -2.6, 1.1, 0.5, 1.4, hexColor(0xd9d2c0));
  b.box(0.75, 1.35, -2.9, 1.0, 0.5, 1.1, hexColor(0xbc4749));
  b.box(-0.2, 1.8, -2.7, 0.9, 0.4, 1.0, hexColor(0xe9c46a));
  return b;
}

// ------------------------------------------------------------ the harbour

export function buildMarina(gl, textures) {
  const rng = new Rng(1977);
  const group = new Obj();
  const colliders = [];
  const parkedSpots = [];
  const landmarks = {};

  const plain = new GeoBuilder();
  const wood = hexColor(0xa98f66);
  const woodDark = hexColor(0x7d6543);
  const water = hexColor(0x2e8fa8);
  const waterPale = hexColor(0x3fa7bd);
  const white = hexColor(0xf2f0eb);
  const darkMetal = hexColor(0x3c4147);

  // ---- the lagoon: harbour water painted into the east shore's sand,
  // with a paler heart where the basin shallows over clean sand
  groundQuad(plain, 260, -60, 294, 140, 0.03, water);
  groundQuad(plain, 264, -54, 290, 134, 0.045, waterPale);
  // a stone rim along the west bank so the water meets a hard edge
  plain.box(259.4, 0.22, 40, 1.2, 0.5, 208, hexColor(0x9b958a));

  // ---- the boardwalk: a plank deck the length of the west bank
  groundQuad(plain, 252, -64, 260, 144, 0.07, wood);
  for (let z = -62; z <= 142; z += 4) {
    groundQuad(plain, 252.2, z, 259.8, z + 0.22, 0.085, woodDark);
  }
  // mooring posts along the waterline, and lamps for the evening crowd
  for (let z = -56; z <= 136; z += 8) {
    plain.cylinder(259.6, 0.55, z, 0.14, 0.17, 1.1, 7, woodDark);
  }
  for (const lz of [-40, 20, 80, 130]) {
    plain.cylinder(253.2, 2.1, lz, 0.07, 0.1, 4.2, 6, darkMetal);
    plain.box(253.2, 4.35, lz, 0.55, 0.4, 0.55, hexColor(0xfff3b0));
  }

  // ---- finger piers jutting east, with a post at every corner
  for (const pz of [-30, 10, 50, 90]) {
    groundQuad(plain, 260, pz - 1.6, 278, pz + 1.6, 0.07, wood);
    for (const px of [262, 270, 277.4]) {
      for (const s of [-1, 1]) {
        plain.cylinder(px, 0.4, pz + s * 1.5, 0.13, 0.16, 0.9, 7, woodDark);
      }
    }
  }

  // ---- the fleet: sailboats on the bank and at the piers, one fishing
  // boat riding lower and heavier in the south basin
  const berths = [
    { boat: buildBoat(0xbc4749, 0xf2f0eb), x: 267, z: -44, ry: 0, s: 1 },
    { boat: buildBoat(0x457b9d, 0xe9c46a), x: 267, z: 24, ry: Math.PI, s: 1 },
    { boat: buildBoat(0x606c38, 0xf2f0eb), x: 267, z: 66, ry: 0, s: 0.92 },
    { boat: buildBoat(0xe9c46a, 0xbc4749), x: 271, z: -21, ry: Math.PI / 2, s: 1 },
    { boat: buildBoat(0xf2f0eb, 0x457b9d), x: 271, z: 59, ry: -Math.PI / 2, s: 0.95 },
    { boat: buildFishingBoat(), x: 279, z: 106, ry: 0.15, s: 1.1 },
  ];
  for (const berth of berths) {
    mergeGeo(plain, berth.boat, Mat4.compose(berth.x, 0.1, berth.z, 0, berth.ry, 0, berth.s, berth.s, berth.s));
  }
  // the whole basin is one collider: nobody drives a car into the harbour
  colliders.push({ minX: 259.5, maxX: 295, minZ: -64, maxZ: 144 });

  // ---- the fish market: three stalls under striped canopies at the
  // boardwalk's south end, counters heaped with the catch
  const stallCols = [0xbc4749, 0x457b9d, 0xe9c46a];
  for (let i = 0; i < 3; i++) {
    const sz = 106 + i * 11;
    const col = hexColor(stallCols[i]);
    for (const sx of [-1.7, 1.7]) {
      for (const szz of [-1.4, 1.4]) {
        plain.cylinder(255.5 + sx, 1.3, sz + szz, 0.07, 0.07, 2.6, 6, woodDark);
      }
    }
    // canopy: five slats alternating the stall colour and white
    for (let sIdx = 0; sIdx < 5; sIdx++) {
      plain.box(255.5, 2.75, sz - 1.7 + sIdx * 0.85, 4.4, 0.09, 0.8,
        sIdx % 2 ? white : col);
    }
    plain.box(255.5, 1.0, sz, 3.6, 0.85, 1.5, wood); // counter
    plain.box(255.5, 1.55, sz, 3.2, 0.25, 1.2, hexColor(0xd9d2c0)); // ice bed
    for (let c = 0; c < 3; c++) {
      plain.box(254.4 + c * 1.1, 1.78, sz + rng.range(-0.3, 0.3), 0.8, 0.22, 0.55,
        hexColor(rng.pick([0x9fd8e8, 0xe4572e, 0x51e07a])));
    }
    colliders.push({ minX: 253.4, maxX: 257.6, minZ: sz - 2, maxZ: sz + 2 });
  }
  // the market sign, painted board on two posts at the boardwalk's end
  plain.cylinder(250.5, 1.5, 98, 0.09, 0.11, 3, 6, woodDark);
  plain.cylinder(257.5, 1.5, 98, 0.09, 0.11, 3, 6, woodDark);
  plain.box(254, 3.1, 98, 7.6, 1.1, 0.18, hexColor(0x2a6f77));
  plain.box(254, 3.1, 97.88, 7.0, 0.6, 0.06, hexColor(0xe9c46a));

  // harbour clutter: crates, coiled rope, folded nets along the deck
  const crateCols = [0xb08968, 0x457b9d, 0xbc4749, 0x606c38];
  for (let i = 0; i < 7; i++) {
    const px = 254 + rng.range(-1.2, 3.4), pz = -52 + i * 15 + rng.range(-4, 4);
    const s = rng.range(1.1, 1.9);
    plain.box(px, s / 2 + 0.07, pz, s, s, s, hexColor(rng.pick(crateCols)));
  }
  for (const [rx, rz] of [[256.5, -8], [256.8, 38], [257, 76], [256.4, 122]]) {
    plain.cylinder(rx, 0.16, rz, 0.55, 0.62, 0.22, 10, hexColor(0xc9a86a));
    plain.box(rx + 1.4, 0.14, rz + 0.6, 1.6, 0.16, 1.2, hexColor(0x39543f));
  }

  // ---- the dock crane at the end of the third pier: a post, a jib
  // leaned out over the water, and a crate of something heavy hanging
  // at the end of its cable, halfway to the fishing boat's deck
  {
    const cx = 276.5, cz = 90;
    plain.cylinder(cx, 2.2, cz, 0.22, 0.3, 4.4, 8, hexColor(0x8a4b2a));
    const jib = new GeoBuilder();
    jib.box(0, 0, 0, 0.3, 0.3, 6.4, hexColor(0x8a4b2a));
    mergeGeo(plain, jib, Mat4.compose(cx + 1.4, 4.9, cz, 0, Math.PI / 2, 0.5, 1, 1, 1));
    plain.box(cx + 3.6, 3.4, cz, 0.05, 2.6, 0.05, darkMetal); // the cable
    plain.box(cx + 3.6, 1.9, cz, 1.5, 1.1, 1.5, hexColor(0xb08968)); // the load
    plain.box(cx - 1.2, 4.1, cz, 0.9, 0.8, 0.9, darkMetal); // counterweight
    colliders.push({ minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - 0.5, maxZ: cz + 0.5 });
  }

  // lobster pots waiting for the evening tide: tapered cylinders of
  // slatted wood, stacked in threes by the market and the north pier
  for (const [px, pz] of [[253.6, 100], [257.2, 84], [254.8, -36]]) {
    for (let i = 0; i < 3; i++) {
      plain.cylinder(px + (i === 2 ? 0.3 : 0), 0.28 + (i === 2 ? 0.56 : i * 0.28), pz + (i === 1 ? 0.4 : 0),
        0.42, 0.55, 0.5, 8, hexColor(i % 2 ? 0x9a7d52 : 0x7d6543));
    }
    plain.cylinder(px, 1.05, pz, 0.09, 0.09, 0.35, 6, hexColor(0xe4572e)); // the pot buoy
  }

  landmarks.marina = { x: 250, z: 40, name: 'Solana Marina' };
  landmarks.fishmarket = { x: 250, z: 116, name: 'Marina Fish Market' };

  // shore parking west of the boardwalk, facing the water
  parkedSpots.push(
    { x: 244, z: -44, heading: Math.PI / 2 },
    { x: 244, z: 124, heading: -Math.PI / 2 },
  );
  // walkers circle the boardwalk and the market square
  const sidewalkLoops = [
    { cx: 240, cz: 40, half: 16 },
    { cx: 244, cz: 112, half: 10 },
  ];

  // ---- bake the merged mesh
  if (plain.idx.length > 0) {
    group.add(new Obj(plain.build(gl), { texture: null }));
  }

  // ---- two channel buoys ride the swell at the basin's mouths
  const buoyGeo = (hex) => {
    const b = new GeoBuilder();
    b.cylinder(0, 0.1, 0, 0.5, 0.75, 0.7, 9, hexColor(hex));
    b.cylinder(0, 0.75, 0, 0.09, 0.09, 0.7, 6, darkMetal);
    b.box(0, 1.2, 0, 0.34, 0.24, 0.34, hexColor(hex));
    return b.build(gl);
  };
  const buoyA = new Obj(buoyGeo(0xe4572e));
  buoyA.pos = [286, 0, -50];
  group.add(buoyA);
  const buoyB = new Obj(buoyGeo(0x51e07a));
  buoyB.pos = [286, 0, 130];
  group.add(buoyB);

  return {
    group,
    colliders,
    landmarks,
    parkedSpots,
    sidewalkLoops,
    update(now) {
      buoyA.pos[1] = Math.sin(now * 1.3) * 0.16;
      buoyA.rot[2] = Math.sin(now * 0.9) * 0.08;
      buoyB.pos[1] = Math.sin(now * 1.3 + 2.1) * 0.16;
      buoyB.rot[0] = Math.cos(now * 0.8) * 0.08;
    },
  };
}
