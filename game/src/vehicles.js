// vehicles.js — every car in Port Solana: how it looks, how traffic drives,
// and the arcade physics the player feels when they take the wheel.
//
// Cars are built from boxes by the geometry builder (body, glass cabin,
// wheels, lights). Traffic follows the avenue grid in right-hand lanes,
// braking for whatever is ahead. The player's car uses a simple speed and
// steering model with building and car collisions reported back as events,
// which is how the wanted system hears about the player's driving.

import { GeoBuilder, Obj, hexColor } from './engine.js';
import { GRID_LINES, collideBuildings } from './city.js';
import { Rng, clamp, angleDelta, dist2d } from './random.js';

export const LANE_OFFSET = 3.3;

export const CAR_TYPES = {
  sedan: { length: 4.4, width: 1.9, bodyH: 0.62, cabinH: 0.52, maxSpeed: 31, accel: 13, name: 'Meridian Sedan' },
  hatch: { length: 3.9, width: 1.8, bodyH: 0.66, cabinH: 0.56, maxSpeed: 28, accel: 12, name: 'Pico Hatch' },
  sport: { length: 4.6, width: 1.95, bodyH: 0.5, cabinH: 0.4, maxSpeed: 40, accel: 18, name: 'Vandal GT' },
  van: { length: 5.0, width: 2.0, bodyH: 1.15, cabinH: 0.5, maxSpeed: 24, accel: 9, name: 'Hauler Van' },
  buggy: { length: 3.6, width: 1.85, bodyH: 0.5, cabinH: 0.42, maxSpeed: 34, accel: 16, name: 'Dune Buggy' },
  pickup: { length: 4.9, width: 1.95, bodyH: 0.72, cabinH: 0.58, maxSpeed: 28, accel: 12, name: 'Rancher Pickup' },
  taxi: { length: 4.4, width: 1.9, bodyH: 0.62, cabinH: 0.52, maxSpeed: 30, accel: 12, name: 'Solana Cab' },
  limo: { length: 6.6, width: 2.0, bodyH: 0.6, cabinH: 0.5, maxSpeed: 27, accel: 9.5, name: 'Regent Limo' },
};

const TRAFFIC_COLORS = [0xe8e3d8, 0xc0c6cc, 0x8fb8c9, 0xd97b6c, 0x7fae7a, 0xe3c878, 0x9a86c8, 0x565d66, 0xf2f0eb, 0x74a7a0];

function buildCarObject(gl, type, colorHex, isPolice) {
  const spec = CAR_TYPES[type];
  const b = new GeoBuilder();
  const body = isPolice ? hexColor(0xf2f3f5) : hexColor(colorHex);
  const dark = hexColor(0x1d2126);
  const glass = hexColor(0x2c4048);
  const L = spec.length, W = spec.width;
  const bodyY = 0.32 + spec.bodyH / 2;
  b.box(0, bodyY, 0, W, spec.bodyH, L, body); // main body
  b.box(0, bodyY + 0.06, L * 0.30, W * 0.94, spec.bodyH * 0.7, L * 0.3, body); // bonnet mass
  if (type === 'van') {
    b.box(0, bodyY + spec.bodyH / 2 + spec.cabinH / 2, -L * 0.08, W * 0.96, spec.cabinH + 0.5, L * 0.78, body);
    b.box(0, bodyY + spec.bodyH / 2 + 0.35, L * 0.36, W * 0.9, 0.5, 0.15, glass);
  } else if (type === 'buggy') {
    // an open beach buggy: no roof, no glass — two bucket seats, a roll
    // cage of thin tube, the engine out back where everyone can see it
    const seat = hexColor(0x8a3324);
    const cage = hexColor(0x2f353b);
    b.box(0, bodyY + 0.12, -L * 0.02, W * 0.78, 0.3, L * 0.42, dark); // seat base
    b.box(-W * 0.2, bodyY + 0.48, -L * 0.14, 0.44, 0.55, 0.42, seat); // seat backs
    b.box(W * 0.2, bodyY + 0.48, -L * 0.14, 0.44, 0.55, 0.42, seat);
    const cageBase = bodyY + spec.bodyH / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.box(sx * W * 0.38, cageBase + 0.42, sz * L * 0.21 - L * 0.03, 0.09, 0.88, 0.09, cage);
      }
      b.box(sx * W * 0.38, cageBase + 0.88, -L * 0.03, 0.09, 0.09, L * 0.5, cage); // side rails
    }
    b.box(0, cageBase + 0.88, L * 0.22 - L * 0.03, W * 0.8, 0.09, 0.09, cage); // front bar
    b.box(0, cageBase + 0.88, -L * 0.28 - L * 0.03, W * 0.8, 0.09, 0.09, cage); // rear bar
    // the exposed engine, with twin exhaust stacks poking up behind
    b.box(0, bodyY + 0.22, -L * 0.4, W * 0.58, 0.46, L * 0.2, dark);
    b.cylinder(-W * 0.18, bodyY + 0.62, -L * 0.46, 0.06, 0.06, 0.55, 6, hexColor(0x9aa0a4));
    b.cylinder(W * 0.18, bodyY + 0.62, -L * 0.46, 0.06, 0.06, 0.55, 6, hexColor(0x9aa0a4));
    // a light bar over the nose for night runs on the sand
    b.box(0, bodyY + 0.55, L * 0.47, W * 0.66, 0.13, 0.13, dark);
    for (const lx of [-0.25, 0, 0.25]) {
      b.box(lx * W, bodyY + 0.55, L * 0.48, 0.2, 0.11, 0.05, hexColor(0xfff2c0));
    }
  } else if (type === 'limo') {
    // the Regent: a sedan stretched past politeness — a long glasshouse
    // split by a body-colour pillar band where the partition sits, a
    // chrome waist strip, and a little flag mast on the front wing for
    // whoever is important enough to need one this week
    const cabBase = bodyY + spec.bodyH / 2;
    b.box(0, cabBase + spec.cabinH / 2 - 0.04, -L * 0.05, W * 0.84, spec.cabinH, L * 0.62, glass);
    b.box(0, cabBase + spec.cabinH - 0.06, -L * 0.05, W * 0.88, 0.09, L * 0.66, body); // the long roof
    b.box(0, cabBase + spec.cabinH / 2 - 0.04, -L * 0.05, W * 0.86, spec.cabinH, 0.34, body); // partition band
    b.box(0, bodyY + 0.1, 0, W * 1.01, 0.09, L * 0.96, hexColor(0xc8ced2)); // chrome waist
    b.cylinder(W * 0.42, bodyY + 0.62, L * 0.4, 0.025, 0.025, 0.62, 5, hexColor(0xc8ced2)); // flag mast
    b.box(W * 0.42, bodyY + 0.86, L * 0.4, 0.05, 0.2, 0.34, hexColor(0x0e7c86)); // the little flag
  } else if (type === 'pickup') {
    // a working pickup: a proper cab over the front third, then an open
    // bed with side walls and a tailgate — and the spare wheel riding in
    // the bed, because Solana roads eat tyres
    const cabBase = bodyY + spec.bodyH / 2;
    b.box(0, cabBase + spec.cabinH / 2 - 0.02, L * 0.24, W * 0.84, spec.cabinH, L * 0.34, glass);
    b.box(0, cabBase + spec.cabinH - 0.04, L * 0.24, W * 0.88, 0.09, L * 0.38, body); // cab roof
    b.box(0, cabBase + 0.1, L * 0.42, W * 0.88, spec.cabinH * 0.7, 0.1, body); // cab back panel
    // the bed: floor, two side walls, a tailgate, all at body height
    b.box(0, bodyY + 0.18, -L * 0.22, W * 0.92, 0.14, L * 0.5, dark); // bed floor
    b.box(-W * 0.44, bodyY + 0.32, -L * 0.22, 0.09, 0.42, L * 0.5, body); // side walls
    b.box(W * 0.44, bodyY + 0.32, -L * 0.22, 0.09, 0.42, L * 0.5, body);
    b.box(0, bodyY + 0.32, -L * 0.47, W * 0.92, 0.42, 0.09, body); // tailgate
    // the spare, lying flat in the bed on its rim
    b.cylinder(-W * 0.18, bodyY + 0.36, -L * 0.2, 0.4, 0.4, 0.24, 10, hexColor(0x17191c));
    b.cylinder(-W * 0.18, bodyY + 0.37, -L * 0.2, 0.2, 0.2, 0.26, 6, hexColor(0x9aa0a4));
    // a toolbox and a jerry can strapped behind the cab
    b.box(W * 0.22, bodyY + 0.42, -L * 0.06, 0.62, 0.34, 0.4, hexColor(0x9aa0a4));
    b.box(-W * 0.28, bodyY + 0.4, -L * 0.06, 0.3, 0.42, 0.24, hexColor(0xbc4749));
  } else {
    b.box(0, bodyY + spec.bodyH / 2 + spec.cabinH / 2 - 0.04, -L * 0.06, W * 0.82, spec.cabinH, L * 0.46, glass); // glasshouse
    b.box(0, bodyY + spec.bodyH / 2 + spec.cabinH - 0.06, -L * 0.06, W * 0.86, 0.09, L * 0.5, body); // roof
  }
  if (type === 'sport') {
    b.box(0, bodyY + spec.bodyH - 0.02, -L * 0.47, W * 0.9, 0.09, 0.4, dark); // spoiler
    b.box(0, bodyY + 0.1, L * 0.5, W * 0.8, 0.22, 0.1, dark); // splitter
  }
  if (type === 'taxi') {
    b.box(0, bodyY + spec.bodyH / 2 + spec.cabinH + 0.1, 0, 0.9, 0.22, 0.4, hexColor(0xffc93c));
  }
  if (isPolice) {
    b.box(-W * 0.26, bodyY, 0, 0.5, spec.bodyH * 0.96, L * 0.5, dark); // black door panels
    b.box(W * 0.26, bodyY, 0, 0.5, spec.bodyH * 0.96, L * 0.5, dark);
  }
  b.box(0, 0.32, L / 2 + 0.03, W * 0.92, 0.3, 0.08, dark); // bumpers
  b.box(0, 0.32, -L / 2 - 0.03, W * 0.92, 0.3, 0.08, dark);
  // headlights and tail lights baked pale; the lit ones are separate objects
  b.box(-W * 0.32, bodyY + 0.08, L / 2 + 0.05, 0.42, 0.14, 0.05, hexColor(0xfff2c0));
  b.box(W * 0.32, bodyY + 0.08, L / 2 + 0.05, 0.42, 0.14, 0.05, hexColor(0xfff2c0));
  b.box(-W * 0.32, bodyY + 0.08, -L / 2 - 0.05, 0.42, 0.14, 0.05, hexColor(0xd64545));
  b.box(W * 0.32, bodyY + 0.08, -L / 2 - 0.05, 0.42, 0.14, 0.05, hexColor(0xd64545));
  const root = new Obj(b.build(gl));

  // wheels: one shared dark cylinder, four nodes that spin and steer;
  // the buggy rides on taller off-road rubber than the street cars
  const wheelR = type === 'buggy' ? 0.46 : 0.37;
  const wheelW = type === 'buggy' ? 0.34 : 0.28;
  const wb = new GeoBuilder();
  wb.cylinder(0, 0, 0, wheelR, wheelR, wheelW, 10, hexColor(0x17191c));
  wb.cylinder(0, 0, 0, wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 6, hexColor(0x9aa0a4));
  const wheelMesh = wb.build(gl);
  const wheels = {};
  const mkWheel = (x, z, key) => {
    const pivot = new Obj();
    pivot.pos = [x, wheelR, z];
    const spin = new Obj(wheelMesh);
    spin.rot = [0, 0, Math.PI / 2];
    pivot.add(spin);
    root.add(pivot);
    wheels[key] = { pivot, spin };
  };
  mkWheel(-W / 2 + 0.05, L * 0.32, 'fl');
  mkWheel(W / 2 - 0.05, L * 0.32, 'fr');
  mkWheel(-W / 2 + 0.05, -L * 0.32, 'rl');
  mkWheel(W / 2 - 0.05, -L * 0.32, 'rr');

  let lightbar = null;
  if (isPolice) {
    const lb = new Obj();
    lb.pos = [0, bodyY + spec.bodyH / 2 + spec.cabinH + 0.08, -L * 0.06];
    const red = new Obj(new GeoBuilder().box(-0.28, 0, 0, 0.5, 0.16, 0.3, hexColor(0xff2a2a)).build(gl), { emissive: 0.9 });
    const blue = new Obj(new GeoBuilder().box(0.28, 0, 0, 0.5, 0.16, 0.3, hexColor(0x2a5bff)).build(gl), { emissive: 0.9 });
    lb.add(red);
    lb.add(blue);
    root.add(lb);
    lightbar = { red, blue };
  }
  return { root, wheels, lightbar };
}

let nextCarId = 1;

export class Car {
  constructor(gl, type, colorHex, x, z, heading, opts = {}) {
    this.id = nextCarId++;
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.isPolice = !!opts.police;
    const built = buildCarObject(gl, type, colorHex, this.isPolice);
    this.obj = built.root;
    this.wheels = built.wheels;
    this.lightbar = built.lightbar;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.driver = opts.driver || 'parked'; // parked | traffic | police | player
    this.fromNode = null;
    this.toNode = null;
    this.waitTimer = 0;
    this.stuckTimer = 0;
    this.syncObj();
  }
  forward() {
    return [Math.sin(this.heading), Math.cos(this.heading)];
  }
  syncObj() {
    this.obj.pos = [this.x, 0, this.z];
    this.obj.rot = [0, this.heading, 0];
    const spin = this.speed * 0.12;
    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      const w = this.wheels[key];
      w.spin.rot[0] = (w.spin.rot[0] + spin) % (Math.PI * 2);
    }
    this.wheels.fl.pivot.rot[1] = this.steer * 0.9;
    this.wheels.fr.pivot.rot[1] = this.steer * 0.9;
    if (this.lightbar) {
      const phase = (performance.now() / 280) % 2 < 1;
      this.lightbar.red.visible = phase;
      this.lightbar.blue.visible = !phase;
    }
  }
}

// ------------------------------------------------------------- traffic AI
const intersections = [];
for (const gx of GRID_LINES) for (const gz of GRID_LINES) intersections.push({ x: gx, z: gz });

function nearestIntersection(x, z) {
  let best = intersections[0], bd = Infinity;
  for (const n of intersections) {
    const d = dist2d(x, z, n.x, n.z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function nextIntersection(rng, from, current) {
  // neighbours share one coordinate; avoid going straight back unless cornered
  const options = intersections.filter(
    (n) => (n.x === current.x || n.z === current.z) && n !== current &&
      Math.abs(n.x - current.x) + Math.abs(n.z - current.z) === 90,
  );
  const forward = options.filter((n) => n !== from);
  const pool = forward.length ? forward : options;
  return rng.pick(pool.length ? pool : [current]);
}

export class TrafficSystem {
  constructor(gl, world, count) {
    this.cars = [];
    this.rng = new Rng(777);
    // moving traffic, started on avenues near intersections
    for (let i = 0; i < count; i++) {
      const node = this.rng.pick(intersections);
      const type = this.rng.pick(['sedan', 'sedan', 'hatch', 'taxi', 'van', 'sport', 'buggy', 'pickup', 'limo']);
      const color = type === 'taxi' ? 0xf7b731 : this.rng.pick(TRAFFIC_COLORS);
      const car = new Car(gl, type, color, node.x, node.z, 0, { driver: 'traffic' });
      car.fromNode = node;
      car.toNode = nextIntersection(this.rng, null, node);
      car.speed = 6;
      this.cars.push(car);
    }
    // parked cars in the lots and along a few curbs (a limo only ever
    // parks where somebody is being waited for: the café, the terminal)
    for (const spot of world.parkedSpots) {
      if (this.rng.chance(0.35)) continue;
      const type = this.rng.pick(['sedan', 'hatch', 'van', 'sport', 'buggy', 'pickup', 'limo']);
      const car = new Car(gl, type, this.rng.pick(TRAFFIC_COLORS), spot.x, spot.z, spot.heading, { driver: 'parked' });
      this.cars.push(car);
    }
    const curbSpots = [
      { x: 12, z: 96, heading: 0 }, { x: -12, z: -60, heading: Math.PI },
      { x: 55, z: -96, heading: Math.PI / 2 }, { x: -70, z: 6, heading: -Math.PI / 2 },
      { x: 100, z: 84, heading: 0 }, { x: -100, z: -84, heading: Math.PI },
    ];
    for (const spot of curbSpots) {
      const type = this.rng.pick(['sedan', 'hatch', 'sport', 'taxi']);
      const color = type === 'taxi' ? 0xf7b731 : this.rng.pick(TRAFFIC_COLORS);
      const car = new Car(gl, type, color, spot.x, spot.z, spot.heading, { driver: 'parked' });
      this.cars.push(car);
    }
  }

  update(dt, obstacles) {
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue;
      this.driveTraffic(car, dt, obstacles);
    }
  }

  driveTraffic(car, dt, obstacles) {
    const rng = this.rng;
    const to = car.toNode;
    // aim at the target intersection, shifted into this segment's right lane
    const dirx = Math.sign(to.x - car.fromNode.x), dirz = Math.sign(to.z - car.fromNode.z);
    const segHeading = Math.atan2(dirx, dirz);
    const rx = -Math.cos(segHeading), rz = Math.sin(segHeading);
    const aimX = to.x + rx * LANE_OFFSET - dirx * 4;
    const aimZ = to.z + rz * LANE_OFFSET - dirz * 4;
    const myLaneX = car.fromNode.x + rx * LANE_OFFSET;
    const myLaneZ = car.fromNode.z + rz * LANE_OFFSET;
    // hold the lane line while far off, swing toward the node's lane near it
    const remain = Math.abs(dirx) > 0 ? Math.abs(to.x - car.x) : Math.abs(to.z - car.z);
    const tx = remain < 18 ? aimX : Math.abs(dirx) > 0 ? car.x + dirx * 10 : myLaneX;
    const tz = remain < 18 ? aimZ : Math.abs(dirz) > 0 ? car.z + dirz * 10 : myLaneZ;
    const want = Math.atan2(tx - car.x, tz - car.z);
    const delta = angleDelta(car.heading, want);
    car.steer = clamp(delta * 1.6, -0.55, 0.55);
    car.heading += car.steer * dt * clamp(Math.abs(car.speed) / 6, 0.4, 1.6) * Math.sign(car.speed || 1);

    // desired speed: cruise, slower near the node, stopped for obstacles
    let wantSpeed = remain < 16 ? 6.5 : 11.5;
    const [fx, fz] = car.forward();
    for (const o of obstacles) {
      if (o === car) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * -fz + dz * fx);
      if (ahead > 0 && ahead < 9 && side < 2.2) {
        wantSpeed = ahead < 5 ? 0 : Math.min(wantSpeed, 4);
      }
    }
    if (car.waitTimer > 0) {
      car.waitTimer -= dt;
      wantSpeed = 0;
    }
    const accel = wantSpeed > car.speed ? 7 : 16;
    car.speed += clamp(wantSpeed - car.speed, -accel * dt, accel * dt);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    if (remain < 5) {
      const arrived = car.toNode;
      const previous = car.fromNode;
      car.fromNode = arrived;
      car.toNode = nextIntersection(rng, previous, arrived);
      if (rng.chance(0.18)) car.waitTimer = rng.range(0.4, 1.2);
    }
    car.syncObj();
  }
}

// ------------------------------------------------------- player driving
// input: {throttle -1..1, steer -1..1, brake bool}; events filled in place.
export function drivePlayerCar(car, input, dt, colliders, events) {
  const spec = car.spec;
  const maxF = spec.maxSpeed;
  const maxR = 9;
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  } else if (input.throttle > 0) {
    car.speed += spec.accel * input.throttle * dt * (1 - Math.max(0, car.speed) / (maxF * 1.25));
  } else if (input.throttle < 0) {
    car.speed += spec.accel * 0.7 * input.throttle * dt * (1 + Math.min(0, car.speed) / (maxR * 1.4));
  }
  // rolling drag and a soft top speed
  car.speed -= car.speed * 0.35 * dt;
  car.speed = clamp(car.speed, -maxR, maxF);
  if (!input.brake && input.throttle === 0 && Math.abs(car.speed) < 0.25) car.speed = 0;

  const steerTarget = input.steer * 0.55;
  car.steer += clamp(steerTarget - car.steer, -3.2 * dt, 3.2 * dt);
  const speedFactor = clamp(Math.abs(car.speed) / 7, 0, 1) * (1 - clamp(Math.abs(car.speed) / (maxF * 1.6), 0, 0.45));
  car.heading -= car.steer * speedFactor * dt * 1.55 * Math.sign(car.speed || 1);

  const [fx, fz] = car.forward();
  let nx = car.x + fx * car.speed * dt;
  let nz = car.z + fz * car.speed * dt;
  const before = [car.x, car.z];
  [nx, nz] = collideBuildings(colliders, nx, nz, 1.7);
  if ((nx !== before[0] + fx * car.speed * dt || nz !== before[1] + fz * car.speed * dt) && Math.abs(car.speed) > 6) {
    events.buildingHit = Math.abs(car.speed);
    car.health -= Math.abs(car.speed) * 0.55;
    car.speed = -car.speed * 0.22;
  }
  car.x = nx;
  car.z = nz;
  car.syncObj();
}

// circle collision between two cars; returns impact speed or 0
export function carCarImpact(a, b) {
  const d = dist2d(a.x, a.z, b.x, b.z);
  const min = 3.1;
  if (d >= min || d === 0) return 0;
  const rel = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4;
  const push = (min - d) / 2;
  const dx = (a.x - b.x) / d, dz = (a.z - b.z) / d;
  a.x += dx * push; a.z += dz * push;
  b.x -= dx * push; b.z -= dz * push;
  if (a.driver !== 'parked') a.speed *= 0.55;
  if (b.driver !== 'parked') b.speed *= 0.55;
  a.syncObj();
  b.syncObj();
  return rel;
}
