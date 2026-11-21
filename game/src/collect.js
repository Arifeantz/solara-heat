// collect.js — the Solana postcards: twenty-five little cards
// hidden across Port Solana, one for every place worth writing
// home about.
//
// Someone — the game never says who — has left a postcard at each
// of the island's landmarks: on the lighthouse spit, under the
// observatory dome, at the end of the runway, by the park statue.
// Walk or drive within arm's reach of one and it is yours: a chime,
// the card's message as a toast, and the counter on the HUD ticks
// up. Find all twenty-five and the collection pays out — the
// island, completed, is worth $1,000 and a line in the story.
//
// Each card is a small scene object: a cream card on a dark post
// with a coral stamp, turning slowly over a gold ring, bobbing as
// if the sea breeze had opinions. Taken cards vanish. The system
// serialises to a list of taken indices for the save file, and can
// point the HUD's gold ring at the nearest card still out there.

import { GeoBuilder, Obj, hexColor } from './engine.js';
import { dist2d } from './random.js';

// ------------------------------------------------------------ the cards
//
// name: where it is. district: the hint's word for the area.
// line: what is written on the back, in a hand the game leaves
// unidentified. x/z: the spot itself, always reachable ground —
// beside the landmark, never inside its walls.

const CARD_DEFS = [
  { name: 'Police HQ steps', district: 'Downtown', x: -24, z: -186,
    line: '“They waved me through the roadblock. I think the tall one winked.”' },
  { name: 'Hospital doors', district: 'Downtown', x: 126, z: -200,
    line: '“Third floor, window six. She is sitting up and asking for oranges.”' },
  { name: 'Café Solmar', district: 'Old Town', x: 24, z: 188,
    line: '“The coffee is strong enough to file paperwork. Come home thirsty.”' },
  { name: 'Hotel Solana', district: 'Hotel Row', x: 144, z: 190,
    line: '“Room 9 still has our initials under the sill. I checked.”' },
  { name: 'Palmera Park statue', district: 'Palmera Park', x: 4, z: 120,
    line: '“The general points at the sea like he is still giving it orders.”' },
  { name: 'Venn Auto', district: 'Old Town', x: -120, z: 82,
    line: '“Rosa fixed the coupe and refused payment. Again. Send mangoes.”' },
  { name: 'The docks', district: 'The Docks', x: -238, z: 40,
    line: '“The night ferry smells of diesel and jasmine. Both, somehow.”' },
  { name: 'Pier end', district: 'The Docks', x: -240, z: 66,
    line: '“An old man fishes here for fish he throws back. It is not about fish.”' },
  { name: 'Lighthouse spit', district: 'Hotel Row', x: 96, z: 266,
    line: '“At dusk the light comes on before the dark does. It knows the way.”' },
  { name: 'Airport terminal', district: 'Airport', x: 92, z: -216,
    line: '“Every departure board here is a list of people keeping promises.”' },
  { name: 'Control tower', district: 'Airport', x: -40, z: -240,
    line: '“The controller talks to planes like they are tired children.”' },
  { name: 'Runway end', district: 'Airport', x: -206, z: -280,
    line: '“Stand here and the whole island lines up behind you.”' },
  { name: 'Helipad', district: 'Airport', x: -240, z: -204,
    line: '“The rich arrive by air and leave by boat. Nobody stays by car.”' },
  { name: 'Marina boardwalk', district: 'Marina', x: 238, z: 40,
    line: '“The buoys ring their bells all night, out of time, like a party.”' },
  { name: 'Fish market', district: 'Marina', x: 238, z: 116,
    line: '“Best grilled snapper on the island. Do not tell the hotel.”' },
  { name: 'Observatory dome', district: 'Campus', x: -254, z: -196,
    line: '“On clear nights they let the queue look. The queue is half the town.”' },
  { name: 'University quad', district: 'Campus', x: -250, z: -140,
    line: '“Someone chalked the whole timetable on the quad. It rained. Freedom.”' },
  { name: 'The library', district: 'Campus', x: -250, z: 6,
    line: '“Third shelf, travel section: a ticket stub from 1987, still marking a page.”' },
  { name: 'Clock tower', district: 'Campus', x: -254, z: 50,
    line: '“It runs four minutes fast. The whole campus runs four minutes fast.”' },
  { name: 'Student union', district: 'Campus', x: -250, z: 168,
    line: '“The noticeboard has a card asking for a band. It has been there for years.”' },
  { name: 'Campus fountain', district: 'Campus', x: -250, z: -72,
    line: '“Coins in the fountain, all small, all spent on the same wish.”' },
  { name: 'North-east corner', district: 'Downtown', x: 200, z: -188,
    line: '“From this corner the avenue runs straight to the water. Run it.”' },
  { name: 'South-west corner', district: 'Old Town', x: -200, z: 188,
    line: '“The bakery on this corner opens at five and sells out by six.”' },
  { name: 'The first street', district: 'Old Town', x: 30, z: 168,
    line: '“Where every arrival starts. Yours did. Come back and start again.”' },
  { name: 'The sand', district: 'Hotel Row', x: 188, z: 256,
    line: '“Bare feet, warm sand, a town behind you keeping the lights on.”' },
];

export const POSTCARD_TOTAL = CARD_DEFS.length;
export const POSTCARD_REWARD = 1000;

// Every card also carries a postscript — the small line squeezed
// under the message when the writer remembered one more thing,
// which is the most postcard sentence-shape there is. They are
// index-aligned with CARD_DEFS and shown right after the message,
// the way a real card is read: front, back, then the tiny bit at
// the bottom you almost missed.
const POSTSCRIPTS = [
  'P.S. The tall one was named Ivo. He says the roadblock was art.',
  'P.S. Oranges acquired. She ate two before the nurse could object.',
  'P.S. I owe Rosa a coffee. Add it to the family ledger of coffees.',
  'P.S. The manager pretends not to know about the initials. He knows.',
  'P.S. Someone has polished his boots. The pigeons approve.',
  'P.S. The coupe still leaks a little. Rosa says it is character.',
  'P.S. The ferry captain reads every manifest aloud. To the sea.',
  'P.S. He threw back three while I watched. He is feeding the view.',
  'P.S. The keeper waves at boats that are not there yet. Practice.',
  'P.S. A child here pressed her face to the glass for a full minute.',
  'P.S. He signed off with "roger" and then, quietly, "goodnight".',
  'P.S. The grass at the end is full of people sitting very still.',
  'P.S. The pilot tipped his cap. To a helicopter. Standards.',
  'P.S. At night the masts tick against the bells. Free music.',
  'P.S. Eat it with the bread they fry in the oil. Trust the card.',
  'P.S. The astronomer let me look. I understood nothing. Beautiful.',
  'P.S. The chalk timetable is now tradition. It rains. They redo it.',
  'P.S. I checked the page. The stub is still there. So is the story.',
  'P.S. Four minutes fast, and somehow everyone is exactly on time.',
  'P.S. The band request has a reply now. One word: "Saturday."',
  'P.S. I threw in a coin. Same wish. Do not ask — it voids it.',
  'P.S. At 6 a.m. this corner belongs to bakers and one fast driver.',
  'P.S. Five o\'clock, warm bread, the whole street queuing in pyjamas.',
  'P.S. Start here. Everyone does, whether they admit it or not.',
  'P.S. The sand keeps the shape of the day until the tide edits it.',
];

// Completing a district — every card in one area of the island —
// pays a smaller bonus on the spot. The album is the long game;
// the districts are the short satisfactions along the way, and
// they teach the hunter the map one neighbourhood at a time.
export const DISTRICT_BONUS = 150;

// ------------------------------------------------------------ the system

export class Postcards {
  // hooks: { onCollect(card, found, total), onComplete() }
  constructor(gl, hooks = {}) {
    this.hooks = hooks;
    this.group = new Obj();
    this.found = 0;
    this.completed = false;
    this.cards = CARD_DEFS.map((def, i) => {
      const obj = this._buildCard(gl, i);
      obj.pos = [def.x, 0, def.z];
      this.group.add(obj);
      return { ...def, ps: POSTSCRIPTS[i], index: i, taken: false, obj, phase: i * 1.37 };
    });
    this.districtsDone = new Set();
  }

  // one card on its post: cream board, coral stamp, a line of
  // pretend handwriting ruled across the back, gold ring at the base
  _buildCard(gl, index) {
    const group = new Obj();
    const post = new GeoBuilder();
    post.box(0, 0.5, 0, 0.06, 1.0, 0.06, hexColor(0x3a3f47));
    group.add(new Obj(post.build(gl)));
    const board = new GeoBuilder();
    board.box(0, 1.22, 0, 0.66, 0.44, 0.03, hexColor(0xfff6e3)); // the card
    board.box(0.2, 1.32, 0.02, 0.15, 0.13, 0.012, hexColor(0xe4572e)); // the stamp
    board.box(-0.08, 1.26, 0.02, 0.34, 0.025, 0.012, hexColor(0x9db4c8)); // writing, line one
    board.box(-0.08, 1.19, 0.02, 0.28, 0.025, 0.012, hexColor(0x9db4c8)); // line two
    board.box(-0.08, 1.12, 0.02, 0.31, 0.025, 0.012, hexColor(0x9db4c8)); // line three
    const boardObj = new Obj(board.build(gl));
    boardObj.rot = [-0.16, (index % 8) * 0.4, 0];
    group.add(boardObj);
    group.userData = { board: boardObj };
    // the ring: a flat gold disc with a warm emissive so it reads
    // at dusk, the universal language of "something is here"
    const ring = new GeoBuilder();
    ring.cylinder(0, 0.05, 0, 1.15, 1.15, 0.05, 20, hexColor(0xffd34d));
    const ringObj = new Obj(ring.build(gl), { emissive: [1, 0.72, 0.18] });
    group.add(ringObj);
    return group;
  }

  // ------------------------------------------------------------ play

  // advance the idle motion and test the player's reach. pos is the
  // player's ground position, on foot or in a car — a card within
  // reach of the door is within reach.
  update(dt, pos, nowMs) {
    for (const card of this.cards) {
      if (card.taken) continue;
      const board = card.obj.userData.board;
      board.rot[1] += dt * 1.1;
      card.obj.pos[1] = Math.sin(nowMs / 480 + card.phase) * 0.07;
      if (pos && dist2d(pos.x, pos.z, card.x, card.z) < 2.7) {
        this._take(card);
      }
    }
  }

  _take(card) {
    card.taken = true;
    card.obj.visible = false;
    this.found++;
    if (this.hooks.onCollect) this.hooks.onCollect(card, this.found, this.cards.length);
    // a district completes quietly inside the same moment: the
    // last card of an area is worth a little more than the others
    if (!this.districtsDone.has(card.district)) {
      const inDistrict = this.cards.filter((c) => c.district === card.district);
      if (inDistrict.every((c) => c.taken)) {
        this.districtsDone.add(card.district);
        if (this.hooks.onDistrict) this.hooks.onDistrict(card.district, DISTRICT_BONUS);
      }
    }
    if (this.found >= this.cards.length && !this.completed) {
      this.completed = true;
      if (this.hooks.onComplete) this.hooks.onComplete();
    }
  }

  // the nearest card still out there, for the HUD's gold ring and
  // for hints; null when the album is full
  nearest(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const card of this.cards) {
      if (card.taken) continue;
      const d = dist2d(pos.x, pos.z, card.x, card.z);
      if (d < bestD) {
        bestD = d;
        best = card;
      }
    }
    return best ? { x: best.x, z: best.z, dist: bestD, card: best } : null;
  }

  // a hint in words: the district of the nearest remaining card
  hint(pos) {
    const near = this.nearest(pos);
    if (!near) return 'The album is full. Port Solana, collected.';
    return `A postcard waits somewhere in ${near.card.district}…`;
  }

  remaining() {
    return this.cards.length - this.found;
  }

  // ------------------------------------------------------------ saving

  serialize() {
    return this.cards.filter((c) => c.taken).map((c) => c.index);
  }

  restore(indices) {
    if (!Array.isArray(indices)) return;
    for (const card of this.cards) {
      const taken = indices.includes(card.index);
      card.taken = taken;
      card.obj.visible = !taken;
    }
    this.found = this.cards.filter((c) => c.taken).length;
    this.completed = this.found >= this.cards.length;
    // a restored album keeps its completed districts completed:
    // their bonuses were paid in the session that earned them
    this.districtsDone = new Set();
    for (const card of this.cards) {
      if (!card.taken) continue;
      const inDistrict = this.cards.filter((c) => c.district === card.district);
      if (inDistrict.every((c) => c.taken)) this.districtsDone.add(card.district);
    }
  }
}
