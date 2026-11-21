// taxi.js — CabCo: the side work that lives in Dario's pocket.
//
// Marina's missions are the story; this is the rent. Press T behind any
// wheel and the CabCo dispatch answers: a named passenger is waiting at
// a named place, waving at the kerb. Stop beside them and they climb in;
// drive them to their destination before the meter of their patience
// runs out and the fare is yours — with a tip that shrinks as the clock
// does, and vanishes entirely if you terrify them on the way.
//
// The system is deliberately a guest in the world main.js built: it
// borrows the landmarks for its addresses, a Person for its passenger,
// and hooks for everything it must not own — the story banners, the
// toasts, the money, the scene graph and the sounds.

import { Person } from './people.js';
import { Rng, clamp, dist2d } from './random.js';

// The dispatcher's address book: every landmark with a name a passenger
// could plausibly say out loud. Built per system from the world, so new
// districts join the book the day they open.
function addressBook(world) {
  const book = [];
  for (const key of Object.keys(world.landmarks)) {
    const L = world.landmarks[key];
    if (L && typeof L.x === 'number' && L.name) {
      book.push({ key, x: L.x, z: L.z, name: L.name });
    }
  }
  return book;
}

const NAMES = [
  'Priya', 'Marco', 'Old Henrik', 'Sister Ana', 'Coach Ruiz', 'Lena',
  'Tomás', 'Aunt Rosa', 'Ferry Fred', 'Doc Marta', 'Young Iker', 'Mrs. Vane',
];

const GREETINGS = [
  'You are a lifesaver. The bus never came. The bus is a rumour here.',
  'CabCo said four minutes. That was twenty minutes ago. Drive, friend.',
  'Mind the kerb on the way out — everyone minds the kerb too late.',
  'I have been waving at cars for ten minutes. You are the first to stop.',
];

const THANKS = [
  'Fast and smooth. Take the tip, you have earned every cent.',
  'Wonderful. My sister said nobody drives well in this town. Wrong.',
  'Here — and keep the change I was going to spend on patience.',
  'Five stars. I would give six but the app is strict.',
];

const COMPLAINTS = [
  'That was… an experience. The fare is on the seat. All of it. Sadly.',
  'I saw my whole life twice. Once per roundabout.',
  'No tip. The tip is going toward a helmet.',
];

const SMALLTALK = [
  'You know the clock tower on the Heights still says twenty past four? It has said it since before I was born. Comforting, somehow.',
  'My cousin drives for CabCo too. Different cousin. Different cab. Same opinions about the roundabout.',
  'The bus was supposed to come at nine. It is a very philosophical bus route, this town runs.',
  'I studied at the Heights, years ago. The founder statue pointed at the sea then too. Nobody has told him.',
  'If we pass the marina, wave at the crane for me. It has held that crate since spring. Dedication.',
];

const DISPATCH_LINES = [
  'CabCo dispatch. Fare on the board, driver — details on your screen.',
  'Dispatch here. Somebody patient is about to meet somebody punctual.',
  'One fare, no luggage, pays in cash and gratitude. It is yours.',
];

export class CabCo {
  constructor(gl, world, hooks) {
    this.gl = gl;
    this.world = world;
    this.hooks = hooks;
    this.rng = new Rng(90210);
    this.book = addressBook(world);
    // state: idle | pickup (passenger waiting) | carrying (aboard)
    this.state = 'idle';
    this.cooldown = 6; // a breath before the first fare can be taken
    this.passenger = null; // the Person waiting at the kerb, if any
    this.passengerName = '';
    this.from = null; // address-book entry where they wait
    this.to = null; // address-book entry they want
    this.fare = 0;
    this.tipPool = 0;
    this.timer = 0; // patience left, once carrying
    this.timerExpired = false;
    this.boardHealth = 100;
    this.terrified = false;
    this.complained = false;
    this.deck = []; // shuffled destinations, dealt without repeats
    this.lastCtx = null;
  }

  // ------------------------------------------------------------ offers

  // Deal the next destination from the shuffled deck, refilling and
  // reshuffling when it runs out, so fares tour the whole city.
  dealDestination(notKey) {
    for (;;) {
      if (this.deck.length === 0) {
        this.deck = this.rng.shuffle(this.book.slice());
      }
      const entry = this.deck.pop();
      if (entry.key !== notKey) return entry;
      // the same place as the pickup: put it back at the bottom and
      // take the next card instead (the deck always has another)
      this.deck.unshift(entry);
      if (this.deck.length > 1) continue;
      return entry;
    }
  }

  // The T key. Only a driver can take a fare; dispatch says so plainly.
  requestFare() {
    if (this.state !== 'idle') {
      this.hooks.toast('CabCo: you already have a fare on the board.');
      return;
    }
    if (this.cooldown > 0) {
      this.hooks.toast('CabCo: dispatch is finding you a fare…');
      return;
    }
    const ctx = this.lastCtx;
    if (!ctx || !ctx.inCar) {
      this.hooks.toast('CabCo: fares are for drivers. Find a car first.');
      return;
    }
    // the pickup is somewhere a person could wait: never the place the
    // player already is, or the fare would be over before it began
    let from = null;
    for (let tries = 0; tries < 6; tries++) {
      const candidate = this.rng.pick(this.book);
      if (dist2d(ctx.x, ctx.z, candidate.x, candidate.z) > 45) { from = candidate; break; }
      from = candidate;
    }
    const to = this.dealDestination(from.key);
    this.from = from;
    this.to = to;
    this.passengerName = this.rng.pick(NAMES);
    const p = new Person(this.gl, {
      seed: this.rng.int(1, 99999),
      x: from.x + 2.5,
      z: from.z + 1.5,
      heading: Math.PI,
    });
    p.state = 'walk';
    p.speed = 0;
    this.passenger = p;
    this.hooks.addToScene(p.obj);
    this.state = 'pickup';
    this.hooks.ringPhone();
    this.hooks.showStory([
      ['CabCo Dispatch', this.rng.pick(DISPATCH_LINES)],
      ['CabCo Dispatch', `${this.passengerName} is waiting at ${from.name}, heading for ${to.name}. The meter is their patience.`],
    ]);
  }

  // ------------------------------------------------------------ text

  objectiveText() {
    if (this.state === 'pickup') {
      return `CabCo fare — pick up ${this.passengerName} at ${this.from.name}`;
    }
    if (this.state === 'carrying') {
      const tip = this.currentTip();
      return `CabCo fare — take ${this.passengerName} to ${this.to.name} · $${this.fare}` +
        (tip > 0 ? ` + $${tip} tip` : ' · the tip is gone');
    }
    return '';
  }

  marker() {
    if (this.state === 'pickup' && this.from) {
      return { x: this.from.x, z: this.from.z, label: this.passengerName };
    }
    if (this.state === 'carrying' && this.to) {
      return { x: this.to.x, z: this.to.z, label: this.to.name };
    }
    return null;
  }

  timeLeft() {
    return this.state === 'carrying' ? Math.max(0, this.timer) : null;
  }

  currentTip() {
    if (this.state !== 'carrying' || this.terrified || this.timerExpired) return 0;
    // the tip bleeds away with the patience: full pool at the start of
    // the ride, nothing left when the clock dies
    const frac = clamp(this.timer / this.parTime, 0, 1);
    return Math.round(this.tipPool * frac);
  }

  // ------------------------------------------------------------ events

  board(ctx) {
    const p = this.passenger;
    if (p) {
      this.hooks.removeFromScene(p.obj);
      this.passenger = null;
    }
    const ride = dist2d(this.from.x, this.from.z, this.to.x, this.to.z);
    this.fare = Math.round(10 + ride * 0.5);
    this.tipPool = Math.round(this.fare * 0.5);
    this.parTime = 26 + ride / 9;
    this.timer = this.parTime * 1.7;
    this.timerExpired = false;
    this.terrified = false;
    this.complained = false;
    this.boardHealth = ctx.car ? ctx.car.health : 100;
    this.chatterIn = 7 + this.rng.range(0, 6); // small talk, on a timer
    this.state = 'carrying';
    this.hooks.doorSlam();
    this.hooks.showStory([[this.passengerName, this.rng.pick(GREETINGS)]]);
  }

  complete(ctx) {
    const tip = this.currentTip();
    // loyalty: every fifth clean fare, dispatch adds a quiet bonus —
    // regulars are the whole business, and CabCo knows it
    this.faresDone = (this.faresDone || 0) + 1;
    const loyalty = this.faresDone % 5 === 0 && !this.terrified && !this.timerExpired ? 25 : 0;
    const total = this.fare + tip + loyalty;
    const scared = this.terrified || this.timerExpired;
    this.hooks.onFare(total, this.fare, tip + loyalty);
    if (scared) {
      this.hooks.showStory([[this.passengerName, this.rng.pick(COMPLAINTS)]]);
    } else if (ctx.wanted >= 3) {
      // they pay the fare — heroes and fugitives both get paid — but a
      // passenger who watched a police chase keeps the tip for bail
      this.hooks.showStory([[this.passengerName, 'Keep the fare. If anyone asks, I walked. I always walk.']]);
    } else {
      this.hooks.showStory([[this.passengerName, this.rng.pick(THANKS)]]);
    }
    this.reset(14 + this.rng.range(0, 14));
  }

  // The run ended (busted, wasted) or the driver walked away mid-fare:
  // the passenger climbs out wherever the car stopped and the board
  // clears. No fare, no hard feelings the dispatcher will admit to.
  cancel(silent = false) {
    if (this.passenger) {
      this.hooks.removeFromScene(this.passenger.obj);
      this.passenger = null;
    }
    if (this.state !== 'idle' && !silent) {
      this.hooks.toast('CabCo: fare lost. Dispatch has noted the silence.');
    }
    this.reset(10);
  }

  reset(cooldown) {
    this.state = 'idle';
    this.cooldown = cooldown;
    this.from = null;
    this.to = null;
    this.fare = 0;
    this.tipPool = 0;
    this.timer = 0;
  }

  // ------------------------------------------------------------ the loop

  // ctx: {x, z, inCar, car, wanted, now} — the same shape missions take
  update(dt, ctx) {
    this.lastCtx = ctx;
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.state === 'pickup') {
      const p = this.passenger;
      if (p) {
        // wave at every car that passes; one of them is the cab
        p.waveTimer = Math.max(p.waveTimer, 0.25);
        p.speed = 0;
        p.syncObj(dt);
      }
      if (ctx.inCar && ctx.car && Math.abs(ctx.car.speed) < 1.2 &&
          dist2d(ctx.x, ctx.z, this.from.x, this.from.z) < 7) {
        this.board(ctx);
      }
      return;
    }

    if (this.state === 'carrying') {
      if (!ctx.inCar) {
        // a driver who abandons the car abandons the fare
        this.cancel();
        return;
      }
      if (!this.timerExpired) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = 0;
          this.timerExpired = true;
          this.hooks.showStory([[this.passengerName, 'I could have walked. I want that noted. I could have walked.']]);
        }
      }
      if (!this.terrified && ctx.car && ctx.car.health < this.boardHealth - 25) {
        this.terrified = true;
        this.hooks.showStory([[this.passengerName, 'Eyes on the road! EYES ON THE ROAD! The tip is gone, we are keeping the tip money for repairs.']]);
      }
      if (!this.complained && ctx.wanted >= 2) {
        this.complained = true;
        this.hooks.showStory([[this.passengerName, 'Are those sirens for us? …Should I be lying down back here?']]);
      }
      // small talk: a carried passenger fills a quiet cab the way
      // passengers do — one remark per ride, timed for the middle of it
      if (this.chatterIn > 0) {
        this.chatterIn -= dt;
        if (this.chatterIn <= 0 && !this.terrified) {
          this.hooks.showStory([[this.passengerName, this.rng.pick(SMALLTALK)]]);
        }
      }
      if (ctx.car && Math.abs(ctx.car.speed) < 1.2 &&
          dist2d(ctx.x, ctx.z, this.to.x, this.to.z) < 9) {
        this.complete(ctx);
      }
    }
  }
}
