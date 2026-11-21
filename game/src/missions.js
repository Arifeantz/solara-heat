// missions.js — Marina Sol's jobs: the five-mission story of Solara Heat.
//
// Dario Venn washes up in Port Solana with $120 and a duffel bag. Marina,
// who runs Café Solmar, puts him to work: learn the streets, run a package
// off the docks, lift a marked sports car for a buyer, drive the coast road
// to the lighthouse — where the police are waiting — and finally sprint a
// ticking crate down the runway at Solana Airfield before the night flight
// leaves. Each mission is a marker on the map, a line of story, a cash
// reward, and a next job.
//
// And once the story is told, the work is not: Marina keeps finding
// crates, and the Encore Runs — randomised pickup-and-deliver jobs
// between the city's landmarks, against the ferry clock — loop for as
// long as Dario keeps showing up.

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
  {
    id: 'airmail',
    title: 'Night Flight',
    reward: 800,
    intro: [
      ['Marina', 'One more, Dario — the last one, I promise. A charter flight comes into Solana Airfield tonight.'],
      ['Marina', 'A crate comes off it that customs must never see. Collect it at the terminal, run it to the marker at the far end of the runway before the flight leaves, then come back to me.'],
    ],
    objective: 'Collect the crate at Solana Airfield terminal',
    objective2: 'Run the crate to the far runway marker — before the flight leaves',
    objective3: 'Return to Café Solmar',
    done: 'On the manifest as "machine parts". You are a natural, Dario. Now — truly — Port Solana is yours.',
    timeLimit: 90,
  },
];

// ------------------------------------------------------------ side jobs
// After the story, work in Port Solana is not only crates. The Side Jobs
// are three authored errands that rotate with the Encore Runs: a
// professor late for his own lecture, a box of photographic plates that
// must reach the airfield unbroken, and the Derby Day Loop — four
// checkpoints across the whole map, the Heights included. Each carries
// a route: a list of legs, each leg a landmark, an arrival radius, the
// objective line for that leg, and what is said when you roll in.
export const SIDE_DEFS = [
  {
    id: 'campus',
    kind: 'side',
    title: "The Professor's Lecture",
    reward: 260,
    intro: [
      ['Marina', 'Dario — Professor Anselm, astronomy, Solana Heights. His car died at the library and his own lecture starts without him.'],
      ['Marina', 'Collect him at the University Library and bring him to me at the café. He gives the talk here. Do not ask why.'],
    ],
    done: 'A lecture on the moons of Jupiter, delivered to a café. Port Solana is a strange and wonderful town.',
    legTimer: 130,
    route: [
      {
        key: 'library', label: 'University Library', r: 7,
        text: 'Pick up Professor Anselm at the University Library',
        say: [['Professor Anselm', 'You are the driver? Splendid. I am not late, the lecture is early. It is a question of frames of reference.']],
      },
      {
        key: 'cafe', label: 'Café Solmar', r: 8,
        text: 'Take the professor to Café Solmar — the clock is running',
      },
    ],
  },
  {
    id: 'plates',
    kind: 'side',
    title: 'Glass Plates',
    reward: 330,
    intro: [
      ['Marina', 'The observatory on the Heights photographed something last night. The plates go to a man at the airfield who pays not to be named.'],
      ['Marina', 'Glass, Dario. Ninety-year-old glass. Collect them at the observatory, deliver them to the terminal — and arrive with them whole.'],
    ],
    done: 'Whole, every one. The man at the terminal counted them twice and smiled at neither of us.',
    legTimer: 120,
    route: [
      {
        key: 'observatory', label: 'Heights Observatory', r: 9,
        text: 'Collect the photographic plates at the Heights Observatory',
        say: [['Astronomer', 'Careful — if these break, the sky will have to do it again, and the sky does not repeat itself.']],
      },
      {
        key: 'airport', label: 'Solana Airfield', r: 10,
        text: 'Deliver the plates to Solana Airfield terminal — gently',
      },
    ],
  },
  {
    id: 'derby',
    kind: 'side',
    title: 'Derby Day Loop',
    reward: 420,
    intro: [
      ['Marina', 'Derby Day, Dario. Four flags, one loop of the whole town: the lighthouse, the marina, the clock tower on the Heights, then home to me.'],
      ['Marina', 'No clock but your pride. The regulars have money on whether you finish before the ice melts.'],
    ],
    done: 'The ice had not even thought about melting. The regulars send their regards and their losses.',
    route: [
      {
        key: 'lighthouse', label: 'Lighthouse', r: 14,
        text: 'Derby Day — checkpoint 1: the lighthouse',
        say: [['Dario', 'One flag down. The lighthouse keeper is waving, or warning me. Hard to tell.']],
      },
      {
        key: 'marina', label: 'Solana Marina', r: 10,
        text: 'Derby Day — checkpoint 2: the marina boardwalk',
        say: [['Dario', 'Two. The fish market approves, or that was the smell of approval.']],
      },
      {
        key: 'clocktower', label: 'The Clock Tower', r: 10,
        text: 'Derby Day — checkpoint 3: the clock tower on the Heights',
        say: [['Dario', 'Three. Twenty past four by the tower, and every minute of it earned.']],
      },
      {
        key: 'cafe', label: 'Café Solmar', r: 8,
        text: 'Derby Day — final leg: home to Café Solmar',
      },
    ],
  },
  {
    id: 'reunion',
    kind: 'side',
    title: 'Old Friends',
    reward: 310,
    legTimer: 145,
    intro: [
      ['Marina', 'My sister Ines lands in twenty minutes. Twenty years we have not spoken, and she picks today — when my car smells of fish market.'],
      ['Marina', 'Collect her at the terminal and take her to the Union Café on the Heights; she studied there. She will tell you I was the difficult one. I was not.'],
    ],
    done: 'She stayed two hours. Two. Whatever you said in that car, driver — the tab is mine, and so is the thanks.',
    route: [
      {
        key: 'airport', label: 'Solana Airfield Terminal', r: 12,
        text: 'Collect Ines at the airfield terminal',
        say: [['Ines', 'You are Marina\u2019s driver? She said you were reliable and quiet. One of those was a lie she needed.']],
      },
      {
        key: 'union', label: 'Union Café', r: 9,
        text: 'Take Ines to the Union Café on the Heights',
      },
    ],
  },
  // ---------------------------------------------------------- round five
  //
  // Two more jobs join the rotation with the re-implementation.
  // Night Freight is the island before dawn: ice, fish, a ferry
  // that will not wait, and a harbormaster who signs in triplicate.
  // Bay Six is the opposite hour entirely — a bunch of flowers, a
  // hospital ward, and a husband who has been rehearsing a thank-you
  // in a hotel lobby for three days. Both run on the same machinery
  // as every other side job: a route of landmark keys, a clock per
  // leg, and Marina on the phone being Marina about it.
  {
    id: 'nightfreight',
    kind: 'side',
    title: 'Night Freight',
    reward: 380,
    intro: [
      ['Marina', 'Dario, wake up. No — stay asleep, drive asleep, it is all the same to the fish market. Their ice machine died at midnight.'],
      ['Marina', 'The catch is packed in the last of the ice and the night ferry at the docks loads in twenty minutes. If it misses the ferry it is worth nothing by morning.'],
      ['Marina', 'Collect the crates at the fish market, run them to the ferry, then take the harbormaster his copy of the manifest at the marina office. He will not sign the copy he already has. Do not ask.'],
    ],
    done: 'Signed, stamped, and smelling faintly of snapper. The ferry took the catch and the harbormaster took the credit, which is the correct order of things.',
    legTimer: 140,
    route: [
      {
        key: 'fishmarket', label: 'Fish Market', r: 9,
        text: 'Collect the crates at the fish market — the ice is melting',
        say: [
          ['Market Porter', 'Twelve crates, driver. Twelve. If one is warm when it lands, the whole harbour hears about it by breakfast.'],
          ['Market Porter', 'Drive like the ice is your own money. It is, a little. Marina explained nothing? She does that.'],
        ],
      },
      {
        key: 'docks', label: 'The Docks', r: 11,
        text: 'Get the catch to the night ferry at the docks',
        say: [
          ['Ferry Hand', 'Down the ramp, easy — EASY. There. Twelve crates, cold as sermons. The captain owes Marina a favour the size of this boat.'],
        ],
      },
      {
        key: 'marina', label: 'Marina Office', r: 9,
        text: 'Take the manifest copy to the harbormaster at the marina',
        say: [
          ['Harbormaster', 'The copy. Finally. A manifest in triplicate is a manifest that exists, driver. In duplicate it is merely a rumour with paperwork.'],
        ],
      },
    ],
  },
  {
    id: 'bayflowers',
    kind: 'side',
    title: 'Bay Six',
    reward: 290,
    intro: [
      ['Marina', 'A different kind of urgent, Dario. Rosa at the café has a bunch of marina lilies with a card that just says "Bay Six".'],
      ['Marina', 'Bay Six is a ward at the hospital. The lady in it has been asking the nurses whether anybody came. Three days, Dario. Nobody came.'],
      ['Marina', 'Take the flowers to the hospital. Then — her husband is at the Hotel Solana, too proud to walk in empty-handed and too shy to walk in at all. Collect him. Bring him to the statue in Palmera Park first; he wants to practise what to say to a bench, like a normal man.'],
    ],
    done: 'He said it to the bench, then he said it to her. The nurses pretended not to listen and listened completely. Bay Six has flowers.',
    legTimer: 125,
    route: [
      {
        key: 'cafe', label: 'Café Solmar', r: 8,
        text: 'Collect the lilies from Rosa at Café Solmar',
        say: [
          ['Rosa', 'Marina lilies. They only open at dusk, which the lady will say is showing off. The card is hers to read, not yours, driver.'],
          ['Rosa', 'And tell the husband from me: three days is long enough to be proud. Go.'],
        ],
      },
      {
        key: 'hospital', label: 'Solana Heights Hospital', r: 10,
        text: 'Deliver the lilies to Bay Six at the hospital',
        say: [
          ['Ward Nurse', 'Bay Six? For her? Oh — oh, finally. Leave them with me and I will carry them in like they are made of weather. She has been asking, you know.'],
        ],
      },
      {
        key: 'hotel', label: 'Hotel Solana', r: 10,
        text: 'Collect the husband at the Hotel Solana',
        say: [
          ['The Husband', 'I bought a shirt. Three days I have been buying shirts. A man cannot walk into a hospital in the wrong shirt, that is what I told myself.'],
          ['The Husband', 'The park first, driver. The statue. I have a speech and the statue has never once interrupted anybody.'],
        ],
      },
      {
        key: 'park', label: 'Palmera Park', r: 9,
        text: 'Take him to the statue in Palmera Park to practise',
        say: [
          ['The Husband', '"I am sorry I was proud." There. The general approves. Now — the hospital, driver, before the shirt and I both lose our nerve.'],
        ],
      },
    ],
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
    if (!this.active) return null;
    // encore runs carry their own generated def (defIndex -1) and side
    // jobs carry an authored one from SIDE_DEFS (defIndex -2)
    if (this.active.defIndex >= 0) return MISSION_DEFS[this.active.defIndex];
    if (this.active.defIndex === -2) return this.sideDef;
    return this.encoreDef;
  }

  marker() {
    if (!this.active || !this.active.target) return null;
    return this.active.target;
  }

  objectiveText() {
    if (!this.active) {
      return this.storyDone
        ? 'Free roam — Port Solana is yours. Steal cars, dodge the SPD, make money.'
        : '';
    }
    const def = this.currentDef;
    if (def.kind === 'side') return def.route[this.active.stage].text;
    if (this.active.stage === 0) return def.objective;
    if (this.active.stage === 1) return def.objective2 || def.objective;
    return def.objective3 || def.objective;
  }

  startNext() {
    if (this.storyDone) {
      // post-story work alternates: an authored side job, then a crate
      // run, then the next side job — the town never quite runs dry
      this.jobsSinceStory = (this.jobsSinceStory || 0) + 1;
      if (this.jobsSinceStory % 2 === 0) this.startSideJob();
      else this.startEncore();
      return;
    }
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

  // After the story: an endless drip of side work. Two landmarks are
  // drawn — a pickup and a drop-off, never the same place — and the job
  // pays a flat courier's rate against the ferry clock.
  startEncore() {
    const L = this.world.landmarks;
    const spots = [L.docks, L.garage, L.airport, L.hangar, L.lighthouse, L.police, L.hospital, L.marina, L.fishmarket, L.university, L.library, L.observatory, L.clocktower, L.union];
    const pick = spots[Math.floor(Math.random() * spots.length)];
    let drop = spots[Math.floor(Math.random() * spots.length)];
    if (drop === pick) drop = spots[(spots.indexOf(pick) + 3) % spots.length];
    this.encoreDef = {
      id: 'encore',
      title: 'Encore Run',
      reward: 150,
      intro: [
        ['Marina', `Dario. A crate turned up at ${pick.name} that belongs at ${drop.name}.`],
        ['Marina', 'The ferry schedule is the clock. You know how this goes by now.'],
      ],
      objective: `Pick up the crate at ${pick.name}`,
      objective2: `Deliver the crate to ${drop.name}`,
      done: 'Done and dusted. There is always another crate in Port Solana.',
      timeLimit: 150,
    };
    this.active = { defIndex: -1, stage: 0, timer: null, target: null, pickup: pick, drop };
    this.hooks.showStory(this.encoreDef.intro);
    this.setStageTarget();
  }

  // An authored side job from SIDE_DEFS, taken in rotation. The def is
  // shared and never mutated; all running state lives on this.active.
  startSideJob() {
    if (this.sideIndex === undefined) this.sideIndex = 0;
    const def = SIDE_DEFS[this.sideIndex % SIDE_DEFS.length];
    this.sideIndex += 1;
    this.sideDef = def;
    this.active = { defIndex: -2, stage: 0, timer: null, target: null };
    this.hooks.showStory(def.intro);
    this.setStageTarget();
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
    else if (def.id === 'airmail') {
      if (a.stage === 0) a.target = { ...L.airport, label: 'Solana Airfield' };
      else if (a.stage === 1) a.target = { ...L.runwayEnd, label: 'Runway Marker' };
      else a.target = { ...L.cafe, label: 'Café Solmar' };
    }
    else if (def.id === 'encore') {
      a.target = a.stage === 0
        ? { ...a.pickup, label: a.pickup.name }
        : { ...a.drop, label: a.drop.name };
    }
    else if (def.kind === 'side') {
      const leg = def.route[a.stage];
      a.target = { ...L[leg.key], label: leg.label };
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
    const encore = def.id === 'encore';
    const side = def.kind === 'side';
    this.hooks.showStory([['Marina', def.done]]);
    // a side job beaten against its own clock pays a punctuality bonus
    // on top — a dollar a second left standing, rounded generously
    const bonus = side && this.active.timer > 0 ? Math.ceil(this.active.timer) : 0;
    this.hooks.onReward(def.reward + bonus, bonus > 0 ? `${def.title} (+$${bonus} early)` : def.title);
    this.active = null;
    if (!encore && !side) this.index += 1; // side work does not advance the story
    this.completedCount += 1;
    this.placeBeacon();
    this.hooks.saveGame();
    if (encore) {
      // side work never runs out: another crate turns up before long
      this.nextJobIn = 9;
    } else if (side) {
      // and an authored errand is never the last of its kind either
      this.nextJobIn = 8;
    } else if (this.index < MISSION_DEFS.length) {
      // the next job arrives a few seconds later, by phone
      this.nextJobIn = 6;
    } else {
      this.storyDone = true;
      this.hooks.onStoryDone();
      // and once the story is told, the encore runs begin
      this.nextJobIn = 10;
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
        const line = def.id === 'airmail'
          ? 'The flight left without you. The crate is back at the terminal — drive up and try again.'
          : def.id === 'encore'
            ? 'The ferry left without it. The crate is back where you found it — the fare stands, if you still want it.'
            : def.kind === 'side'
              ? 'Too slow — the moment passed. The job starts again from the top, if you still want it.'
              : 'Too slow — the tide turned. The package is back at the docks.';
        this.hooks.showStory([['Marina', line]]);
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
    if (def.id === 'airmail') {
      if (a.stage === 0 && near(a.target, 10)) {
        a.stage = 1;
        a.timer = def.timeLimit;
        this.setStageTarget();
        this.hooks.showStory([
          ['Dockmaster', 'That crate? The one sweating in the sun by the freight door? All yours, friend.'],
          ['Dario', 'It is ticking. Crates should not tick. Runway. Now.'],
        ]);
      } else if (a.stage === 1 && near(a.target, 12)) {
        a.stage = 2;
        a.timer = null;
        this.setStageTarget();
        this.hooks.showStory([['Dario', 'Handed off at the marker, wheels up behind me. Whatever that was — not my problem any more.']]);
      } else if (a.stage === 2 && near(a.target, 8)) {
        this.finishMission();
      }
    }
    if (def.id === 'encore') {
      if (a.stage === 0 && near(a.target, 8)) {
        a.stage = 1;
        a.timer = def.timeLimit;
        this.setStageTarget();
        this.hooks.showStory([['Dario', 'Another crate, another ferry to beat. Some things never change.']]);
      } else if (a.stage === 1 && near(a.target, 9)) {
        this.finishMission();
      }
    }
    if (def.kind === 'side') {
      // one generic walker for every authored route: arrive inside the
      // leg's radius, hear what the leg has to say, and either roll on
      // to the next leg (the leg clock starts now, if the job has one)
      // or finish the job at the route's end
      const leg = def.route[a.stage];
      if (near(a.target, leg.r)) {
        if (a.stage >= def.route.length - 1) {
          this.finishMission();
          return;
        }
        if (leg.say) this.hooks.showStory(leg.say);
        a.stage += 1;
        a.timer = def.legTimer || null;
        this.setStageTarget();
        if (this.hooks.onCheckpoint) this.hooks.onCheckpoint();
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
