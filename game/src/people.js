// people.js — the population of Port Solana, and Dario himself.
//
// A Person is a small articulated figure built from boxes: a torso
// and head baked into one mesh, arms and legs hung on pivot objects
// at the shoulders and hips so they can swing. syncObj(dt) poses the
// figure from its state — walking swings the limbs against each
// other, a raised waveTimer lifts one arm and wags it, a punchTimer
// (the Player's) drives a jab, and 'down' lays the whole figure on
// the ground. Colours come from the person's seed, so the same crowd
// shows up at every boot.
//
// Pedestrians is the crowd system: it deals its people around the
// world's sidewalk loops and walks them the perimeters, hurrying
// away from threats. Player is Dario: a Person with money, health,
// a car he may be sitting in, and feet that answer the keyboard.

import { GeoBuilder, Obj, hexColor } from './engine.js';
import { collideBuildings } from './city.js';
import { Rng, clamp, angleDelta, dist2d } from './random.js';

const SKIN_TONES = [0xf2c09a, 0xd99e6a, 0xa96f3f, 0x7a4a28, 0xffe0bd];
const SHIRTS = [
  0xe4572e, 0x2a9d8f, 0x457b9d, 0xe9c46a, 0xf2f0eb, 0xbc4749,
  0x606c38, 0x9a86c8, 0xf7a072, 0x264653, 0xff8fab, 0x51e07a,
];
const PANTS = [0x2b2d42, 0x4a4e69, 0x6b705c, 0x8a6b45, 0x3a506b, 0x22262b, 0x7d8597];

// ------------------------------------------------------------ one person

export class Person {
  constructor(gl, opts = {}) {
    const rng = new Rng(opts.seed || 1);
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.state = 'walk'; // 'walk' | 'down'
    this.speed = 0;
    this.walkPhase = rng.range(0, Math.PI * 2);
    this.animT = 0;
    this.waveTimer = 0;
    this.punchTimer = 0;
    this.downTime = 0;
    this.shirt = opts.shirt !== undefined ? opts.shirt : rng.pick(SHIRTS);
    this.pants = opts.pants !== undefined ? opts.pants : rng.pick(PANTS);
    this.skin = opts.skin !== undefined ? opts.skin : rng.pick(SKIN_TONES);
    this.obj = this._buildFigure(gl);
    this.syncObj(0);
  }

  _buildFigure(gl) {
    const group = new Obj();
    const skin = hexColor(this.skin);
    const shirt = hexColor(this.shirt);
    const pants = hexColor(this.pants);
    // torso and head in one baked mesh, origin at the feet
    const core = new GeoBuilder();
    core.box(0, 1.24, 0, 0.46, 0.64, 0.25, shirt); // the torso
    core.box(0, 1.6, 0, 0.13, 0.1, 0.13, skin); // the neck
    core.box(0, 1.79, 0, 0.25, 0.28, 0.26, skin); // the head
    core.box(0, 1.95, 0, 0.27, 0.07, 0.28, hexColor(0x2b2118)); // the hair
    core.box(0, 0.93, 0, 0.4, 0.06, 0.22, pants); // the belt line
    group.add(new Obj(core.build(gl)));
    // limbs on pivots: geometry hangs below each pivot's origin
    const limb = (w, len, color) => {
      const b = new GeoBuilder();
      b.box(0, -len / 2, 0, w, len, w + 0.02, color);
      return b.build(gl);
    };
    this.armL = new Obj(limb(0.13, 0.62, shirt));
    this.armL.pos = [-0.3, 1.52, 0];
    this.armR = new Obj(limb(0.13, 0.62, shirt));
    this.armR.pos = [0.3, 1.52, 0];
    // hands at the arm ends, in the skin tone: swap the arm mesh's
    // lower third by adding a small box child to each arm pivot
    for (const arm of [this.armL, this.armR]) {
      const hand = new GeoBuilder();
      hand.box(0, -0.58, 0, 0.11, 0.14, 0.12, skin);
      arm.add(new Obj(hand.build(gl)));
      group.add(arm);
    }
    this.legL = new Obj(limb(0.16, 0.9, pants));
    this.legL.pos = [-0.11, 0.92, 0];
    this.legR = new Obj(limb(0.16, 0.9, pants));
    this.legR.pos = [0.11, 0.92, 0];
    group.add(this.legL);
    group.add(this.legR);
    return group;
  }

  // pose the figure for this frame: position, heading, limb swing
  syncObj(dt) {
    this.animT += dt;
    if (this.waveTimer > 0) this.waveTimer -= dt;
    if (this.punchTimer > 0) this.punchTimer -= dt;
    const down = this.state === 'down';
    this.obj.pos = [this.x, down ? 0.32 : 0, this.z];
    this.obj.rot = down ? [-Math.PI / 2 + 0.12, this.heading, 0] : [0, this.heading, 0];
    // the walk cycle: legs against each other, arms counter-swinging,
    // everything scaled by how fast the figure is actually moving
    const stride = clamp(Math.abs(this.speed) / 4.5, 0, 1.15);
    this.walkPhase += dt * (2.1 + Math.abs(this.speed) * 1.55) * (this.speed !== 0 ? 1 : 0);
    const swing = Math.sin(this.walkPhase) * 0.55 * stride;
    this.legL.rot[0] = down ? 0.15 : swing;
    this.legR.rot[0] = down ? -0.1 : -swing;
    this.armL.rot[0] = down ? 0.4 : -swing * 0.75;
    // the right arm has two other jobs: waving and punching
    if (this.punchTimer > 0.08) {
      // the jab: out fast at the start of the timer, back by the end
      const out = Math.sin((this.punchTimer / 0.32) * Math.PI);
      this.armR.rot[0] = -1.5 * out;
    } else if (this.waveTimer > 0) {
      this.armR.rot[0] = -2.5 + Math.sin(this.animT * 11) * 0.35;
    } else {
      this.armR.rot[0] = down ? -0.3 : swing * 0.75;
    }
    // a slight bob and lean keep even a slow walk from gliding
    if (!down && this.speed !== 0) {
      this.obj.pos[1] = Math.abs(Math.sin(this.walkPhase)) * 0.045 * stride;
      this.obj.rot[2] = Math.sin(this.walkPhase) * 0.03 * stride;
    } else {
      this.obj.rot[2] = 0;
    }
  }
}

// ------------------------------------------------------------ the crowd

export class Pedestrians {
  constructor(gl, world, count) {
    this.world = world;
    this.list = [];
    const rng = new Rng(8080);
    const loops = world.sidewalkLoops.length ? world.sidewalkLoops : [{ cx: 0, cz: 0, half: 40 }];
    for (let i = 0; i < count; i++) {
      const loop = loops[i % loops.length];
      const p = new Person(gl, {
        seed: rng.int(1, 999999),
        x: loop.cx, z: loop.cz,
        heading: 0,
      });
      // each walker owns a stretch of one loop's perimeter: a
      // distance along it, a direction, a pace, a kerb-side offset
      p.loop = loop;
      p.along = rng.range(0, loop.half * 8);
      p.dir = rng.chance(0.5) ? 1 : -1;
      p.pace = rng.range(1.05, 1.75);
      p.lane = rng.range(-1.3, 1.3);
      p.fleeT = 0;
      p.fleeX = 0;
      p.fleeZ = 0;
      this._placeOnLoop(p);
      this.list.push(p);
    }
  }

  // position a walker from its perimeter distance: the square runs
  // corner to corner, half-size h, in the walker's own direction
  _placeOnLoop(p) {
    const h = p.loop.half;
    const per = h * 8;
    let s = ((p.along % per) + per) % per;
    const side = Math.floor(s / (h * 2));
    const t = s - side * h * 2 - h; // -h..h along the side
    let x, z, hx, hz;
    if (side === 0) { x = t; z = -h; hx = 1; hz = 0; }
    else if (side === 1) { x = h; z = t; hx = 0; hz = 1; }
    else if (side === 2) { x = -t; z = h; hx = -1; hz = 0; }
    else { x = -h; z = -t; hx = 0; hz = -1; }
    // the lane offset leans the walker off the exact line, toward
    // whichever side of the path their direction puts them on
    const lx = -hz * p.lane * p.dir;
    const lz = hx * p.lane * p.dir;
    p.x = p.loop.cx + x + lx;
    p.z = p.loop.cz + z + lz;
    p.heading = Math.atan2(hx * p.dir, hz * p.dir);
  }

  knockDown(p, force) {
    if (p.state === 'down') return;
    p.state = 'down';
    p.downTime = 1.7 + force * 0.4;
    p.speed = 0;
  }

  // after a fright, a walker is off their line: find the nearest
  // point of their loop's perimeter and take up the stroll from
  // there, so calm returns without a visible jump across the square
  _reseat(p) {
    const h = p.loop.half;
    const lx = p.x - p.loop.cx;
    const lz = p.z - p.loop.cz;
    // distance to each side of the square, and the along-track
    // coordinate the nearest point of that side would carry
    const sides = [
      { d: Math.abs(lz + h), s: clamp(lx, -h, h) + h }, // south edge, walked +x
      { d: Math.abs(lx - h), s: h * 2 + clamp(lz, -h, h) + h }, // east edge, +z
      { d: Math.abs(lz - h), s: h * 4 + (h - clamp(lx, -h, h)) }, // north edge, -x
      { d: Math.abs(lx + h), s: h * 6 + (h - clamp(lz, -h, h)) }, // west edge, -z
    ];
    sides.sort((a, b) => a.d - b.d);
    // the perimeter distance is direction-independent: dir only
    // chooses which way along it the walker travels from here
    p.along = sides[0].s;
  }

  // threats: [{x, z, radius}] — things a sensible person hurries
  // away from. playerInfo is accepted for the systems that pass it;
  // the crowd reads the neighbourhood from the threats alone.
  update(dt, threats, playerInfo) {
    void playerInfo;
    for (const p of this.list) {
      if (p.state === 'down') {
        p.downTime -= dt;
        if (p.downTime <= 0) p.state = 'walk';
        p.syncObj(dt);
        continue;
      }
      // ---- fear: a live threat nearby sets the feet running
      if (p.fleeT > 0) p.fleeT -= dt;
      for (const t of threats || []) {
        if (dist2d(p.x, p.z, t.x, t.z) < t.radius) {
          p.fleeT = 1.1;
          p.fleeX = p.x - t.x;
          p.fleeZ = p.z - t.z;
          const l = Math.hypot(p.fleeX, p.fleeZ) || 1;
          p.fleeX /= l;
          p.fleeZ /= l;
        }
      }
      if (p.fleeT > 0) {
        p.wasFleeing = true;
        p.speed = 4.3;
        p.x += p.fleeX * p.speed * dt;
        p.z += p.fleeZ * p.speed * dt;
        p.heading = Math.atan2(p.fleeX, p.fleeZ);
        const fixed = collideBuildings(this.world.colliders, p.x, p.z, 0.5);
        p.x = fixed.x;
        p.z = fixed.z;
        p.syncObj(dt);
        continue;
      }
      if (p.wasFleeing) {
        // calm again: rejoin the loop where the fright left off
        p.wasFleeing = false;
        this._reseat(p);
      }
      // ---- the ordinary stroll
      p.speed = p.pace;
      p.along += p.pace * p.dir * dt;
      this._placeOnLoop(p);
      p.syncObj(dt);
    }
  }
}

// ------------------------------------------------------------ the player

export class Player extends Person {
  constructor(gl, spawn) {
    super(gl, {
      seed: 4242,
      x: spawn.x,
      z: spawn.z,
      heading: 0,
      shirt: 0xe4572e, // Dario's coral shirt, the one Marina teases
      pants: 0x2b2d42,
      skin: 0xd99e6a,
    });
    this.money = 120;
    this.health = 100;
    this.inCar = null;
  }

  // swing if the arm is free; returns true when a punch really went
  // out (the caller plays the sound and tests the arc)
  startPunch() {
    if (this.punchTimer > 0 || this.state === 'down') return false;
    this.punchTimer = 0.32;
    return true;
  }

  // axes: {mx (strafe right), mz (forward)} in camera space;
  // refAngle is the camera's facing as a heading, so W walks away
  // from the camera however it is turned
  updateOnFoot(dt, axes, refAngle, running, colliders) {
    const fx = Math.sin(refAngle), fz = Math.cos(refAngle);
    const rx = -Math.cos(refAngle), rz = Math.sin(refAngle);
    let mx = fx * axes.mz + rx * axes.mx;
    let mz = fz * axes.mz + rz * axes.mx;
    const mag = Math.hypot(mx, mz);
    if (mag > 0.06) {
      const scale = Math.min(1, mag) / (mag || 1);
      mx *= scale;
      mz *= scale;
      const want = Math.atan2(mx, mz);
      this.heading += clamp(angleDelta(this.heading, want), -11 * dt, 11 * dt);
      this.speed = (running ? 8.4 : 5.1) * Math.min(1, mag);
      this.x += mx * this.speed * dt;
      this.z += mz * this.speed * dt;
      const fixed = collideBuildings(colliders, this.x, this.z, 0.55);
      this.x = fixed.x;
      this.z = fixed.z;
    } else {
      this.speed = 0;
    }
    this.syncObj(dt);
  }
}
