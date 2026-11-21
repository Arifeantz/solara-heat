// people.js — the humans of Port Solana: the player character and the
// pedestrians who stroll its sidewalks.
//
// People are little articulated figures built from boxes — torso, head, and
// arms and legs on pivots that swing as they walk. Pedestrians follow the
// sidewalk loop around their block, hurry away from trouble, and fall when
// hit. The player is one special pedestrian the input drives directly.

import { GeoBuilder, Obj, hexColor } from './engine.js';
import { collideBuildings } from './city.js';
import { Rng, clamp, angleDelta, dist2d } from './random.js';

const SKIN = [0xf2c49b, 0xc68863, 0x8d5a3b, 0xffdbac];
const SHIRTS = [0xe4572e, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xe9c46a, 0xbc4749, 0x606c38, 0xf2f0eb, 0x9a86c8];
const PANTS = [0x33404d, 0x5d4a38, 0x274156, 0x6d6875, 0xe8e2d4, 0x843b62];

const meshCache = new Map();
function partMesh(gl, w, h, d, colorHex, key) {
  const k = key + ':' + colorHex;
  if (!meshCache.has(k)) {
    const b = new GeoBuilder();
    b.box(0, -h / 2, 0, w, h, d, hexColor(colorHex)); // hangs down from its pivot
    meshCache.set(k, b.build(gl));
  }
  return meshCache.get(k);
}
function ballMesh(gl, r, colorHex, key) {
  const k = key + ':' + colorHex;
  if (!meshCache.has(k)) {
    const b = new GeoBuilder();
    b.cylinder(0, 0, 0, r, r * 1.05, r * 1.7, 7, hexColor(colorHex));
    meshCache.set(k, b.build(gl));
  }
  return meshCache.get(k);
}

export class Person {
  constructor(gl, opts = {}) {
    const rng = new Rng(opts.seed || 1);
    this.skin = opts.skin ?? rng.pick(SKIN);
    this.shirt = opts.shirt ?? rng.pick(SHIRTS);
    this.pants = opts.pants ?? rng.pick(PANTS);
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.phase = rng.range(0, 6);
    this.state = 'walk'; // walk | flee | down | idle
    this.stateTimer = 0;
    this.punchTimer = 0;

    const root = new Obj();
    root.pos = [this.x, 0, this.z];
    this.obj = root;
    const hips = new Obj();
    hips.pos = [0, 0.98, 0];
    root.add(hips);
    this.hips = hips;
    // torso hangs up from the hips: use a part that extends upward
    const torso = new Obj(partMesh(gl, 0.52, 0.62, 0.3, this.shirt, 'torso-up'));
    torso.pos = [0, 0.62, 0];
    torso.rot = [Math.PI, 0, 0]; // flip the hang-down part to stand up
    hips.add(torso);
    const head = new Obj(ballMesh(gl, 0.21, this.skin, 'head'));
    head.pos = [0, 0.78, 0];
    hips.add(head);
    this.head = head;
    if (opts.cap !== undefined && opts.cap !== null) {
      const cap = new Obj(partMesh(gl, 0.46, 0.12, 0.46, opts.cap, 'cap'));
      cap.pos = [0, 0.98, 0];
      hips.add(cap);
      const brim = new Obj(partMesh(gl, 0.4, 0.05, 0.3, opts.cap, 'brim'));
      brim.pos = [0, 0.92, 0.3];
      hips.add(brim);
    }
    const mkLimb = (mesh, x, y, z) => {
      const pivot = new Obj();
      pivot.pos = [x, y, z];
      const part = new Obj(mesh);
      pivot.add(part);
      hips.add(pivot);
      return pivot;
    };
    this.armL = mkLimb(partMesh(gl, 0.15, 0.6, 0.17, this.shirt, 'arm'), -0.36, 0.55, 0);
    this.armR = mkLimb(partMesh(gl, 0.15, 0.6, 0.17, this.shirt, 'arm'), 0.36, 0.55, 0);
    this.legL = mkLimb(partMesh(gl, 0.19, 0.95, 0.21, this.pants, 'leg'), -0.14, 0.02, 0);
    this.legR = mkLimb(partMesh(gl, 0.19, 0.95, 0.21, this.pants, 'leg'), 0.14, 0.02, 0);
    this.syncObj(0);
  }

  syncObj(dt) {
    this.obj.pos = [this.x, 0, this.z];
    this.obj.rot = [0, this.heading, 0];
    if (this.state === 'down') {
      this.obj.rot = [-Math.PI / 2, this.heading, 0];
      this.obj.pos = [this.x, 0.25, this.z];
      return;
    }
    const moving = Math.abs(this.speed) > 0.15;
    if (moving) this.phase += dt * (4 + Math.abs(this.speed) * 1.6);
    const swing = moving ? Math.sin(this.phase) * clamp(Math.abs(this.speed) * 0.16, 0.1, 0.62) : 0;
    this.legL.rot[0] = swing;
    this.legR.rot[0] = -swing;
    this.armL.rot[0] = -swing * 0.8;
    this.armR.rot[0] = swing * 0.8;
    if (this.punchTimer > 0) {
      // right arm jabs forward and back
      const t = this.punchTimer / 0.28;
      this.armR.rot[0] = -Math.sin(t * Math.PI) * 1.5;
    }
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.05 : 0;
    this.hips.pos[1] = 0.98 + bob;
  }
}

// ------------------------------------------------------------ pedestrians
export class Pedestrians {
  constructor(gl, world, count) {
    this.list = [];
    this.rng = new Rng(4242);
    const loops = world.sidewalkLoops;
    for (let i = 0; i < count; i++) {
      const loop = this.rng.pick(loops);
      const person = new Person(gl, { seed: 1000 + i * 17 });
      person.loop = loop;
      person.s = this.rng.range(0, 8 * loop.half);
      person.dir = this.rng.chance(0.5) ? 1 : -1;
      person.walkSpeed = this.rng.range(1.1, 1.7);
      this.placeOnLoop(person);
      this.list.push(person);
    }
  }

  placeOnLoop(p) {
    const { cx, cz, half } = p.loop;
    const side = Math.floor(p.s / (2 * half)) % 4;
    const t = (p.s % (2 * half)) - half;
    if (side === 0) { p.x = cx + t; p.z = cz - half; p.heading = Math.PI / 2; }
    else if (side === 1) { p.x = cx + half; p.z = cz + t; p.heading = 0; }
    else if (side === 2) { p.x = cx - t; p.z = cz + half; p.heading = -Math.PI / 2; }
    else { p.x = cx - half; p.z = cz - t; p.heading = Math.PI; }
    if (p.dir < 0) p.heading += Math.PI;
  }

  update(dt, threats) {
    for (const p of this.list) {
      if (p.state === 'down') {
        p.stateTimer -= dt;
        p.speed = 0;
        if (p.stateTimer <= 0) {
          p.state = 'flee';
          p.stateTimer = 2.5;
        }
        p.syncObj(dt);
        continue;
      }
      // hurry away from the nearest threat (a fast car, a fight)
      let fleeX = 0, fleeZ = 0, fleeing = false;
      for (const t of threats) {
        const d = dist2d(p.x, p.z, t.x, t.z);
        if (d < t.radius) {
          fleeX += (p.x - t.x) / (d + 0.1);
          fleeZ += (p.z - t.z) / (d + 0.1);
          fleeing = true;
        }
      }
      if (fleeing || p.state === 'flee') {
        if (fleeing) {
          p.state = 'flee';
          p.stateTimer = 1.2;
          p.fleeDir = Math.atan2(fleeX, fleeZ);
        } else {
          p.stateTimer -= dt;
          if (p.stateTimer <= 0) p.state = 'walk';
        }
        if (p.state === 'flee') {
          const want = p.fleeDir + Math.PI / 2 * 0; // straight away
          p.heading += clamp(angleDelta(p.heading, want), -6 * dt, 6 * dt);
          p.speed = 3.6;
          p.x += Math.sin(p.heading) * p.speed * dt;
          p.z += Math.cos(p.heading) * p.speed * dt;
          p.syncObj(dt);
          continue;
        }
      }
      // stroll the loop
      p.speed = p.walkSpeed;
      p.s += p.dir * p.speed * dt;
      const P = 8 * p.loop.half;
      if (p.s > P) p.s -= P;
      if (p.s < 0) p.s += P;
      this.placeOnLoop(p);
      p.syncObj(dt);
    }
  }

  knockDown(p, seconds) {
    p.state = 'down';
    p.stateTimer = seconds;
    p.speed = 0;
    p.syncObj(0);
  }
}

// ------------------------------------------------------------ the player
export class Player extends Person {
  constructor(gl, spawn) {
    super(gl, { seed: 99, skin: 0xc68863, shirt: 0x0e7c86, pants: 0x274156, cap: 0xe4572e, x: spawn.x, z: spawn.z, heading: spawn.heading });
    this.health = 100;
    this.money = 120;
    this.inCar = null;
  }

  // axes: {forward -1..1, strafe -1..1} in camera space; sprint multiplies
  updateOnFoot(dt, axes, camHeading, sprint, colliders) {
    const fx = Math.sin(camHeading), fz = Math.cos(camHeading);
    const rx = -Math.cos(camHeading), rz = Math.sin(camHeading);
    let mx = fx * axes.forward + rx * axes.strafe;
    let mz = fz * axes.forward + rz * axes.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.05) {
      mx /= len; mz /= len;
      const top = sprint ? 8.4 : 5.0;
      this.speed = top;
      const want = Math.atan2(mx, mz);
      this.heading += clamp(angleDelta(this.heading, want), -12 * dt, 12 * dt);
      let nx = this.x + mx * top * dt;
      let nz = this.z + mz * top * dt;
      [nx, nz] = collideBuildings(colliders, nx, nz, 0.5);
      this.x = nx;
      this.z = nz;
    } else {
      this.speed = 0;
    }
    if (this.punchTimer > 0) this.punchTimer -= dt;
    this.syncObj(dt);
  }

  startPunch() {
    if (this.punchTimer <= 0) {
      this.punchTimer = 0.28;
      return true;
    }
    return false;
  }
}
