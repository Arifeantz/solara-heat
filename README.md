[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Arifeantz/solara-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Arifeantz/solara-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solara Heat — Port Solana

An original open-world crime game that plays in a desktop browser from
static files. No build step, no network requests: serve `game/` with any
static file server and open `game/index.html`.

Dario Venn steps off the ferry in Port Solana with $120 and a duffel bag.
Marina Sol of Café Solmar has work for a driver who doesn't ask questions:

1. **First Wheels** — find a car. Any car.
2. **The Dock Run** — pick up a suspiciously heavy crate at the west docks
   and deliver it to the café against the clock.
3. **Hot Merchandise** — steal the marked Vandal GT and deliver it to
   Venn Auto, alarm and all.
4. **Solana Sunset** — drive to the lighthouse, where the police are
   waiting, and lose the heat.
5. **Night Flight** — collect a ticking crate at the new Solana Airfield
   on the north shore, sprint it down the runway to the far marker
   before the charter flight leaves, and report back to the café.

## How to play

**Run it locally.** The game is plain static files, but the browser loads
its code as ES modules, so serve it over HTTP rather than opening it from
disk:

```
cd game
python3 -m http.server 8000
# then open http://localhost:8000/ in a desktop browser
```

Any static file server does the job. Click **START ENGINE** to begin a
new story, or **CONTINUE** when a save exists: your money, health,
position and place in the story are kept in the browser's local storage,
and the pause menu can restart the story from scratch.

**Work the story.** You are Dario Venn, on foot with $120. A column of
golden light marks the current objective and the minimap points the same
way; walk or drive into the ring to advance. Marina's dialogue sets each
job up, finishing one pays its reward, and the next job arrives a few
seconds later. The five jobs pay $50, $180, $350, $600 and $800:

- *First Wheels* ends the moment you get into any car — walk up to one
  (the prompt names it) and press **E**. You can only climb back out once
  the car has nearly stopped.
- *The Dock Run* starts its clock when you pick the crate up: 170 seconds
  to reach Café Solmar. Run out of time and the crate is back at the
  docks, ready to be picked up again — no other penalty.
- *Hot Merchandise* wants one specific car, the teal Vandal GT parked by
  the marina lots. Climbing in trips its alarm and brings the police,
  and the job only counts when you roll into Venn Auto still in that car.
- *Solana Sunset* sends you to the lighthouse, where cruisers are
  waiting. Shake every star off, then drive back to the café.
- *Night Flight* opens the north shore: Solana Airfield, with a full
  runway, a terminal and tower, hangars and two parked aircraft. The
  crate pickup at the terminal starts a 90-second clock — reach the
  marker at the far end of the runway before it runs out (a car helps;
  the runway is 470 metres of empty asphalt), hand the crate off, then
  return to the café to finish the story. After that, Port Solana is
  free roam — and Marina's phone still rings: the **Encore Runs** are
  endless side jobs that send you to collect a crate at one landmark
  (the docks, the airfield, the marina, the lighthouse…) and deliver it
  to another against a 150-second ferry clock, $150 a run. They rotate
  with six authored **Side Jobs**: *The Professor's Lecture* (collect
  Professor Anselm at the University Library on the Heights and get him
  to the café against the clock), *Glass Plates* (carry ninety-year-old
  photographic plates from the Heights Observatory to the airfield
  terminal, whole), the *Derby Day Loop* (four checkpoints —
  lighthouse, marina, the clock tower on the Heights, home — with the
  whole town watching the ice melt), *Old Friends* (Marina's sister
  Ines, twenty years estranged, collected at the terminal and taken to
  the Union Café where she once studied), *Night Freight* (the fish
  market's ice machine dies at midnight: the catch to the night ferry,
  then the manifest to a harbormaster who signs in triplicate), and
  *Bay Six* (marina lilies to a hospital ward, then a husband too
  proud to visit, collected at the Hotel Solana and taken to practise
  his apology on the statue in Palmera Park). Beating a Side Job's
  clock pays a punctuality bonus, a dollar a second.

**Work the CabCo phone.** Marina's jobs are the story; the rent is
yours to earn. Behind any wheel, press **T** and the CabCo dispatch
answers: a named passenger is waiting at a named landmark, waving at
the kerb. Stop beside them and they climb in; drive them home before
their patience — the meter on screen — runs out. The fare is distance
money, and the tip rides on top of it: full at the start of the ride,
bleeding away with the clock, and gone entirely if you terrify them
(a quarter of the car's health in dents will do it) or let the
patience die. Passengers are brave about many things, but a three-star
drop-off keeps its tip for bail money. Get busted or wasted mid-fare
and the fare is simply lost — dispatch notes the silence.

**Collect the postcards.** Somebody has left a postcard at twenty-five
of the island's landmarks — on the lighthouse spit, under the
observatory dome, at the end of the runway, by the park statue, in the
fish market's shade. Each one is a small cream card on a post over a
gold ring, turning slowly in the breeze. Walk or drive within reach
and it is yours: a chime, the counter in the corner of the HUD ticks
up, and the back of the card gets its moment on the story banner —
twenty-five messages in a hand the game never identifies. When no job
has the minimap's gold ring, the nearest remaining card borrows it, so
a quiet afternoon can always become a hunt. The full set pays $1,000
and answers, in the last card's handwriting, the question of who left
them. The album is kept in the save, half-finished hunts included.

**Mind the heat.** Almost everything fun is an offence, and offences feed
a heat score that turns into one to five stars: stealing a car (worse if
a pedestrian or a cruiser sees it), punching someone, ramming traffic or
a cruiser, speeding past a watching cruiser, and — the biggest single
offence of all — running a pedestrian down. One cruiser answers per
star, up to five. Cruisers hunt the last place an officer actually saw
you and share their sightings, so break line of sight behind the towers
and stay clean: after a few hidden seconds with no fresh offence, the
heat drains and the stars fall away. At four stars the SPD changes
tactics: two cruisers park nose-to-nose across an intersection ahead
of you — a **roadblock**. It brakes traffic, its officers' eyes still
report you, and ramming it is exactly as bad an idea as it sounds. It
stands down when the heat falls below three stars.

**Don't get cornered.** If a cruiser stays close while you are on foot
or nearly stopped, the bust meter fills in about two and a half seconds.
**BUSTED** costs a fine of $100 plus $60 a star (never more than you
carry) and drops you at the police station with a clean record. Crash
hard enough, or get run down yourself, and your health runs out instead:
**WASTED** means St. Solana Hospital, a bill of up to $150, and a fresh
start outside its doors.

## What's in the world

- A seeded, sun-soaked coastal city: a grid of avenues with pastel towers,
  shopfronts, parks, parking lots, a beach promenade with palms and
  umbrellas, working docks, and a lighthouse on the point.
- Solana Airfield on the north shore: a 470-metre runway with markings,
  edge lights and a taxiway, a passenger terminal with a glass airside
  face and an entrance canopy, a control tower whose radar bar turns and
  whose beacon blinks, two hangars, a fuel farm, a helipad, and two
  parked aircraft — a Solara Air jet at its gate (airstairs and luggage
  carts included) and a flight-school prop plane by the hangars. Ground
  crew hardware fills the apron: a fuel truck, a chequered follow-me car,
  a baggage train, PAPI and guard lights, and an ILS array past the east
  threshold.
- Solana Marina on the east shore: a lagoon harbour with a plank
  boardwalk, finger piers, five moored sailboats and a working fishing
  boat, a fish market under striped canopies, and channel buoys that
  ride the swell. The lagoon is solid to cars — nobody parks in the
  harbour twice. A dock crane leans over the third pier with a crate
  hanging from its cable, and lobster pots wait by the market for the
  evening tide.
- Solana Heights on the west shore: the university quarter, reached by
  its own coast road under a gateway arch. A main hall with a columned
  portico and a prism pediment, a brick library, a lecture hall, a quad
  with a breathing fountain and a bronze founder pointing at the sea,
  a thirty-metre clock tower that insists it is twenty past four, two
  dormitories on their own green, the Union Café, tennis courts, and —
  on the north rise — an observatory whose dome still turns, telescope
  and all. Students pace the quad square with packs on their backs.
- A medevac helicopter on the airfield helipad, its rotor turning at
  idle, and bus stops on three avenue corners — shelter, bench, and a
  yellow flag for a bus that is, by all accounts, a rumour.
- Traffic that drives the avenue grid in right-hand lanes and brakes for
  what's ahead; pedestrians strolling every sidewalk who flee from
  trouble — and, on quieter streets, jog their loops, stop to take phone
  calls, pose for skyline photos, or wave at a passer-by who walks close.
- Cars to steal and drive — sedans, hatches, a sports coupe, vans, taxis,
  an open-frame Dune Buggy with a roll cage, an exposed engine and
  tall off-road wheels, and a Rancher Pickup with an open bed, a spare
  wheel and a jerry can — each with its own speed and feel, plus parked
  cars all over town and a row of them at the airfield terminal.
- A wanted system: offences feed heat, heat becomes stars, and the Solana
  Police Department answers with cruisers that hunt your last seen
  position. Break line of sight and the heat bleeds away; get cornered and
  you're **BUSTED**; wreck yourself and St. Solana Hospital bills you.
- Combat by fist and by fender, a HUD with a live minimap, story banners,
  a start screen, pause, and a save that remembers your money and your
  place in Marina's story.
- Sound and music synthesised live with WebAudio — engine, sirens,
  crashes, and a slow tropical loop. Nothing is an audio file.

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | walk / drive |
| Mouse (click to lock) | camera |
| E | enter / leave a car |
| F or click | punch |
| Shift | run |
| Space | brake |
| T | CabCo fare (in a car) |
| C | render quality (full / balanced / light) |
| P | pause |
| M | mute |
| Gamepad | left stick walk/steer, triggers drive, right stick camera, A = E, X = punch, Y = phone, B = brake, Start = pause |

## How it's built

The game runs on a small WebGL engine written for it (`game/src/engine.js`:
matrices, a geometry builder, one lit shader with fog, a tiny scene
graph). Every texture is painted on a canvas at load (`textures.js`) —
facades, asphalt, sand — so the game ships zero image or audio assets.
The city is generated from a fixed seed (`city.js`) and baked into merged
meshes; the airfield is a second seeded builder (`airport.js`) whose
colliders, landmarks, parking spots and sidewalk loops fold into the same
world object, and the marina (`marina.js`) folds in the same way again,
borrowing the airfield's geometry-merge helper. The university quarter
(`university.js`) is a fourth builder in the same shape — its own brick
texture, its own seeded shore — and the CabCo dispatcher (`taxi.js`) is
a guest system that borrows the landmark table for its address book and
a pedestrian for its passenger. The other systems each own one file:
`vehicles.js` (cars, traffic, driving — nine body types now, the
Regent Limo among them), `people.js` (the player and pedestrians),
`police.js` (wanted level, pursuit, and the four-star roadblock),
`missions.js` (Marina's five jobs, the endless Encore Runs, and the six
authored Side Jobs that rotate with them — *Night Freight* and *Bay
Six* joined the rotation in the latest round), `hud.js` (HUD and
minimap — the districts are painted onto it with their names, and the
postcard counter lives in its corner), `collect.js` (the twenty-five
Solana postcards), `audio.js`, `input.js` (keyboard, mouse, and a
standard-mapping gamepad), and `main.js` to wire it together.

**Round five: the re-implementation.** The engine, city, vehicles,
people, police, textures, audio, input, HUD and seeded-random modules
were rewritten from their interfaces outward — same world, same
landmarks, same roster, same behaviour, new insides — and the districts
gained living details in the same pass: a windsock streaming over the
runway threshold, two more sailboats rocking at anchor in the marina
basin, and a rowing-club skiff making slow ellipses off the university
jetty with a rower who never tires. CabCo passengers, meanwhile, have
learned to enjoy one clean brush with real speed, and it shows in the
tip. The four screenshots are regenerated from the running game every
round; nothing in the folder is older than the code it pictures.

`main.ts` at the repository root is the entry program for the bounty: it
copies `game/` and `screenshots/` to the output directory and writes the
dossier with the kit's `vendor/makefun-game.ts`, unchanged. Before it
ships anything it validates the hand-in itself — the four screenshots
against their manifest (names, JPEG magic, sane weights) and the game's
entry points — and after copying, it proves the copies mirror the
source byte for byte, not merely size for size.

## License

MIT — see `LICENSE`. Port Solana, its people, its cars and its story are
original to this game.
