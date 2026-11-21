// random.js — a small seeded random generator.
//
// The city of Port Solana is generated from a fixed seed so every visit (and
// every screenshot) shows the same streets; gameplay variety uses its own
// streams so the layout never shifts under the player.

export class Rng {
  constructor(seed) {
    this.state = seed >>> 0 || 1;
  }
  next() {
    // mulberry32: tiny, fast, good enough for placing buildings and palms
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  chance(p) {
    return this.next() < p;
  }
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// shortest signed angular difference from a to b, in radians
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
