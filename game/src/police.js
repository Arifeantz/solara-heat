// police.js — the law in Port Solana: eyes, heat, and cruisers.
//
// losBlocked is the town's eyesight rule: a straight segment between
// two ground points is blocked when it passes through any building's
// box. WantedSystem turns offences into heat and heat into stars —
// and lets heat die when nobody has seen Dario for a while, which is
// why breaking line of sight is the whole art of the getaway.
//
// PoliceSystem runs the fleet. Cruisers live in a small pool: they
// wait at the HQ forecourt when the town is quiet, roll out as the
// stars rise, hunt the last place they actually saw the player, and
// search the avenues when they lose him. At four stars and above
// they stop only chasing: two of them park across an intersection
// ahead and make a wall of the road.

import { Car } from './vehicles.js';
import { GRID_LINES, collideBuildings } from './city.js';
import { Rng, clamp, angleDelta, dist2d } from './random.js';

// ------------------------------------------------------------ eyesight
//
// Segment against axis-aligned boxes, by the slab method: clip the
// segment's parameter range against each box's x and z slabs; if
// anything of the segment survives inside a box, the view is blocked.
export function losBlocked(colliders, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  for (const c of colliders) {
    let t0 = 0;
    let t1 = 1;
    // the x slab
    if (Math.abs(dx) < 1e-9) {
      if (ax < c.minX || ax > c.maxX) continue;
    } else {
      let ta = (c.minX - ax) / dx;
      let tb = (c.maxX - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // the z slab
    if (Math.abs(dz) < 1e-9) {
      if (az < c.minZ || az > c.maxZ) continue;
    } else {
      let ta = (c.minZ - az) / dz;
      let tb = (c.maxZ - az) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    return true; // some of the segment lives inside this box
  }
  return false;
}

// ------------------------------------------------------------ the heat

const STAR_THRESHOLDS = [8, 30, 60, 95, 130];

export class WantedSystem {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.bustProgress = 0;
    this.lastSeenAt = -Infinity;
    this.lastOffenceAt = -Infinity;
  }

  // an offence lands: heat rises now, and the decay clock restarts
  commitOffence(amount, now) {
    this.heat = Math.min(170, this.heat + amount);
    this.lastOffenceAt = now;
    this.recount();
  }

  recount() {
    let stars = 0;
    for (const t of STAR_THRESHOLDS) if (this.heat >= t) stars++;
    this.stars = stars;
  }

  // seen: whether any cruiser's eyes are on the player this frame
  update(dt, seen, now) {
    if (seen) this.lastSeenAt = now;
    const quietFor = now - Math.max(this.lastSeenAt, this.lastOffenceAt);
    if (quietFor > 5 && this.heat > 0) {
      // heat dies in the open air: roughly five points a second
      // once the town has stopped looking at you for five seconds
      this.heat = Math.max(0, this.heat - dt * 5);
      this.recount();
    }
    if (!seen && this.bustProgress > 0) {
      this.bustProgress = Math.max(0, this.bustProgress - dt / 3.2);
    }
  }
}

// ------------------------------------------------------------ the fleet

const MAX_CRUISERS = 5;

export class PoliceSystem {
  constructor(gl, world) {
    this.gl = gl;
    this.world = world;
    this.cars = [];
    this.roadblock = [];
    this.lastKnown = null;
    this.rng = new Rng(31337);
    this.blockCooldown = 0;
    this.spawnTimer = 0;
  }

  nearestDistance(pos) {
    let best = Infinity;
    for (const c of this.cars) {
      const d = dist2d(c.x, c.z, pos.x, pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  // a fresh cruiser, or a quiet one pressed back into service
  _obtainCruiser(pos) {
    // prefer a car that is far away or parked at the depot: it can
    // be repositioned without the player watching it pop
    let spare = null;
    for (const c of this.cars) {
      if (c.mode === 'chase' || c.mode === 'block') continue;
      if (dist2d(c.x, c.z, pos.x, pos.z) > 80) { spare = c; break; }
      if (!spare) spare = c;
    }
    if (!spare && this.cars.length < MAX_CRUISERS) {
      spare = new Car(this.gl, 'sedan', 0xffffff, 0, 0, 0, { police: true, driver: 'police' });
      this.cars.push(spare);
    }
    return spare;
  }

  // where cruisers enter the hunt: on an avenue, a good run away
  _spawnPoint(pos) {
    const rng = this.rng;
    for (let tries = 0; tries < 8; tries++) {
      const vertical = rng.chance(0.5);
      const line = rng.pick(GRID_LINES);
      const along = clamp((vertical ? pos.z : pos.x) + rng.range(95, 145) * rng.sign(), -244, 244);
      const x = vertical ? line - LANE_SIGN(pos, vertical, line) : along;
      const z = vertical ? along : line - LANE_SIGN(pos, vertical, line);
      if (dist2d(x, z, pos.x, pos.z) > 80) return { x, z };
    }
    return null;
  }

  _sendToDepot(car) {
    car.mode = 'depot';
    const hq = this.world.landmarks.police || { x: 0, z: -200 };
    car.depotSpot = {
      x: hq.x + this.rng.range(-16, 16),
      z: hq.z + this.rng.range(2, 10),
    };
  }

  // stand two cruisers across an intersection in front of the hunt:
  // the crossing nearest the player that is still a real run ahead
  _raiseRoadblock(pos) {
    let best = null;
    let bestD = Infinity;
    for (const gx of GRID_LINES) {
      for (const gz of GRID_LINES) {
        const d = dist2d(gx, gz, pos.x, pos.z);
        if (d > 42 && d < bestD) { bestD = d; best = { x: gx, z: gz }; }
      }
    }
    if (!best) return;
    const blockers = [];
    for (const c of this.cars) {
      if (c.mode === 'chase' && blockers.length < 2) blockers.push(c);
    }
    while (blockers.length < 2) {
      const c = this._obtainCruiser(pos);
      if (!c) break;
      blockers.push(c);
    }
    if (blockers.length < 2) return;
    // park them broadside across the avenue that runs along z at
    // this crossing, noses east, a car's width apart
    blockers[0].x = best.x - 2.3;
    blockers[0].z = best.z;
    blockers[1].x = best.x + 2.3;
    blockers[1].z = best.z;
    for (const c of blockers) {
      c.mode = 'block';
      c.heading = Math.PI / 2;
      c.speed = 0;
      c.syncObj();
      this.roadblock.push(c);
    }
    this.blockCooldown = 14;
  }

  _dropRoadblock() {
    for (const c of this.roadblock) {
      if (c.mode === 'block') c.mode = 'chase';
    }
    this.roadblock.length = 0;
  }

  // the frame's work. pos: the player's ground position. Returns
  // true when at least one cruiser has eyes on the player.
  update(dt, pos, wanted, colliders, now) {
    void now;
    this.blockCooldown -= dt;
    this.spawnTimer -= dt;
    let seen = false;

    // a cruiser handed to the system without orders (the photo-mode
    // staging does exactly that) is simply on the hunt
    for (const c of this.cars) {
      if (!c.mode) c.mode = 'chase';
    }

    // ---- eyes: who can see the player right now?
    for (const c of this.cars) {
      c.seesPlayer = false;
      if (c.mode !== 'chase' && c.mode !== 'block') continue;
      const d = dist2d(c.x, c.z, pos.x, pos.z);
      if (d < 78 && !losBlocked(colliders, c.x, c.z, pos.x, pos.z)) {
        c.seesPlayer = true;
        seen = true;
      }
    }
    if (seen) this.lastKnown = { x: pos.x, z: pos.z };

    // ---- the roadblock: raise it at four stars, drop it when the
    // heat or the chase has moved on
    if (wanted.stars >= 4 && this.roadblock.length === 0 && this.blockCooldown <= 0) {
      this._raiseRoadblock(pos);
    }
    if (this.roadblock.length > 0) {
      const anchor = this.roadblock[0];
      if (wanted.stars < 3 || dist2d(anchor.x, anchor.z, pos.x, pos.z) > 175) {
        this._dropRoadblock();
      }
    }

    // ---- staffing: the stars decide how many cruisers hunt
    const hunting = this.cars.filter((c) => c.mode === 'chase' || c.mode === 'block').length;
    if (hunting < wanted.stars && this.spawnTimer <= 0) {
      const c = this._obtainCruiser(pos);
      if (c) {
        const spot = this._spawnPoint(pos);
        if (spot && dist2d(c.x, c.z, pos.x, pos.z) > 80) {
          c.x = spot.x;
          c.z = spot.z;
        }
        c.mode = 'chase';
        c.memory = this.lastKnown ? { ...this.lastKnown } : null;
        this.spawnTimer = 1.2;
      }
    }
    if (wanted.stars === 0) {
      for (const c of this.cars) {
        if (c.mode === 'chase') this._sendToDepot(c);
      }
      if (this.roadblock.length > 0) this._dropRoadblock();
    }

    // ---- drive every cruiser
    for (const c of this.cars) {
      if (c.mode === 'block') {
        c.speed = 0;
        c.syncObj();
        continue;
      }
      if (c.mode === 'depot') {
        // roll home to the HQ forecourt and park
        const spot = c.depotSpot || this.world.landmarks.police || { x: 0, z: -200 };
        if (dist2d(c.x, c.z, spot.x, spot.z) < 3) {
          c.speed = 0;
          c.syncObj();
          continue;
        }
        this._driveToward(c, spot, dt, colliders, 11);
        continue;
      }
      // chase: eyes on the player refresh the memory; without them
      // the cruiser runs to the last known place and then searches
      if (c.seesPlayer) c.memory = { x: pos.x, z: pos.z };
      let target = c.memory;
      if (!target) {
        // never saw him: quarter the avenues at a patrol pace
        if (!c.patrol || dist2d(c.x, c.z, c.patrol.x, c.patrol.z) < 9) {
          c.patrol = {
            x: this.rng.pick(GRID_LINES),
            z: this.rng.pick(GRID_LINES),
          };
        }
        target = c.patrol;
      }
      const d = dist2d(c.x, c.z, target.x, target.z);
      const pace = c.seesPlayer ? 1.05 : 0.8;
      const arrive = c.seesPlayer ? 3.2 : 6;
      this._driveToward(c, target, dt, colliders, c.spec.maxSpeed * pace, d < arrive + 4 ? Math.max(0, (d - arrive)) * 1.4 : Infinity);
      if (!c.seesPlayer && d < 7 && c.memory) {
        // reached the last known place and he is not here: the
        // memory is spent, fall back to searching
        c.memory = null;
      }
    }

    // ---- separation: cruisers do not share a bonnet
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        const d = dist2d(a.x, a.z, b.x, b.z);
        if (d > 0.01 && d < 3.4) {
          const push = (3.4 - d) / 2;
          const nx = (b.x - a.x) / d, nz = (b.z - a.z) / d;
          if (a.mode !== 'block') { a.x -= nx * push; a.z -= nz * push; }
          if (b.mode !== 'block') { b.x += nx * push; b.z += nz * push; }
        }
      }
    }
    return seen;
  }

  // steer one cruiser toward a ground point at up to `pace` speed,
  // easing to `easeTo` when close if a cap is given
  _driveToward(car, target, dt, colliders, pace, easeTo = Infinity) {
    const want = Math.atan2(target.x - car.x, target.z - car.z);
    const turn = clamp(angleDelta(car.heading, want), -2.3 * dt, 2.3 * dt);
    car.heading += turn;
    let speed = pace;
    if (easeTo !== Infinity) speed = Math.min(speed, easeTo);
    // a car badly off the target's line slows to make the turn
    if (Math.abs(angleDelta(car.heading, want)) > 1.1) speed = Math.min(speed, 6);
    const accel = speed > car.speed ? car.spec.accel * 0.9 : 18;
    car.speed += clamp(speed - car.speed, -accel * dt, accel * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const fixed = collideBuildings(colliders, car.x, car.z, 1.7);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      car.x = fixed.x;
      car.z = fixed.z;
      car.speed *= 0.35;
    }
    car.steerVis = clamp(turn * 2.2, -0.4, 0.4);
    car.syncObj();
  }
}

// which side of an avenue the entering cruiser belongs on is a
// detail the spawn can afford to be casual about — it joins the
// hunt from a standstill of nobody's attention — but it should at
// least start on the road, so the offset is one lane, signed by
// which side of the player it is coming from
function LANE_SIGN(pos, vertical, line) {
  const across = vertical ? pos.x : pos.z;
  return (across - line) >= 0 ? -3.3 : 3.3;
}
