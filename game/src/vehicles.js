// vehicles.js — everything in Port Solana with four wheels.
//
// The roster first: nine cars, from the Pico Hatch that every student
// in the Heights seems to own, through the teal Vandal GT Marina's
// collector wants, the Sirocco Roadster and Voyager Wagon that joined
// the streets later, to the long Regent Limo that mostly idles
// outside the Hotel Solana. A Car is a small arcade body — position,
// heading, speed, health, a driver ('traffic', 'parked', 'player' or
// 'police') — wearing a mesh built from boxes per type, with a light
// bar if it is a cruiser.
//
// TrafficSystem fills the avenues: cars follow their lane on the grid
// (LANE_OFFSET to the correct side), slow for whatever is ahead of
// them, and sometimes turn at intersections. drivePlayerCar is the
// same physics with a person on the pedals, and carCarImpact settles
// the arguments between any two cars that meet.

import { GeoBuilder, Obj, hexColor } from './engine.js';
import { GRID_LINES, collideBuildings } from './city.js';
import { Rng, clamp, angleDelta, dist2d } from './random.js';

export const LANE_OFFSET = 3.3;

// ------------------------------------------------------------ the roster
// maxSpeed in metres/second; accel in m/s²; turn in radians/second
// at full lock; len/wid are the body's metres.
export const CAR_TYPES = {
  hatch: {
    name: 'Pico Hatch', maxSpeed: 24, accel: 8.5, turn: 1.9,
    len: 3.6, wid: 1.7, bodyH: 0.62, cabinH: 0.55, cabinLen: 1.7, cabinOff: -0.2, wheelR: 0.32,
  },
  sedan: {
    name: 'Meridian Sedan', maxSpeed: 27, accel: 9, turn: 1.7,
    len: 4.5, wid: 1.85, bodyH: 0.6, cabinH: 0.52, cabinLen: 2.1, cabinOff: -0.25, wheelR: 0.34,
  },
  wagon: {
    name: 'Voyager Wagon', maxSpeed: 25, accel: 8.5, turn: 1.6,
    len: 4.7, wid: 1.85, bodyH: 0.62, cabinH: 0.6, cabinLen: 3.0, cabinOff: -0.55, wheelR: 0.34,
  },
  coupe: {
    name: 'Falco Coupe', maxSpeed: 31, accel: 11, turn: 1.9,
    len: 4.3, wid: 1.85, bodyH: 0.52, cabinH: 0.46, cabinLen: 1.9, cabinOff: -0.35, wheelR: 0.35,
  },
  sport: {
    name: 'Vandal GT', maxSpeed: 36, accel: 13.5, turn: 2.1,
    len: 4.4, wid: 1.95, bodyH: 0.5, cabinH: 0.42, cabinLen: 1.8, cabinOff: -0.3, wheelR: 0.36,
  },
  roadster: {
    name: 'Sirocco Roadster', maxSpeed: 33, accel: 12.5, turn: 2.2,
    len: 4.0, wid: 1.85, bodyH: 0.48, cabinH: 0.4, cabinLen: 1.5, cabinOff: -0.5, wheelR: 0.35,
  },
  pickup: {
    name: 'Dune Pickup', maxSpeed: 26, accel: 9.5, turn: 1.5,
    len: 4.9, wid: 2.0, bodyH: 0.85, cabinH: 0.6, cabinLen: 1.6, cabinOff: 0.75, wheelR: 0.42,
  },
  van: {
    name: 'Cargo Van', maxSpeed: 22, accel: 7.5, turn: 1.3,
    len: 5.2, wid: 2.05, bodyH: 1.5, cabinH: 0.5, cabinLen: 1.4, cabinOff: 1.55, wheelR: 0.4,
  },
  limo: {
    name: 'Regent Limo', maxSpeed: 25, accel: 8, turn: 1.1,
    len: 6.8, wid: 1.95, bodyH: 0.62, cabinH: 0.55, cabinLen: 4.4, cabinOff: -0.5, wheelR: 0.36,
  },
};

const TRAFFIC_TYPES = ['hatch', 'sedan', 'sedan', 'wagon', 'coupe', 'pickup', 'van', 'hatch', 'roadster', 'sport'];
const TRAFFIC_COLORS = [
  0xd97b6c, 0x457b9d, 0xe9c46a, 0x2a9d8f, 0xf2f0eb, 0x606c38,
  0xbc4749, 0x8a6b45, 0x9a86c8, 0xe4572e, 0x707880, 0x264653,
];

// ------------------------------------------------------------ one car

export class Car {
  constructor(gl, type, colorHex, x, z, heading, opts = {}) {
    this.type = type;
    this.spec = CAR_TYPES[type] || CAR_TYPES.sedan;
    this.color = colorHex;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.driver = opts.driver || 'parked';
    this.isPolice = !!opts.police;
    this.isMissionCar = false;
    this.health = 100;
    this.steerVis = 0; // front-wheel yaw, cosmetic
    this.obj = this._buildMesh(gl);
    this.syncObj();
  }

  _buildMesh(gl) {
    const s = this.spec;
    const group = new Obj();
    const body = new GeoBuilder();
    const paint = this.isPolice ? hexColor(0xf4f6f7) : hexColor(this.color);
    const glass = hexColor(0x1d2f3a);
    const dark = hexColor(0x232a30);
    const chrome = hexColor(0xb9c0c4);
    const floorY = s.wheelR * 0.82;
    // the body shell and the glasshouse on top of it
    body.box(0, floorY + s.bodyH / 2, 0, s.wid, s.bodyH, s.len, paint);
    body.box(0, floorY + s.bodyH + s.cabinH / 2 - 0.04, s.cabinOff,
      s.wid * 0.84, s.cabinH, s.cabinLen, glass);
    // a painted roof panel so the cabin reads as a car, not a tank
    body.box(0, floorY + s.bodyH + s.cabinH + 0.01, s.cabinOff,
      s.wid * 0.8, 0.07, s.cabinLen * 0.92, paint);
    // bumpers, lights, and a grille line
    body.box(0, floorY + 0.16, s.len / 2 + 0.05, s.wid * 0.96, 0.3, 0.14, dark);
    body.box(0, floorY + 0.16, -s.len / 2 - 0.05, s.wid * 0.96, 0.3, 0.14, dark);
    for (const sx of [-1, 1]) {
      body.box(sx * s.wid * 0.32, floorY + s.bodyH * 0.72, s.len / 2 + 0.03, 0.42, 0.16, 0.08, hexColor(0xfff3b0));
      body.box(sx * s.wid * 0.32, floorY + s.bodyH * 0.72, -s.len / 2 - 0.03, 0.42, 0.14, 0.08, hexColor(0xd64545));
    }
    body.box(0, floorY + s.bodyH * 0.45, s.len / 2 + 0.02, s.wid * 0.6, 0.18, 0.06, chrome);
    if (this.type === 'pickup') {
      // the open bed: low walls behind the cab
      body.box(0, floorY + s.bodyH + 0.22, -s.len * 0.28, s.wid * 0.94, 0.44, s.len * 0.4, paint);
      body.box(0, floorY + s.bodyH + 0.05, -s.len * 0.28, s.wid * 0.8, 0.1, s.len * 0.34, dark);
    }
    if (this.isPolice) {
      // the livery band and the wordless authority of a dark bonnet
      body.box(0, floorY + s.bodyH * 0.55, 0, s.wid + 0.03, 0.34, s.len * 0.62, hexColor(0x2c4a72));
      body.box(0, floorY + s.bodyH + 0.03, s.len * 0.28, s.wid * 0.9, 0.08, s.len * 0.4, dark);
    }
    group.add(new Obj(body.build(gl)));
    if (this.isPolice) {
      // the light bar rides in its own emissive object so it glows
      const bar = new GeoBuilder();
      bar.box(0, 0, 0, s.wid * 0.7, 0.14, 0.5, dark);
      bar.box(-s.wid * 0.19, 0.02, 0, s.wid * 0.3, 0.2, 0.44, hexColor(0xe63946));
      bar.box(s.wid * 0.19, 0.02, 0, s.wid * 0.3, 0.2, 0.44, hexColor(0x3a86ff));
      const barObj = new Obj(bar.build(gl), { emissive: 0.85 });
      barObj.pos = [0, floorY + s.bodyH + s.cabinH + 0.16, s.cabinOff];
      group.add(barObj);
    }
    // wheels: one tyre mesh, four corners; the fronts carry the
    // steering angle so a turning car shows it
    const wheelB = new GeoBuilder();
    wheelB.cylinder(0, 0, 0, s.wheelR, s.wheelR, 0.3, 10, dark);
    wheelB.cylinder(0, 0, 0, s.wheelR * 0.5, s.wheelR * 0.5, 0.32, 8, chrome);
    const wheelMesh = wheelB.build(gl);
    this.wheelsF = [];
    const wy = s.wheelR;
    const wz = s.len / 2 - s.wheelR - 0.35;
    for (const [sx, sz, front] of [[-1, 1, 1], [1, 1, 1], [-1, -1, 0], [1, -1, 0]]) {
      const w = new Obj(wheelMesh);
      w.pos = [sx * (s.wid / 2 - 0.05), wy, sz * wz];
      w.rot = [0, 0, Math.PI / 2];
      group.add(w);
      if (front) this.wheelsF.push(w);
    }
    return group;
  }

  syncObj() {
    this.obj.pos = [this.x, 0, this.z];
    this.obj.rot = [0, this.heading, 0];
    for (const w of this.wheelsF) w.rot = [0, this.steerVis, Math.PI / 2];
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

// ------------------------------------------------------------ traffic
//
// A traffic car follows one avenue. It knows which grid line it is
// on, which way along it, and where its lane sits; at intersections
// it may turn onto the crossing avenue, and at the city edge it
// turns back. Ahead of it, anything in its lane slows it down.

class TrafficDriver {
  constructor(car, rng) {
    this.car = car;
    this.rng = rng;
    // start on a random avenue, in a random lane direction
    this.alongZ = rng.chance(0.5);
    this.line = rng.pick(GRID_LINES);
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.turning = 0; // -1, 0 or +1 while swinging at an intersection
    this.turnFrom = 0;
    this.cruise = car.spec.maxSpeed * rng.range(0.42, 0.66);
    this.place(rng.range(-230, 230));
  }

  baseHeading() {
    if (this.alongZ) return this.dir > 0 ? 0 : Math.PI;
    return this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // the lane anchor: the coordinate across the road the car belongs at
  anchor() {
    return this.line - this.dir * LANE_OFFSET;
  }

  place(along) {
    const a = this.anchor();
    if (this.alongZ) {
      this.car.x = a;
      this.car.z = along;
    } else {
      this.car.x = along;
      this.car.z = a;
    }
    this.car.heading = this.baseHeading();
    this.car.speed = this.cruise * 0.7;
  }

  update(dt, obstacles) {
    const car = this.car;
    const fwd = car.forward();
    // ---- look ahead: anything in the lane slows or stops the car
    let target = this.cruise;
    for (const o of obstacles) {
      if (o === car) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      const side = Math.abs(dx * -fwd.z + dz * fwd.x);
      if (ahead > 0 && ahead < 11 && side < 2.3) {
        const gap = ahead - 4.2;
        target = Math.min(target, clamp(gap * 0.9, 0, this.cruise));
        if (gap < 1.2) target = 0;
      }
    }
    // ---- accelerate or brake toward the target speed
    const accel = target > car.speed ? car.spec.accel * 0.55 : 16;
    car.speed += clamp(target - car.speed, -accel * dt, accel * dt);
    if (car.speed < 0.01 && target === 0) car.speed = 0;

    // ---- steering: hold the lane, or swing through a turn
    if (this.turning !== 0) {
      car.heading += this.turning * 1.7 * dt;
      const done = Math.abs(angleDelta(car.heading, this.turnTarget)) < 0.06;
      if (done) {
        car.heading = this.turnTarget;
        this.turning = 0;
        // the avenue we crossed becomes the avenue we follow
        this.line = this.crossLine;
        this.alongZ = !this.alongZ;
        this.dir = this.turnDir;
      }
    } else {
      const lateral = this.alongZ ? this.anchor() - car.x : this.anchor() - car.z;
      const sway = clamp(lateral * 0.045, -0.3, 0.3);
      const want = this.baseHeading() + (this.alongZ ? sway : sway) * (this.dir > 0 ? 1 : -1) * (this.alongZ ? 1 : -1);
      // (the double sign above is the lane geometry working out:
      // veering toward the anchor reads differently on each axis)
      car.heading += clamp(angleDelta(car.heading, want), -1.2 * dt, 1.2 * dt);
      // ---- intersections: sometimes turn, decided once per crossing
      const along = this.alongZ ? car.z : car.x;
      let nearCross = null;
      for (const cross of GRID_LINES) {
        if (Math.abs(along - cross) < 1.6 && Math.abs((this.alongZ ? car.x : car.z) - this.line) < 9) {
          nearCross = cross;
          break;
        }
      }
      if (nearCross === null) {
        this.decidedFor = null;
      } else if (this.decidedFor !== nearCross) {
        this.decidedFor = nearCross;
        if (this.rng.chance(0.3)) {
          this.turning = this.rng.chance(0.5) ? 1 : -1;
          this.crossLine = nearCross;
          this.turnTarget = this.baseHeading() + this.turning * Math.PI / 2;
          this.turnDir = this.computeTurnDir();
        }
      }
      // ---- the city edge: turn back toward town
      if (Math.abs(along) > 244) {
        this.dir *= -1;
        car.heading = this.baseHeading();
        // step across to the other lane over the next seconds: the
        // anchor formula follows dir, so the car drifts across
      }
    }

    // ---- move, and let the buildings have the last word
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const fixed = collideBuildings(TRAFFIC_COLLIDERS, car.x, car.z, 1.6);
    car.x = fixed.x;
    car.z = fixed.z;
    car.steerVis = clamp(angleDelta(car.heading, this.baseHeading()) * 1.4, -0.4, 0.4);
    car.syncObj();
  }

  computeTurnDir() {
    // after a quarter turn, travel along the new axis runs toward
    // whichever sign the new heading's forward points
    const h = this.baseHeading() + this.turning * Math.PI / 2;
    if (this.alongZ) {
      // new travel is along X: sign of sin(h)
      return Math.sin(h) >= 0 ? 1 : -1;
    }
    // new travel is along Z: sign of cos(h)
    return Math.cos(h) >= 0 ? 1 : -1;
  }
}

// the colliders traffic respects, handed over by the system below
// (avenues are clear by construction, so this is a seatbelt, not a
// steering wheel)
let TRAFFIC_COLLIDERS = [];

export class TrafficSystem {
  constructor(gl, world, movingCount) {
    this.world = world;
    TRAFFIC_COLLIDERS = world.colliders;
    const rng = new Rng(5150);
    this.cars = [];
    this.drivers = [];
    // parked cars first: the town's kerbs are full of them
    for (const spot of world.parkedSpots) {
      const type = rng.pick(TRAFFIC_TYPES);
      const car = new Car(gl, type, rng.pick(TRAFFIC_COLORS), spot.x, spot.z, spot.heading, { driver: 'parked' });
      this.cars.push(car);
    }
    // then the moving fleet, spread so no two share a cradle
    for (let i = 0; i < movingCount; i++) {
      const type = rng.pick(TRAFFIC_TYPES);
      const car = new Car(gl, type, rng.pick(TRAFFIC_COLORS), 0, 0, 0, { driver: 'traffic' });
      const driver = new TrafficDriver(car, rng);
      driver.place(-220 + (i / movingCount) * 440 + rng.range(-8, 8));
      this.cars.push(car);
      this.drivers.push(driver);
    }
  }

  update(dt, obstacles) {
    for (const d of this.drivers) {
      if (d.car.driver === 'traffic') d.update(dt, obstacles);
    }
    // parked cars the player has taken stop being traffic's problem;
    // their own sync happens wherever they are driven
    for (const car of this.cars) {
      if (car.driver === 'parked') car.syncObj();
    }
  }
}

// ------------------------------------------------------------ the player

// Drive the player's car for one frame. axes: {throttle -1..1,
// steer -1..1 (positive steers left), brake bool}. events collects
// what the frame did: buildingHit is set to the impact speed when a
// wall stops the car hard.
export function drivePlayerCar(car, axes, dt, colliders, events) {
  const spec = car.spec;
  const throttle = clamp(axes.throttle || 0, -1, 1);
  // ---- longitudinal: engine, brake, drag
  if (axes.brake && car.speed > 0.4) {
    car.speed = Math.max(0, car.speed - 26 * dt);
  } else if (throttle !== 0) {
    car.speed += throttle * spec.accel * dt * (throttle < 0 && car.speed > 0.5 ? 1.6 : 1);
  }
  const drag = car.speed * 0.32 + car.speed * Math.abs(car.speed) * 0.006;
  car.speed -= drag * dt;
  if (!axes.brake && throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 1.2 * dt);
  car.speed = clamp(car.speed, -8.5, spec.maxSpeed);
  if (Math.abs(car.speed) < 0.02 && throttle === 0) car.speed = 0;

  // ---- steering: authority grows with speed, then fades at pace
  const steer = clamp(axes.steer || 0, -1, 1);
  const authority = clamp(Math.abs(car.speed) / 6, 0, 1) * (1 - clamp(Math.abs(car.speed) / (spec.maxSpeed * 2.6), 0, 0.45));
  car.heading += steer * spec.turn * authority * dt * (car.speed < 0 ? -1 : 1);
  car.steerVis = steer * 0.42 * clamp(Math.abs(car.speed) / 6, 0, 1);

  // ---- integrate, then answer to the buildings
  const px = car.x, pz = car.z;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.x = clamp(car.x, -338, 338);
  car.z = clamp(car.z, -338, 338);
  const fixed = collideBuildings(colliders, car.x, car.z, 1.7);
  if (fixed.x !== car.x || fixed.z !== car.z) {
    const impact = Math.abs(car.speed);
    // a correction along the travel direction means the wall was met
    // head-on-ish; a sideways scrape costs less speed and pride
    const into = Math.abs((fixed.x - px) * Math.sin(car.heading) + (fixed.z - pz) * Math.cos(car.heading));
    if (impact > 2.5 && into > 0.02) events.buildingHit = impact;
    car.x = fixed.x;
    car.z = fixed.z;
    car.speed *= impact > 6 ? -0.18 : 0.4;
    if (Math.abs(car.speed) < 0.4) car.speed = 0;
  }
  car.syncObj();
}

// ------------------------------------------------------------ contact
//
// Two cars meet: measure the closing speed, part them along their
// offset so they never overlap, trade a little momentum, and return
// the impact (0 when they did not really meet).
export function carCarImpact(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const reach = (a.spec.len + b.spec.len) * 0.36 + 0.7;
  const d2 = dx * dx + dz * dz;
  if (d2 > reach * reach || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d, nz = dz / d;
  const overlap = reach - d;
  // part them, weighted by who is moving faster into the other
  a.x -= nx * overlap * 0.5;
  a.z -= nz * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.z += nz * overlap * 0.5;
  // closing speed along the line between them
  const av = a.speed * (Math.sin(a.heading) * nx + Math.cos(a.heading) * nz);
  const bv = b.speed * (Math.sin(b.heading) * nx + Math.cos(b.heading) * nz);
  const closing = av - bv;
  if (closing <= 0.5) return 0;
  // both shed speed; the struck car takes a push
  a.speed -= a.speed * 0.25;
  b.speed += closing * 0.3 * (Math.cos(b.heading) * nz + Math.sin(b.heading) * nx >= 0 ? 1 : -1);
  a.syncObj();
  b.syncObj();
  return closing;
}
