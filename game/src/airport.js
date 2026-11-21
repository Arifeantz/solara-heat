// airport.js — Solana Airfield and the north-shore ground that holds it.
//
// The city generator stops at the avenue grid; the island's north shore was
// empty sand. This module builds the airfield on it: a full-length runway
// with markings and edge lights, a taxiway and apron, a passenger terminal
// with a control tower (its radar bar turns, its beacon blinks), two
// hangars, a fuel farm, a helipad, and two parked aircraft — a twin-engine
// jet in Solara livery and a little high-wing prop plane by the hangars.
//
// Like the city, almost everything is baked into merged meshes (one per
// texture) at build time. What the other systems need is handed back in the
// same shape the city returns: colliders, landmarks, parked-car spots and
// sidewalk loops, ready to be merged into the world in main.js.

import { GeoBuilder, Obj, Mat4, hexColor } from './engine.js';
import { Rng } from './random.js';

// ------------------------------------------------------------ geo helpers

// Copy one builder's geometry into another under a matrix. The city bakes
// its palms the same way; aircraft and carts here are built at the origin
// and merged into the world at their parking spots. Exported because the
// marina module bakes its boats exactly the same way.
export function mergeGeo(dst, src, matrix) {
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
    dst.uv.push(src.uv[i / 3 * 2] || 0, src.uv[i / 3 * 2 + 1] || 0);
  }
  for (const ix of src.idx) dst.idx.push(ix + base);
  dst.base += src.pos.length / 3;
}

// Four facade-textured walls and a flat roof for a building centred at
// (cx, cz); uv is scaled so the painted windows stay one size on any wall.
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
  const roof = [tint[0] * 0.55, tint[1] * 0.52, tint[2] * 0.5];
  b.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], roof, [0, 0, 1, 1]);
}

// A flat ground quad in the plain builder, corners (x0, z0)-(x1, z1) at y.
function groundQuad(b, x0, z0, x1, z1, y, color) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color, [0, 0, 1, 1]);
}

// A cylinder laid on its side, its axis along X, merged into b.
function tubeX(b, cx, cy, cz, r, len, color, seg = 14) {
  const t = new GeoBuilder();
  t.cylinder(0, 0, 0, r, r, len, seg, color);
  mergeGeo(b, t, Mat4.compose(cx, cy, cz, 0, 0, Math.PI / 2, 1, 1, 1));
}

// A cone lying on its side: with pointEast its apex aims at +X (a nose),
// otherwise at -X (a tail cone).
function coneX(b, cx, cy, cz, r, len, color, pointEast) {
  const t = new GeoBuilder();
  t.cone(0, 0, 0, r, len, 14, color);
  mergeGeo(b, t, Mat4.compose(cx, cy, cz, 0, 0, pointEast ? -Math.PI / 2 : Math.PI / 2, 1, 1, 1));
}

// ------------------------------------------------------------ aircraft

// The Solara Air jet: a white twin-engine airliner, nose toward +X, built
// at the origin so it can be merged anywhere. About 34 m nose to tail.
function buildJet() {
  const b = new GeoBuilder();
  const white = hexColor(0xf4f6f7);
  const teal = hexColor(0x0e7c86);
  const orange = hexColor(0xff7847);
  const grey = hexColor(0xb9c0c4);
  const dark = hexColor(0x232a30);
  const glass = hexColor(0x1d2f3a);
  // fuselage: a long tube, a rounded nose, a tapering tail
  tubeX(b, 0, 3.1, 0, 2.3, 27, white, 16);
  coneX(b, 15.3, 3.1, 0, 2.3, 3.6, white, true);
  coneX(b, -15.3, 3.1, 0, 2.3, 3.6, white, false);
  // livery: a teal band at the tail, an orange band behind the wing
  tubeX(b, -10.5, 3.1, 0, 2.34, 3.4, teal, 16);
  tubeX(b, 9.8, 3.1, 0, 2.34, 1.1, orange, 16);
  // cockpit glass wrapped over the nose
  b.box(14.1, 4.75, 0, 2.8, 0.95, 3.1, glass);
  // the wing: low, slight and wide, with upturned tips
  b.box(-0.5, 2.1, 0, 5.4, 0.32, 21, grey);
  b.box(-0.9, 2.9, -10.4, 2.4, 1.7, 0.28, teal);
  b.box(-0.9, 2.9, 10.4, 2.4, 1.7, 0.28, teal);
  // engines slung under the wing, dark mouths facing the nose
  for (const s of [-1, 1]) {
    tubeX(b, 1.0, 1.45, s * 4.6, 0.95, 3.9, grey, 12);
    tubeX(b, 3.0, 1.45, s * 4.6, 0.8, 0.35, dark, 12);
    tubeX(b, -1.1, 1.45, s * 4.6, 0.7, 0.3, dark, 12);
  }
  // tail: a tall teal fin with an orange tip, and the rear stabilisers
  b.box(-14.6, 6.3, 0, 4.4, 4.4, 0.35, teal);
  b.box(-14.9, 8.55, 0, 3.4, 0.55, 0.42, orange);
  b.box(-15.2, 4.7, 0, 3.0, 0.3, 9.6, grey);
  // landing gear: three legs and their wheels, down and locked
  const leg = hexColor(0x8f979c);
  b.cylinder(12.8, 0.55, 0, 0.15, 0.15, 1.1, 6, leg);
  b.box(12.8, 0.28, 0, 0.55, 0.55, 0.3, dark);
  for (const s of [-1, 1]) {
    b.cylinder(-0.5, 0.55, s * 1.7, 0.17, 0.17, 1.1, 6, leg);
    b.box(-0.5, 0.3, s * 1.7, 0.6, 0.6, 0.35, dark);
  }
  return b;
}

// The flight-school prop plane: a cheerful high-wing single, nose to +X.
function buildPropPlane() {
  const b = new GeoBuilder();
  const yellow = hexColor(0xf2c230);
  const red = hexColor(0xc23b2e);
  const dark = hexColor(0x232a30);
  const glass = hexColor(0x1d2f3a);
  const grey = hexColor(0x9aa0a4);
  tubeX(b, 0, 1.6, 0, 1.05, 8.6, yellow, 12);
  coneX(b, 5.0, 1.6, 0, 1.05, 1.5, yellow, true);
  coneX(b, -4.9, 1.6, 0, 1.0, 1.3, yellow, false);
  // the propeller: two blades crossed on a spinner, frozen mid-turn
  b.box(6.0, 1.6, 0, 0.14, 3.5, 0.3, dark);
  b.box(6.0, 1.6, 0, 0.14, 0.3, 3.5, dark);
  coneX(b, 6.1, 1.6, 0, 0.32, 0.8, red, true);
  // cabin glass and the high wing it sits under
  b.box(0.7, 2.3, 0, 2.7, 0.75, 1.7, glass);
  b.box(-0.3, 2.95, 0, 3.4, 0.22, 11.6, red);
  for (const s of [-1, 1]) b.box(-0.3, 2.25, s * 1.15, 0.14, 1.2, 0.14, grey);
  // tail feathers in red
  b.box(-4.7, 2.65, 0, 1.9, 1.9, 0.24, red);
  b.box(-4.8, 1.95, 0, 1.7, 0.2, 4.8, red);
  // fixed gear: two legs, two wheels, one little tail wheel
  for (const s of [-1, 1]) {
    b.cylinder(1.1, 0.6, s * 1.05, 0.09, 0.09, 1.2, 5, grey);
    b.box(1.1, 0.32, s * 1.05, 0.62, 0.62, 0.3, dark);
  }
  b.box(-4.3, 0.3, 0, 0.4, 0.4, 0.22, dark);
  return b;
}

// A luggage cart: flat bed, four small wheels, a tow handle, suitcases.
function buildCart() {
  const b = new GeoBuilder();
  const frame = hexColor(0x707880);
  b.box(0, 0.55, 0, 2.3, 0.14, 1.15, frame);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.cylinder(sx * 0.9, 0.22, sz * 0.5, 0.2, 0.2, 0.12, 8, hexColor(0x232a30));
    }
  }
  b.box(1.45, 0.45, 0, 0.7, 0.09, 0.09, frame);
  b.box(-0.4, 0.95, -0.2, 0.9, 0.65, 0.6, hexColor(0xbc4749));
  b.box(0.45, 0.9, 0.25, 0.7, 0.55, 0.5, hexColor(0x457b9d));
  b.box(-0.35, 1.5, -0.2, 0.6, 0.45, 0.45, hexColor(0xe9c46a));
  return b;
}

// A fuel truck: cab at the front, a long tank cylinder behind it, a pump
// cabinet at the tail. Built at the origin, nose towards +Z.
function buildServiceTruck() {
  const b = new GeoBuilder();
  const white = hexColor(0xf2f0eb);
  const orange = hexColor(0xe4572e);
  const silver = hexColor(0xc8ced2);
  const glass = hexColor(0x9fd8e8);
  const dark = hexColor(0x232a30);
  b.box(0, 0.55, 0, 2.0, 0.5, 5.8, dark); // chassis rail
  b.box(0, 1.15, 2.15, 1.9, 1.1, 1.5, white); // cab
  b.box(0, 1.35, 2.62, 1.7, 0.5, 0.14, glass); // windshield
  b.box(0, 0.9, 2.93, 1.8, 0.3, 0.08, orange); // nose stripe
  tubeX(b, 0, 1.3, -0.9, 0.78, 3.6, silver); // the tank, axis across
  b.box(0, 1.3, -0.9, 1.62, 0.22, 3.2, orange); // tank stripe
  b.box(0, 2.16, -0.9, 0.5, 0.14, 2.6, silver); // walkway on top
  b.box(-0.85, 0.85, -2.7, 0.35, 0.7, 0.5, hexColor(0x707880)); // pump box
  for (const sx of [-1, 1]) {
    for (const sz of [1.9, -1.9]) tubeX(b, sx * 0.95, 0.42, sz, 0.42, 0.26, dark);
  }
  return b;
}

// A follow-me car: small, yellow, with a chequered light bar the tower can
// see from anywhere on the field.
function buildFollowMe() {
  const b = new GeoBuilder();
  const yellow = hexColor(0xf7c948);
  const glass = hexColor(0x9fd8e8);
  const dark = hexColor(0x232a30);
  const orange = hexColor(0xe4572e);
  b.box(0, 0.6, 0, 1.8, 0.6, 3.7, yellow);
  b.box(0, 1.1, -0.2, 1.6, 0.42, 2.0, glass);
  b.box(0, 1.36, -0.2, 1.5, 0.1, 1.2, dark); // light bar base
  for (let i = 0; i < 4; i++) {
    b.box(-0.56 + i * 0.375, 1.44, -0.2, 0.32, 0.1, 1.0, i % 2 ? dark : orange);
  }
  b.box(0, 0.62, 1.88, 1.7, 0.34, 0.08, dark); // bumpers
  b.box(0, 0.62, -1.88, 1.7, 0.34, 0.08, dark);
  for (const sx of [-1, 1]) {
    for (const sz of [1.25, -1.25]) tubeX(b, sx * 0.85, 0.36, sz, 0.36, 0.24, dark);
  }
  return b;
}

// ------------------------------------------------------------ the airfield

export function buildAirport(gl, textures) {
  const rng = new Rng(1958);
  const group = new Obj();
  const colliders = [];
  const parkedSpots = [];
  const landmarks = {};

  const asphalt = new GeoBuilder();
  const plain = new GeoBuilder();
  const facade = new GeoBuilder();

  const grass = hexColor(0x74ad58);
  const concrete = hexColor(0xcac2b2);
  const concreteDark = hexColor(0xb3ab99);
  const white = hexColor(0xf2f0eb);
  const yellow = hexColor(0xf7c948);
  const lampPale = hexColor(0xfff3b0);
  const lightGreen = hexColor(0x51e07a);
  const darkMetal = hexColor(0x3c4147);

  // ---- ground: a grass field over the north shore's sand
  groundQuad(plain, -248, -298, 248, -216, 0.015, grass);
  // apron in front of the terminal, forecourt slab on its landside
  groundQuad(plain, -30, -258, 190, -238, 0.028, concrete);
  groundQuad(plain, 28, -238, 132, -212, 0.022, concrete);
  // hangar aprons to the west
  groundQuad(plain, -162, -248, -42, -212, 0.02, concreteDark);

  // ---- the runway: 470 m of asphalt, threshold to threshold
  asphalt.quad([-235, 0.03, -270], [235, 0.03, -270], [235, 0.03, -290], [-235, 0.03, -290], [0, 1, 0], [1, 1, 1], [0, 0, 47, 2]);
  // the taxiway, parallel, tied to the apron by two short links
  asphalt.quad([-235, 0.03, -258], [235, 0.03, -258], [235, 0.03, -266], [-235, 0.03, -266], [0, 1, 0], [1, 1, 1], [0, 0, 47, 1]);
  asphalt.quad([76, 0.032, -238], [84, 0.032, -238], [84, 0.032, -258], [76, 0.032, -258], [0, 1, 0], [1, 1, 1], [0, 0, 1, 2]);
  asphalt.quad([-104, 0.032, -248], [-96, 0.032, -248], [-96, 0.032, -258], [-104, 0.032, -258], [0, 1, 0], [1, 1, 1], [0, 0, 1, 1]);
  // centreline dashes, white on the runway and yellow on the taxiway
  for (let x = -224; x <= 224; x += 20) {
    groundQuad(plain, x, -280.3, x + 8, -279.7, 0.045, white);
  }
  for (let x = -228; x <= 228; x += 16) {
    groundQuad(plain, x, -262.2, x + 7, -261.8, 0.045, yellow);
  }
  // threshold bars at both ends
  for (const s of [-1, 1]) {
    for (const dz of [-6.4, -2.2, 2.2, 6.4]) {
      groundQuad(plain, s * 226 - 3, -280 + dz - 0.55, s * 226 + 3, -280 + dz + 0.55, 0.045, white);
    }
  }
  // edge lights down both sides, green threshold lights across the ends,
  // and the approach rows walking out over the shore
  for (let x = -224; x <= 224; x += 32) {
    plain.box(x, 0.3, -291.6, 0.42, 0.6, 0.42, lampPale);
    plain.box(x, 0.3, -268.4, 0.42, 0.6, 0.42, lampPale);
  }
  for (const s of [-1, 1]) {
    for (const dz of [-6, -2, 2, 6]) {
      plain.box(s * 233, 0.3, -280 + dz, 0.5, 0.6, 0.5, lightGreen);
    }
    for (let i = 1; i <= 3; i++) {
      plain.box(s * (240 + i * 9), 0.3, -280, 0.5, 0.6, 0.5, lightGreen);
    }
  }

  // ---- the terminal: a long low hall facing the apron
  {
    const cx = 80, cz = -230;
    walls(facade, cx, cz, 70, 14, 10, hexColor(0xf7e3c2));
    // a band of dark glass along the airside face, and the roof sign board
    plain.box(cx, 5.6, cz - 7.15, 58, 4.4, 0.3, hexColor(0x2c4048));
    plain.box(cx, 11.2, cz - 6.6, 36, 2.4, 0.8, hexColor(0xe4572e));
    plain.box(cx, 11.2, cz - 7.05, 36, 0.7, 0.1, white);
    // entrance canopy on the landside, held up by four slim posts
    plain.box(cx, 3.6, cz + 9.5, 30, 0.35, 5, hexColor(0x0e7c86));
    for (const sx of [-13, 13]) {
      for (const sz of [7.4, 11.6]) {
        plain.cylinder(cx + sx, 1.7, cz + sz, 0.14, 0.14, 3.4, 6, darkMetal);
      }
    }
    colliders.push({ minX: cx - 35, maxX: cx + 35, minZ: cz - 7, maxZ: cz + 7 });
    landmarks.airport = { x: cx, z: cz + 14, name: 'Solana Airfield' };
  }

  // ---- the control tower, east of the terminal
  {
    const cx = 140, cz = -230;
    plain.cylinder(cx, 10, cz, 2.1, 2.7, 20, 10, hexColor(0xe8e2d4));
    plain.cylinder(cx, 15, cz, 2.45, 2.45, 1.1, 10, hexColor(0xd64545));
    plain.cylinder(cx, 21.5, cz, 3.5, 3.5, 3, 10, hexColor(0x2c4048));
    plain.cone(cx, 24.2, cz, 3.9, 2.4, 10, hexColor(0x27313a));
    plain.cylinder(cx, 25.6, cz, 0.09, 0.09, 1.8, 5, darkMetal);
    colliders.push({ minX: cx - 3, maxX: cx + 3, minZ: cz - 3, maxZ: cz + 3 });
    landmarks.tower = { x: cx - 8, z: cz + 10, name: 'Airfield Tower' };
  }

  // ---- two hangars west of the terminal, doors to the aprons
  const hangarAt = (cx, cz, w, tintHex) => {
    walls(facade, cx, cz, w, 20, 9, hexColor(tintHex));
    plain.box(cx, 3.1, cz + 10.15, w * 0.62, 6.2, 0.3, hexColor(0x22262b));
    plain.box(cx, 6.6, cz + 10.15, w * 0.62, 0.5, 0.32, hexColor(0xf7c948));
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - 10, maxZ: cz + 10 });
  };
  hangarAt(-70, -234, 44, 0xd8dee2);
  hangarAt(-138, -234, 34, 0xc9b18c);
  landmarks.hangar = { x: -70, z: -214, name: 'Airfield Cargo Hangar' };
  landmarks.runwayEnd = { x: -218, z: -280, name: 'Runway West Marker' };

  // ---- the fuel farm: two horizontal tanks and a drum cluster
  {
    const fuel = new GeoBuilder();
    tubeX(fuel, -196, 1.9, -246, 1.7, 7.5, hexColor(0xe8e2d4), 12);
    tubeX(fuel, -196, 1.9, -241.5, 1.7, 7.5, hexColor(0xe8e2d4), 12);
    tubeX(fuel, -196, 1.9, -246, 1.76, 1.2, hexColor(0xd64545), 12);
    for (const sx of [-3, 3]) {
      for (const sz of [-2.2, 2.2]) {
        fuel.box(-196 + sx, 0.5, -243.7 + sz, 0.5, 1.0, 0.5, darkMetal);
      }
    }
    mergeGeo(plain, fuel, Mat4.identity());
    const drumCols = [0xd64545, 0x457b9d, 0xe9c46a, 0x606c38];
    for (let i = 0; i < 9; i++) {
      const dx = -186 + (i % 3) * 1.1, dz = -250 + Math.floor(i / 3) * 1.1;
      plain.cylinder(dx, 0.48, dz, 0.34, 0.34, 0.95, 8, hexColor(drumCols[i % 4]));
    }
    colliders.push({ minX: -203, maxX: -189, minZ: -251, maxZ: -237 });
  }

  // ---- the helipad, east past the tower: a pale disc and a bold H
  {
    plain.cylinder(196, 0.06, -246, 7, 7, 0.12, 20, hexColor(0xd9d2c0));
    plain.box(194.9, 0.16, -246, 0.8, 0.06, 3.6, white);
    plain.box(197.1, 0.16, -246, 0.8, 0.06, 3.6, white);
    plain.box(196, 0.16, -246, 1.4, 0.06, 0.8, white);
    landmarks.helipad = { x: 196, z: -234, name: 'Airfield Helipad' };
  }

  // ---- aircraft on the ground: the jet at its gate, the prop plane west
  mergeGeo(plain, buildJet(), Mat4.compose(28, 0, -247, 0, 0, 0, 1, 1, 1));
  colliders.push({ minX: 11, maxX: 45, minZ: -257, maxZ: -237 });
  mergeGeo(plain, buildPropPlane(), Mat4.compose(-102, 0, -250, 0, Math.PI, 0, 1, 1, 1));
  colliders.push({ minX: -109, maxX: -95, minZ: -256, maxZ: -244 });

  // airstairs rolled up to the jet's forward door, and two luggage carts
  for (let i = 0; i < 5; i++) {
    plain.box(38.5, 0.35 + i * 0.44, -254.6 + i * 0.62, 2.3, 0.28, 0.66, hexColor(0xc8ced2));
  }
  plain.box(37.2, 1.2, -252.4, 0.12, 2.4, 0.12, darkMetal);
  plain.box(39.8, 1.2, -252.4, 0.12, 2.4, 0.12, darkMetal);
  mergeGeo(plain, buildCart(), Mat4.compose(58, 0, -243, 0, 0.5, 0, 1, 1, 1));
  mergeGeo(plain, buildCart(), Mat4.compose(97, 0, -244, 0, -0.4, 0, 1, 1, 1));
  // a baggage train of three more carts coupled behind the jet's tail
  mergeGeo(plain, buildCart(), Mat4.compose(2, 0, -254, 0, 0.12, 0, 1, 1, 1));
  mergeGeo(plain, buildCart(), Mat4.compose(5.6, 0, -254.5, 0, -0.05, 0, 1, 1, 1));
  mergeGeo(plain, buildCart(), Mat4.compose(9.2, 0, -254.1, 0, 0.08, 0, 1, 1, 1));

  // ground crew hardware: the fuel truck waits by the jet's wing, the
  // follow-me car sits ready on the apron, angled for a quick start
  mergeGeo(plain, buildServiceTruck(), Mat4.compose(54, 0, -253, 0, 1.2, 0, 1, 1, 1));
  colliders.push({ minX: 51, maxX: 57, minZ: -256, maxZ: -250 });
  mergeGeo(plain, buildFollowMe(), Mat4.compose(152, 0, -245, 0, -0.7, 0, 1, 1, 1));
  colliders.push({ minX: 150, maxX: 154.5, minZ: -247, maxZ: -243 });

  // PAPI lights beside each touchdown zone: four boxes a pilot reads as
  // red-over-white on the glide path, baked here as alternating colours
  for (const endX of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      plain.box(endX * (220 + i * 2.1), 0.45, -294.5, 1.1, 0.7, 0.8,
        i % 2 ? hexColor(0xff5040) : white);
    }
  }
  // runway guard lights where the taxiway links meet the strip
  for (const gx of [74, 86, -106, -94]) {
    plain.box(gx, 0.4, -268.8, 0.55, 0.55, 0.55, yellow);
  }
  // the ILS localizer array beyond the east threshold, and its hut
  plain.box(252, 0.45, -280, 0.5, 0.35, 15, darkMetal);
  for (let i = 0; i < 6; i++) {
    plain.box(252, 1.5, -286.5 + i * 2.6, 0.18, 2.4, 0.3, hexColor(0xe8e4da));
  }
  plain.box(246, 1.3, -268, 3.4, 2.6, 2.8, hexColor(0xd9d2c0));
  plain.box(246, 2.75, -268, 3.8, 0.3, 3.2, hexColor(0x8a4b2a));
  colliders.push({ minX: 244, maxX: 248, minZ: -270, maxZ: -266 });

  // a weather mast west of the hangars: pole, crossarms, little cups
  plain.cylinder(-215, 4, -255, 0.09, 0.13, 8, 6, darkMetal);
  plain.box(-215, 7.6, -255, 2.4, 0.14, 0.14, darkMetal);
  plain.box(-215, 6.6, -255, 0.14, 0.14, 1.8, darkMetal);
  for (const sx of [-1, 1]) plain.box(-215 + sx * 1.2, 7.9, -255, 0.34, 0.3, 0.34, white);

  // a lead-in line of traffic cones across the apron's working edge
  for (let i = 0; i < 6; i++) {
    plain.cone(70 + i * 3.2, 0.5, -256.5, 0.34, 1.0, 10, hexColor(0xe4572e));
  }
  // the fire point by the tower: a red cabinet that hopes to stay shut
  plain.box(131, 0.9, -221, 2.2, 1.8, 0.7, hexColor(0xc22e2e));
  plain.box(131, 1.95, -221, 2.4, 0.25, 0.85, white);

  // cargo waiting by the hangar doors: pallets, crates, a tarped stack
  const crateCols = [0xb08968, 0x457b9d, 0xbc4749, 0x606c38];
  for (let i = 0; i < 8; i++) {
    const px = -64 + rng.range(-4, 14), pz = -217 + rng.range(-3, 3);
    const s = rng.range(2.2, 3.4);
    plain.box(px, s / 2, pz, s, s, s, hexColor(rng.pick(crateCols)));
    if (rng.chance(0.45)) plain.box(px, s + s * 0.28, pz, s * 0.75, s * 0.55, s * 0.75, hexColor(rng.pick(crateCols)));
  }
  plain.box(-52, 1.1, -215, 5, 2.2, 3.4, hexColor(0x4a6741));

  // the windsock by the taxiway, pointing down the prevailing wind
  plain.cylinder(215, 2.75, -262, 0.07, 0.1, 5.5, 6, darkMetal);
  coneX(plain, 216.2, 5.3, -262, 0.55, 2.6, hexColor(0xff7847), true);

  // orange-and-white blast boards along the apron's south edge
  for (let x = -20; x <= 180; x += 25) {
    plain.box(x, 0.8, -237.2, 6, 1.6, 0.25, hexColor(0xe4572e));
    plain.box(x, 0.8, -237.36, 6, 0.5, 0.1, white);
  }

  // parking: a row on the terminal forecourt, one by the hangar, one tower
  parkedSpots.push(
    { x: 48, z: -218, heading: Math.PI },
    { x: 64, z: -218, heading: Math.PI },
    { x: 98, z: -218, heading: Math.PI },
    { x: -100, z: -216, heading: 0 },
    { x: 128, z: -216, heading: 0 },
  );

  // pedestrians stroll the terminal forecourt and the hangar apron
  const sidewalkLoops = [
    { cx: 80, cz: -205, half: 12 },
    { cx: -108, cz: -210, half: 12 },
  ];

  // ---- bake the merged meshes
  const addBaked = (builder, texture) => {
    if (builder.idx.length === 0) return;
    group.add(new Obj(builder.build(gl), { texture: texture || null }));
  };
  addBaked(asphalt, textures.asphalt);
  addBaked(facade, textures.facade);
  addBaked(plain, null);

  // ---- the two living details: a turning radar bar, a blinking beacon
  const radar = new Obj(new GeoBuilder().box(0, 0, 0, 7, 0.35, 0.9, hexColor(0xe8e4da)).build(gl));
  radar.pos = [140, 25.9, -230];
  group.add(radar);
  const beacon = new Obj(new GeoBuilder().box(0, 0, 0, 0.7, 0.5, 0.7, hexColor(0xff4444)).build(gl), { emissive: 1.2 });
  beacon.pos = [140, 26.9, -230];
  group.add(beacon);

  return {
    group,
    colliders,
    landmarks,
    parkedSpots,
    sidewalkLoops,
    update(now) {
      radar.rot[1] = now * 0.9;
      beacon.visible = now % 1.8 < 1.0;
    },
  };
}
