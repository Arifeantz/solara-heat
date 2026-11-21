// missions.js — Marina Sol's jobs: the four-mission story of Solara Heat.
//
// Dario Venn washes up in Port Solana with $120 and a duffel bag. Marina,
// who runs Café Solmar, puts him to work: learn the streets, run a package
// off the docks, lift a marked sports car for a buyer, and finally drive the
// coast road to the lighthouse — where the police are waiting. Each mission
// is a marker on the map, a line of story, a cash reward, and a next job.

import { GeoBuilder, Obj, hexColor } from './engine.js';
import { dist2d } from './random.js';

export const MISSION_DEFS = [
  {
    id: 'wheels',
    title: 'First Wheels',
    reward: 50,
    intro: [
      ['Marina', 'Dario. You made it to Port Solana. Hungry? Good — hungry people work.'],
      ['Marina', 'First lesson of this town: nobody walks. Find yourself a car. Any car.'],
    ],
    objective: 'Get into a car — walk up to one and press E',
    done: 'Wheels. Now you are somebody. Come see me about real work.',
  },
  {
    id: 'package',
    title: 'The Dock Run',
    reward: 180,
    intro: [
      ['Marina', 'A crate came in at the docks with my name on it. Customs disagrees.'],
      ['Marina', 'Pick it up at the west docks and bring it to my café. Quick, quiet.'],
    ],
    objective: 'Pick up the package at the docks',
    objective2: 'Deliver the package to Café Solmar',
    done: 'Espresso beans. What did you think it was? Here — you earned it.',
    timeLimit: 170,
  },
  {
    id: 'hotcar',
    title: 'Hot Merchandise',
    reward: 350,
    intro: [
      ['Marina', 'A collector wants the teal Vandal GT parked by the marina lots.'],
      ['Marina', 'Take it to Venn Auto. If its alarm wakes the police — lose them or outrun them.'],
    ],
    objective: 'Steal the marked Vandal GT',
    objective2: 'Deliver the Vandal GT to Venn Auto Repairs',
    done: 'The buyer wired it already. You are getting good at this, Dario.',
  },
  {
    id: 'getaway',
    title: 'Solana Sunset',
    reward: 600,
    intro: [
      ['Marina', 'Last job. Drive out to Solana Point lighthouse. Watch the sunset for me.'],
      ['Marina', 'And Dario… if the police are waiting there, you know what to do. Run.'],
    ],
    objective: 'Drive to the Solana Point lighthouse',
    objective2: 'Lose the heat — break their line of sight',
    objective3: 'Return to Café Solmar',
    done: 'You did it. Port Solana is yours now, Dario. The café is always open to you.',
  },
];

export class Missions {
  constructor(gl, world, hooks) {
    this.world = world;
    this.hooks = hooks;
    this.index = 0; // next mission to run
    this.active = null; // running mission state
    this.completedCount = 0;
    this.storyDone = false;
    // the beacon: a soft column of light over the current objective
    const b = new GeoBuilder();
    b.cylinder(0, 15, 0, 2.2, 2.2, 30, 12, hexColor(0xffc93c));
    this.beacon = new Obj(b.build(gl), { emissive: 0.55, alpha: 0.22 });
    this.beacon.visible = false;
    const ring = new GeoBuilder();
    ring.cylinder(0, 0.3, 0, 3.2, 3.2, 0.6, 16, hexColor(0xffc93c));
    this.beaconRing = new Obj(ring.build(gl), { emissive: 0.7, alpha: 0.5 });
    this.beaconRing.visible = false;
  }

  get currentDef() {
    return this.active ? MISSION_DEFS[this.active.defIndex] : null;
  }

  marker() {
    if (!this.active || !this.active.target) return null;
    return this.active.target;
  }

  objectiveText() {
    if (this.storyDone) return 'Free roam — Port Solana is yours. Steal cars, dodge the SPD, make money.';
    if (!this.active) return '';
    const def = this.currentDef;
    if (this.active.stage === 0) return def.objective;
    if (this.active.stage === 1) return def.objective2 || def.objective;
    return def.objective3 || def.objective;
  }

  startNext() {
    if (this.index >= MISSION_DEFS.length) {
      this.storyDone = true;
      this.hooks.onStoryDone();
      return;
    }
    const def = MISSION_DEFS[this.index];
    this.active = { defIndex: this.index, stage: 0, timer: null, target: null };
    this.hooks.showStory(def.intro);
    this.setStageTarget();
    if (def.id === 'hotcar') this.hooks.spawnMissionCar();
  }

  setStageTarget() {
    const a = this.active;
    const def = this.currentDef;
    const L = this.world.landmarks;
    if (def.id === 'wheels') a.target = null;
    else if (def.id === 'package') a.target = a.stage === 0 ? { ...L.docks, label: 'Package' } : { ...L.cafe, label: 'Café Solmar' };
    else if (def.id === 'hotcar') a.target = a.stage === 0 ? { ...this.hooks.missionCarPos(), label: 'Vandal GT' } : { ...L.garage, label: 'Venn Auto' };
    else if (def.id === 'getaway') {
      if (a.stage === 0) a.target = { ...L.lighthouse, label: 'Lighthouse' };
      else if (a.stage === 1) a.target = null; // lose the heat: no marker, just run
      else a.target = { ...L.cafe, label: 'Café Solmar' };
    }
    this.placeBeacon();
  }

  placeBeacon() {
    const t = this.marker();
    this.beacon.visible = !!t;
    this.beaconRing.visible = !!t;
    if (t) {
      this.beacon.pos = [t.x, 0, t.z];
      this.beaconRing.pos = [t.x, 0, t.z];
    }
  }

  finishMission() {
    const def = this.currentDef;
    this.hooks.showStory([['Marina', def.done]]);
    this.hooks.onReward(def.reward, def.title);
    this.active = null;
    this.index += 1;
    this.completedCount += 1;
    this.placeBeacon();
    this.hooks.saveGame();
    if (this.index < MISSION_DEFS.length) {
      // the next job arrives a few seconds later, by phone
      this.nextJobIn = 6;
    } else {
      this.storyDone = true;
      this.hooks.onStoryDone();
    }
  }

  // ctx: {x, z, inCar, car, wanted, now}
  update(dt, ctx) {
    if (this.nextJobIn !== undefined && this.nextJobIn > 0) {
      this.nextJobIn -= dt;
      if (this.nextJobIn <= 0 && !this.active) this.startNext();
    }
    if (!this.active) return;
    const a = this.active;
    const def = this.currentDef;
    // beacon gently pulses
    if (this.beacon.visible) {
      const s = 1 + Math.sin(ctx.now * 3) * 0.08;
      this.beaconRing.scale = [s, 1, s];
    }
    // mission timer (the dock run's delivery leg)
    if (a.timer !== null && a.timer !== undefined) {
      a.timer -= dt;
      if (a.timer <= 0) {
        a.timer = null;
        a.stage = 0;
        this.setStageTarget();
        this.hooks.showStory([['Marina', 'Too slow — the tide turned. The package is back at the docks.']]);
        return;
      }
    }
    const near = (t, r) => t && dist2d(ctx.x, ctx.z, t.x, t.z) < r;

    if (def.id === 'wheels') {
      if (ctx.inCar) this.finishMission();
      return;
    }
    if (def.id === 'package') {
      if (a.stage === 0 && near(a.target, 6)) {
        a.stage = 1;
        a.timer = def.timeLimit;
        this.setStageTarget();
        this.hooks.showStory([['Dario', 'Got it. Coffee beans, my foot — this crate is heavy.']]);
      } else if (a.stage === 1 && near(a.target, 8)) {
        this.finishMission();
      }
      return;
    }
    if (def.id === 'hotcar') {
      if (a.stage === 0) {
        a.target = { ...this.hooks.missionCarPos(), label: 'Vandal GT' };
        this.placeBeacon();
        if (ctx.inCar && ctx.car && ctx.car.isMissionCar) {
          a.stage = 1;
          this.setStageTarget();
          this.hooks.onCarStolen();
          this.hooks.showStory([['Dario', 'Alarm! Of course there is an alarm.']]);
        }
      } else if (a.stage === 1 && ctx.inCar && ctx.car && ctx.car.isMissionCar && near(a.target, 9)) {
        this.finishMission();
      }
      return;
    }
    if (def.id === 'getaway') {
      if (a.stage === 0 && near(a.target, 12)) {
        a.stage = 1;
        this.setStageTarget();
        this.hooks.onAmbush();
        this.hooks.showStory([
          ['Dario', 'Blue lights. It was never about a sunset.'],
          ['Marina (phone)', 'Then give them a run they will remember. Lose them, Dario!'],
        ]);
      } else if (a.stage === 1 && ctx.wanted === 0) {
        a.stage = 2;
        this.setStageTarget();
        this.hooks.showStory([['Dario', 'Clear. Time to go home.']]);
      } else if (a.stage === 2 && near(a.target, 8)) {
        this.finishMission();
      }
    }
  }

  timeLeft() {
    if (this.active && this.active.timer !== null && this.active.timer !== undefined) {
      return Math.max(0, this.active.timer);
    }
    return null;
  }
}
