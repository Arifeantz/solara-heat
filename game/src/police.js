// police.js — the Solana Police Department: the wanted level, and the
// cruisers that answer it.
//
// Offences feed a heat score; heat becomes stars. Police spawn away from the
// player's sight and hunt the last position any officer actually saw, so
// breaking line of sight — ducking behind towers, outrunning the search —
// lets the heat bleed away. An officer who corners a slow or on-foot player
// fills the bust meter; fill it and the run ends at the station.

import { Car } from './vehicles.js';
import { GRID_LINES, collideBuildings } from './city.js';
import { Rng, clamp, angleDelta, dist2d } from './random.js';

const STAR_THRESHOLDS = [0, 1, 45, 95, 155, 230];

export function losBlocked(colliders, ax, az, bx, bz) {
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const c of colliders) {
      if (x > c.minX + 1 && x < c.maxX - 1 && z > c.minZ + 1 && z < c.maxZ - 1) return true;
    }
  }
  return false;
}

export class WantedSystem {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.hiddenTime = 0;
    this.bustProgress = 0;
    this.lastOffenceAt = -99;
  }

  commitOffence(points, now) {
    this.heat = Math.min(320, this.heat + points);
    this.lastOffenceAt = now;
    this.recount();
  }

  recount() {
    let s = 0;
    for (let i = 1; i < STAR_THRESHOLDS.length; i++) {
      if (this.heat >= STAR_THRESHOLDS[i]) s = i;
    }
    this.stars = s;
  }

  // seenByPolice: whether any officer currently has eyes on the player
  update(dt, seenByPolice, now) {
    if (this.stars === 0) {
      this.heat = Math.max(0, this.heat - 20 * dt);
      this.bustProgress = Math.max(0, this.bustProgress - dt * 0.7);
      return;
    }
    if (seenByPolice) {
      this.hiddenTime = 0;
    } else {
      this.hiddenTime += dt;
      const grace = this.stars >= 3 ? 7 : 4.5;
      if (this.hiddenTime > grace && now - this.lastOffenceAt > 5) {
        this.heat -= (5 + this.stars * 1.6) * dt;
        if (this.heat < 0) this.heat = 0;
        this.recount();
      }
    }
    if (!seenByPolice) this.bustProgress = Math.max(0, this.bustProgress - dt * 0.5);
  }
}

const intersections = [];
for (const gx of GRID_LINES) for (const gz of GRID_LINES) intersections.push({ x: gx, z: gz });

export class PoliceSystem {
  constructor(gl, world) {
    this.gl = gl;
    this.world = world;
    this.cars = [];
    this.rng = new Rng(31337);
    this.lastKnown = null;
    this.lastKnownAt = -99;
    this.spawnCooldown = 0;
  }

  desiredCount(stars) {
    return stars; // one cruiser a star, up to five
  }

  spawnPoint(player) {
    // an intersection 90-140 m away, so cruisers arrive, never pop in
    const options = intersections.filter((n) => {
      const d = dist2d(player.x, player.z, n.x, n.z);
      return d > 85 && d < 150;
    });
    const hq = this.world.landmarks.police;
    const n = options.length ? this.rng.pick(options) : { x: hq.x, z: hq.z };
    return n;
  }

  update(dt, player, wanted, colliders, now) {
    const target = this.desiredCount(wanted.stars);
    this.spawnCooldown -= dt;
    if (this.cars.length < target && this.spawnCooldown <= 0) {
      const spot = this.spawnPoint(player);
      const car = new Car(this.gl, 'sedan', 0xffffff, spot.x, spot.z, 0, { police: true, driver: 'police' });
      car.fromNode = spot;
      car.toNode = spot;
      this.cars.push(car);
      this.spawnCooldown = 2.5;
    }
    if (this.cars.length > target) {
      // the farthest cruiser gives up and peels away
      let far = null, fd = -1;
      for (const c of this.cars) {
        const d = dist2d(c.x, c.z, player.x, player.z);
        if (d > fd) { fd = d; far = c; }
      }
      if (far && (fd > 60 || wanted.stars === 0)) {
        far.obj.visible = false;
        this.cars.splice(this.cars.indexOf(far), 1);
      }
    }

    // shared eyes: if any cruiser sees the player, all know where he is
    let anySee = false;
    for (const c of this.cars) {
      const d = dist2d(c.x, c.z, player.x, player.z);
      if (d < 60 && !losBlocked(colliders, c.x, c.z, player.x, player.z)) {
        anySee = true;
        break;
      }
    }
    if (anySee) {
      this.lastKnown = { x: player.x, z: player.z };
      this.lastKnownAt = now;
    }
    const memory = now - this.lastKnownAt < 6 ? this.lastKnown : null;

    for (const car of this.cars) {
      this.drivePolice(car, dt, player, memory, colliders);
    }
    return anySee;
  }

  drivePolice(car, dt, player, memory, colliders) {
    const hunt = memory || player; // without a sighting they still converge on the player area slowly
    const distToPlayer = dist2d(car.x, car.z, player.x, player.z);
    let aimX, aimZ, cruise;
    if (memory && distToPlayer < 36) {
      // close pursuit: straight at the player, ready to ram
      aimX = player.x;
      aimZ = player.z;
      cruise = 27;
    } else {
      // road pursuit: pick the neighbouring intersection that closes in
      const to = car.toNode || car.fromNode;
      const arrived = dist2d(car.x, car.z, to.x, to.z) < 9;
      if (arrived || !car.toNode) {
        const from = to;
        const options = intersections.filter(
          (n) => (n.x === from.x || n.z === from.z) && n !== from &&
            Math.abs(n.x - from.x) + Math.abs(n.z - from.z) === 90,
        );
        let best = options[0], bd = Infinity;
        for (const n of options) {
          const d = dist2d(n.x, n.z, hunt.x, hunt.z);
          if (d < bd) { bd = d; best = n; }
        }
        car.fromNode = from;
        car.toNode = best || from;
      }
      aimX = car.toNode.x;
      aimZ = car.toNode.z;
      cruise = memory ? 24 : 15;
    }
    const want = Math.atan2(aimX - car.x, aimZ - car.z);
    const delta = angleDelta(car.heading, want);
    car.steer = clamp(delta * 1.8, -0.6, 0.6);
    car.heading += car.steer * dt * clamp(Math.abs(car.speed) / 6, 0.4, 1.7) * Math.sign(car.speed || 1);
    const accel = cruise > car.speed ? 15 : 20;
    car.speed += clamp(cruise - car.speed, -accel * dt, accel * dt);
    const [fx, fz] = car.forward();
    let nx = car.x + fx * car.speed * dt;
    let nz = car.z + fz * car.speed * dt;
    [nx, nz] = collideBuildings(colliders, nx, nz, 1.7);
    if ((nx !== car.x + fx * car.speed * dt || nz !== car.z + fz * car.speed * dt) && Math.abs(car.speed) > 8) {
      car.speed = -car.speed * 0.2;
      car.stuckTimer = 0.6;
    }
    if (car.stuckTimer > 0) {
      car.stuckTimer -= dt;
      car.speed = -6; // back out of whatever they hit
      nx = car.x - fx * 6 * dt;
      nz = car.z - fz * 6 * dt;
    }
    car.x = nx;
    car.z = nz;
    car.syncObj();
  }

  nearestDistance(player) {
    let d = Infinity;
    for (const c of this.cars) d = Math.min(d, dist2d(c.x, c.z, player.x, player.z));
    return d;
  }
}
