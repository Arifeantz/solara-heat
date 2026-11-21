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

## What's in the world

- A seeded, sun-soaked coastal city: a grid of avenues with pastel towers,
  shopfronts, parks, parking lots, a beach promenade with palms and
  umbrellas, working docks, and a lighthouse on the point.
- Traffic that drives the avenue grid in right-hand lanes and brakes for
  what's ahead; pedestrians strolling every sidewalk who flee from trouble.
- Cars to steal and drive — sedans, hatches, a sports coupe, vans, taxis —
  each with its own speed and feel, plus parked cars all over town.
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
| P | pause |
| M | mute |

## How it's built

The game runs on a small WebGL engine written for it (`game/src/engine.js`:
matrices, a geometry builder, one lit shader with fog, a tiny scene
graph). Every texture is painted on a canvas at load (`textures.js`) —
facades, asphalt, sand — so the game ships zero image or audio assets.
The city is generated from a fixed seed (`city.js`) and baked into merged
meshes; the other systems each own one file: `vehicles.js` (cars, traffic,
driving), `people.js` (the player and pedestrians), `police.js` (wanted
level and pursuit), `missions.js` (Marina's four jobs), `hud.js` (HUD and
minimap), `audio.js`, `input.js`, and `main.js` to wire it together.

`main.ts` at the repository root is the entry program for the bounty: it
copies `game/` and `screenshots/` to the output directory and writes the
dossier with the kit's `vendor/makefun-game.ts`, unchanged.

## License

MIT — see `LICENSE`. Port Solana, its people, its cars and its story are
original to this game.
