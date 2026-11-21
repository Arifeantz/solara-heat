// random.js — small deterministic numbers for Port Solana.
//
// Everything the city builds with chance — building heights, shirt
// colours, which crate a crane is holding — draws from a seeded Rng
// rather than Math.random, so the town that boots today is the town
// that boots tomorrow: same towers, same crowds, same parked cars.
// The generator is a mulberry32: one 32-bit state word, a fast mix,
// and a period long enough for a whole city's worth of decisions.
//
// The helpers at the bottom (clamp, lerp, angleDelta, dist2d) live
// here because every system in the game reaches for them and none of
// them belongs to any one system.

export class Rng {
  constructor(seed) {
    // fold the seed into the state; a zero state would stick the
    // generator at zero forever, so nudge it off the floor
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  // the raw draw: one float in [0, 1)
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // a float in [lo, hi)
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }

  // an integer in [lo, hi], both ends included
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  // true with probability p
  chance(p) {
    return this.next() < p;
  }

  // +1 or -1, a coin flip
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  // an angle in [0, 2π)
  angle() {
    return this.next() * Math.PI * 2;
  }

  // one element of an array, chosen at random
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  // a shuffled copy of the array (Fisher–Yates, from the tail in)
  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

// hold v inside [lo, hi]
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// the point t of the way from a to b (t is not clamped: callers may
// extrapolate on purpose)
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// the shortest signed turn from angle a to angle b, in (-π, π]:
// positive means b is reached by turning the way headings increase
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// flat distance between two points on the ground plane
export function dist2d(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}
