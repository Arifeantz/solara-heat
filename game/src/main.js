// main.js — Solara Heat, the whole game wired together.
//
// Boot builds Port Solana and its people, then a single loop runs the city:
// traffic and pedestrians, the player on foot or behind a wheel, the wanted
// system and the police who answer it, Marina's missions, the camera, the
// HUD, and the synthesised sound. Game states: menu (with a slow postcard
// orbit of the city), playing, paused, busted, wasted.
//
// A "postcard mode" (?photo=foot|drive|chase|mission) stages a real gameplay
// scene for screenshots; it plays by exactly the same rules as the game.

import { Renderer, Obj, GeoBuilder, hexColor, Mat4 } from './engine.js';
import { facadeTexture, shopTexture, asphaltTexture, sandTexture, glowTexture } from './textures.js';
import { buildCity, GRID_LINES } from './city.js';
import { Car, TrafficSystem, drivePlayerCar, carCarImpact } from './vehicles.js';
import { Person, Pedestrians, Player } from './people.js';
import { WantedSystem, PoliceSystem, losBlocked } from './police.js';
import { Missions } from './missions.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { clamp, dist2d } from './random.js';

const SAVE_KEY = 'solara-heat-save-v1';
const params = new URLSearchParams(location.search);
const photoMode = params.get('photo');

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const textures = {
  facade: renderer.makeTexture(facadeTexture()),
  shop: renderer.makeTexture(shopTexture()),
  asphalt: renderer.makeTexture(asphaltTexture()),
  sand: renderer.makeTexture(sandTexture()),
  glow: renderer.makeTexture(glowTexture()),
};

const world = buildCity(renderer.gl, textures);
const scene = new Obj();
scene.add(world.group);

const traffic = new TrafficSystem(renderer.gl, world, 14);
const peds = new Pedestrians(renderer.gl, world, 26);
const player = new Player(renderer.gl, world.spawn);
const wanted = new WantedSystem();
const police = new PoliceSystem(renderer.gl, world);
const input = new Input(canvas);
const hud = new Hud();
const audio = new GameAudio();

const added = new Set();
function addToScene(obj) {
  if (!added.has(obj)) {
    added.add(obj);
    scene.add(obj);
  }
}
function removeFromScene(obj) {
  added.delete(obj);
  const i = scene.children.indexOf(obj);
  if (i >= 0) scene.children.splice(i, 1);
}
for (const car of traffic.cars) addToScene(car.obj);
for (const p of peds.list) addToScene(p.obj);
addToScene(player.obj);

// clouds: a few slow white slabs high over the city
const cloudMesh = (() => {
  const b = new GeoBuilder();
  b.box(0, 0, 0, 34, 2.2, 13, hexColor(0xffffff));
  b.box(12, 1, 2, 20, 2, 10, hexColor(0xfdf6ec));
  b.box(-13, 0.8, -2, 16, 1.8, 9, hexColor(0xfdf6ec));
  return b.build(renderer.gl);
})();
const clouds = [];
for (let i = 0; i < 7; i++) {
  const c = new Obj(cloudMesh, { emissive: 0.35 });
  c.pos = [-320 + i * 95, 85 + (i % 3) * 9, -190 + (i * 67) % 380];
  clouds.push(c);
  scene.add(c);
}

// ------------------------------------------------------------ missions glue
let missionCar = null;
const missions = new Missions(renderer.gl, world, {
  showStory: (lines) => hud.showStory(lines),
  onReward: (amount, title) => {
    player.money += amount;
    hud.toast('Mission complete — ' + title + '  +$' + amount);
    audio.cash();
    audio.missionDone();
  },
  onCarStolen: () => {
    wanted.commitOffence(55, nowSec());
    audio.pickup();
  },
  onAmbush: () => {
    wanted.commitOffence(110, nowSec());
  },
  spawnMissionCar: () => {
    missionCar = new Car(renderer.gl, 'sport', 0x2a9d8f, 118, 197, Math.PI / 2, { driver: 'parked' });
    missionCar.isMissionCar = true;
    addToScene(missionCar.obj);
  },
  missionCarPos: () => (missionCar ? { x: missionCar.x, z: missionCar.z } : world.landmarks.cafe),
  onStoryDone: () => {
    hud.toast('Story complete — Port Solana is yours. Free roam!');
  },
  saveGame: () => saveGame(),
});
addToScene(missions.beacon);
addToScene(missions.beaconRing);

// ------------------------------------------------------------ state
let state = 'menu';
let now = 0;
let orbitAngle = 0;
let playerDownTimer = 0;
let speedTrapCooldown = 0;
let saveTimer = 0;
let started = false;

function nowSec() {
  return now;
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: player.money,
      missionIndex: missions.index,
      completed: missions.completedCount,
      storyDone: missions.storyDone,
      x: player.x, z: player.z,
      health: player.health,
    }));
  } catch (e) { /* private mode: play without saving */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function applySave(s) {
  player.money = s.money ?? player.money;
  player.health = s.health ?? 100;
  missions.index = s.missionIndex ?? 0;
  missions.completedCount = s.completed ?? 0;
  missions.storyDone = !!s.storyDone;
  if (typeof s.x === 'number') { player.x = s.x; player.z = s.z; }
}

function startGame(fresh) {
  audio.ensure();
  audio.startMusic();
  if (fresh) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    player.money = 120;
    player.health = 100;
    missions.index = 0;
    missions.completedCount = 0;
    missions.storyDone = false;
    player.x = world.spawn.x;
    player.z = world.spawn.z;
  } else {
    const s = loadSave();
    if (s) applySave(s);
  }
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.add('on');
  state = 'playing';
  started = true;
  if (!missions.active && !missions.storyDone) missions.startNext();
  canvas.requestPointerLock();
}

function endRun(kind) {
  state = kind;
  document.exitPointerLock && document.exitPointerLock();
  const fine = kind === 'busted'
    ? Math.min(player.money, 100 + wanted.stars * 60)
    : Math.min(player.money, 150);
  player.money -= fine;
  document.getElementById(kind + 'fine').textContent = '$' + fine;
  document.getElementById(kind).classList.remove('hidden');
  if (kind === 'busted') audio.busted();
  audio.setEngine(0, 0, false);
  audio.setSiren(0, 0);
}

function respawn() {
  const spot = state === 'busted' ? world.landmarks.police : world.landmarks.hospital;
  document.getElementById('busted').classList.add('hidden');
  document.getElementById('wasted').classList.add('hidden');
  if (player.inCar) leaveCar(true);
  player.x = spot.x;
  player.z = spot.z;
  player.health = 100;
  player.obj.visible = true;
  wanted.heat = 0;
  wanted.recount();
  wanted.bustProgress = 0;
  for (const c of police.cars) removeFromScene(c.obj);
  police.cars.length = 0;
  police.lastKnown = null;
  state = 'playing';
  saveGame();
  canvas.requestPointerLock();
}

// ------------------------------------------------------------ cars and crime
function nearestEnterableCar() {
  let best = null, bd = 3.4;
  const all = [...traffic.cars, ...police.cars];
  if (missionCar) all.push(missionCar);
  for (const car of all) {
    if (car.driver === 'player') continue;
    const d = dist2d(player.x, player.z, car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const wasParked = car.driver === 'parked';
  const wasTraffic = car.driver === 'traffic';
  car.driver = 'player';
  car.speed = 0;
  player.inCar = car;
  player.obj.visible = false;
  audio.door();
  // theft: somebody usually sees a stranger drive off in a car
  if ((wasParked || wasTraffic) && !car.isMissionCar) {
    const witnessed = police.cars.length > 0 || peds.list.some((p) => dist2d(p.x, p.z, player.x, player.z) < 22);
    wanted.commitOffence(witnessed ? 16 : 5, now);
  }
  if (car.isMissionCar && missions.active && missions.currentDef.id === 'hotcar') {
    // the mission update spots this and raises the alarm itself
  }
}

function leaveCar(silent = false) {
  const car = player.inCar;
  if (!car) return;
  car.driver = 'parked';
  player.inCar = null;
  // step out on the left side of the car
  const side = 2.0;
  player.x = car.x + -Math.cos(car.heading) * -side * -1;
  player.x = car.x - Math.cos(car.heading) * side;
  player.z = car.z + Math.sin(car.heading) * side;
  player.heading = car.heading;
  player.obj.visible = true;
  if (!silent) audio.door();
}

function playerPos() {
  return player.inCar ? { x: player.inCar.x, z: player.inCar.z } : { x: player.x, z: player.z };
}

// ------------------------------------------------------------ photo mode
function setupPhoto(mode) {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.add('on');
  state = 'playing';
  started = true;
  missions.index = 1;
  if (mode === 'foot') {
    player.x = 14; player.z = 203; player.heading = Math.PI * 0.92;
    input.yaw = Math.PI * 0.92;
    missions.startNext();
  } else if (mode === 'drive') {
    const car = new Car(renderer.gl, 'sedan', 0xd97b6c, -30, 93.3, Math.PI / 2, { driver: 'player' });
    car.speed = 15;
    addToScene(car.obj);
    player.inCar = car;
    player.obj.visible = false;
    input.yaw = Math.PI / 2;
    missions.startNext();
  } else if (mode === 'chase') {
    const car = new Car(renderer.gl, 'sport', 0xe63946, 30, 3.3, -Math.PI / 2, { driver: 'player' });
    car.speed = 21;
    addToScene(car.obj);
    player.inCar = car;
    player.obj.visible = false;
    input.yaw = -Math.PI / 2;
    wanted.commitOffence(120, 0);
    missions.startNext();
  } else if (mode === 'mission') {
    player.x = 45; player.z = 186; player.heading = Math.PI;
    input.yaw = Math.PI;
    missions.index = 1;
    missions.startNext();
    if (missions.active) {
      missions.active.stage = 1;
      missions.setStageTarget();
    }
  }
}

// ------------------------------------------------------------ UI buttons
document.getElementById('startbtn').addEventListener('click', () => startGame(true));
const saveAtBoot = loadSave();
if (saveAtBoot) {
  const btn = document.getElementById('continuebtn');
  btn.classList.remove('hidden');
  btn.addEventListener('click', () => startGame(false));
}
document.getElementById('resumebtn').addEventListener('click', () => {
  document.getElementById('pause').classList.add('hidden');
  state = 'playing';
  canvas.requestPointerLock();
});
document.getElementById('restartbtn').addEventListener('click', () => {
  document.getElementById('pause').classList.add('hidden');
  startGame(true);
});
document.getElementById('bustedbtn').addEventListener('click', respawn);
document.getElementById('wastedbtn').addEventListener('click', respawn);

if (photoMode) setupPhoto(photoMode);

// ------------------------------------------------------------ the loop
function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(nowMs) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  if (state === 'paused' || state === 'busted' || state === 'wasted') dt = 0;
  now += dt;
  const pp = playerPos();

  if (state === 'menu') {
    // a slow postcard orbit over the bay
    orbitAngle += dt * 0.03;
    const cx = Math.sin(orbitAngle) * 210;
    const cz = 120 + Math.cos(orbitAngle) * 150;
    renderer.view = Mat4.lookAt([cx, 52, cz], [0, 6, 40], [0, 1, 0]);
    renderer.camPos = [cx, 52, cz];
    traffic.update(dt, traffic.cars);
    peds.update(dt, []);
    renderer.begin();
    scene.render(renderer, Mat4.identity());
    return;
  }
  if (dt === 0) return;

  // ---- pause
  if (input.tap('KeyP') || (input.tap('Escape') && state === 'playing')) {
    if (state === 'playing') {
      state = 'paused';
      document.getElementById('pausestats').innerHTML =
        'Cash: <b>$' + Math.floor(player.money) + '</b> · Missions done: <b>' + missions.completedCount + ' / 4</b>' +
        (missions.storyDone ? '<br>Story complete — free roam.' : '');
      document.getElementById('pause').classList.remove('hidden');
      document.exitPointerLock && document.exitPointerLock();
      saveGame();
      return;
    }
  }
  if (input.tap('KeyM')) audio.setMuted(!audio.muted);

  // ---- world life
  const obstacles = [...traffic.cars, ...police.cars];
  if (missionCar) obstacles.push(missionCar);
  if (player.inCar) obstacles.push(player.inCar);
  traffic.update(dt, obstacles);
  for (const c of police.cars) addToScene(c.obj);

  // ---- player
  let prompt = null;
  if (playerDownTimer > 0) {
    playerDownTimer -= dt;
    player.state = 'down';
    player.syncObj(dt);
    if (playerDownTimer <= 0) player.state = 'walk';
  } else if (player.inCar) {
    const car = player.inCar;
    const axes = input.driveAxes();
    const events = {};
    drivePlayerCar(car, axes, dt, world.colliders, events);
    if (events.buildingHit) {
      audio.crash(events.buildingHit);
      if (events.buildingHit > 13) {
        player.health -= (events.buildingHit - 10) * 0.5;
        if (police.cars.length) wanted.commitOffence(4, now);
      }
    }
    if (Math.abs(car.speed) < 4 && input.tap('KeyE')) {
      leaveCar();
    }
    // traffic may not drive through the player's car, and vice versa
    for (const other of obstacles) {
      if (other === car) continue;
      const impact = carCarImpact(car, other);
      if (impact > 5) {
        audio.crash(impact);
        if (other.isPolice) {
          wanted.commitOffence(20, now);
          player.health -= impact * 0.25;
        } else if (impact > 9) {
          wanted.commitOffence(9, now);
        }
        other.health -= impact * 0.8;
      }
    }
    // running someone down is the loudest crime in Port Solana
    if (Math.abs(car.speed) > 3) {
      for (const p of peds.list) {
        if (p.state !== 'down' && dist2d(p.x, p.z, car.x, car.z) < 2.3) {
          peds.knockDown(p, 6);
          wanted.commitOffence(35, now);
          audio.punch();
          car.speed *= 0.7;
        }
      }
    }
    // speeding past a watching cruiser
    speedTrapCooldown -= dt;
    if (Math.abs(car.speed) > 26 && speedTrapCooldown <= 0) {
      for (const c of police.cars) {
        if (dist2d(c.x, c.z, car.x, car.z) < 24) {
          wanted.commitOffence(4, now);
          speedTrapCooldown = 4;
          break;
        }
      }
    }
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    audio.setEngine(Math.abs(car.speed) / car.spec.maxSpeed, Math.abs(axes.throttle), true);
  } else {
    // on foot
    input.turnCamera(dt);
    const axes = input.walkAxes();
    player.updateOnFoot(dt, axes, input.yaw, input.down('ShiftLeft') || input.down('ShiftRight'), world.colliders);
    const nearCar = nearestEnterableCar();
    if (nearCar) {
      prompt = 'E — Take the ' + nearCar.spec.name;
      if (input.tap('KeyE')) enterCar(nearCar);
    }
    if (input.tap('KeyF') || input.tap('MouseLeft')) {
      if (player.startPunch()) {
        audio.punch();
        for (const p of peds.list) {
          const fx = player.x + Math.sin(player.heading) * 1.1;
          const fz = player.z + Math.cos(player.heading) * 1.1;
          if (p.state !== 'down' && dist2d(p.x, p.z, fx, fz) < 1.3) {
            peds.knockDown(p, 2.5);
            const witnessed = police.cars.length > 0 && dist2d(p.x, p.z, police.cars[0].x, police.cars[0].z) < 45;
            wanted.commitOffence(witnessed ? 14 : 7, now);
          }
        }
      }
    }
    audio.setEngine(0, 0, false);
  }

  // ---- police and the law
  const seen = police.update(dt, { x: pp.x, z: pp.z }, wanted, world.colliders, now);
  wanted.update(dt, seen, now);
  // a cruiser that runs the player down hurts him
  if (!player.inCar && playerDownTimer <= 0) {
    for (const c of police.cars) {
      if (Math.abs(c.speed) > 4 && dist2d(c.x, c.z, player.x, player.z) < 2.2) {
        player.health -= 16;
        playerDownTimer = 1.1;
        audio.crash(12);
      }
    }
  }
  // the bust meter: cornered, slow, and watched
  const nearCop = police.nearestDistance({ x: pp.x, z: pp.z });
  const cornered = wanted.stars > 0 && seen && nearCop < 10 && (!player.inCar || Math.abs(player.inCar.speed) < 2.5);
  if (cornered) {
    wanted.bustProgress += dt / 2.4;
    if (wanted.bustProgress >= 1) {
      endRun('busted');
      input.endFrame();
      return;
    }
  }
  if (player.health <= 0) {
    player.health = 0;
    endRun('wasted');
    input.endFrame();
    return;
  }
  // slow recovery out of trouble
  if (wanted.stars === 0 && player.health < 100) player.health = Math.min(100, player.health + dt * 1.6);

  // ---- pedestrians react to the neighbourhood
  const threats = [];
  if (player.inCar && Math.abs(player.inCar.speed) > 4) threats.push({ x: pp.x, z: pp.z, radius: 10 });
  if (!player.inCar && player.punchTimer > 0.12) threats.push({ x: pp.x, z: pp.z, radius: 5 });
  for (const c of police.cars) threats.push({ x: c.x, z: c.z, radius: 5 });
  peds.update(dt, threats);

  // ---- missions
  missions.update(dt, {
    x: pp.x, z: pp.z,
    inCar: !!player.inCar,
    car: player.inCar,
    wanted: wanted.stars,
    now,
  });

  // ---- clouds drift, sea breathes
  for (const c of clouds) {
    c.pos[0] += dt * 1.1;
    if (c.pos[0] > 360) c.pos[0] = -360;
  }
  world.sea.emissive = 0.1 + Math.sin(now * 0.7) * 0.03;

  // ---- camera
  const focus = player.inCar ? player.inCar : player;
  const camDist = player.inCar ? 9.6 + Math.abs(focus.speed) * 0.09 : 6.4;
  const camHeight = player.inCar ? 3.4 : 2.6;
  if (player.inCar) {
    // the camera settles behind the car, easing toward its heading
    const targetYaw = focus.heading + Math.PI;
    let dy = targetYaw - input.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (Math.abs(focus.speed) > 3) input.yaw += dy * Math.min(1, dt * 2.4);
    input.pitch += (0.3 - input.pitch) * Math.min(1, dt * 2);
  }
  const yaw = input.yaw, pitch = input.pitch;
  const tx = focus.x ?? focus.x;
  const px = (player.inCar ? focus.x : player.x);
  const pz = (player.inCar ? focus.z : player.z);
  const camX = px + Math.sin(yaw) * Math.cos(pitch) * camDist;
  const camZ = pz + Math.cos(yaw) * Math.cos(pitch) * camDist;
  const camY = camHeight + Math.sin(pitch) * camDist;
  renderer.view = Mat4.lookAt([camX, Math.max(0.7, camY), camZ], [px, 1.5, pz], [0, 1, 0]);
  renderer.camPos = [camX, Math.max(0.7, camY), camZ];

  // ---- sound and HUD
  audio.setSiren(wanted.stars > 0 ? nearCop : 0, dt);
  hud.update(performance.now(), {
    money: player.money,
    stars: wanted.stars,
    seenByPolice: seen,
    health: player.health,
    speedKmh: player.inCar ? Math.abs(player.inCar.speed) * 3.6 : null,
    objective: missions.objectiveText(),
    timer: missions.timeLeft(),
    bust: wanted.bustProgress,
    prompt,
    player: { x: pp.x, z: pp.z, heading: player.inCar ? player.inCar.heading : player.heading },
    target: missions.marker(),
    police: police.cars,
    cars: traffic.cars.slice(0, 18),
  });

  saveTimer -= dt;
  if (saveTimer <= 0) {
    saveTimer = 12;
    if (started && state === 'playing') saveGame();
  }
  input.endFrame();
}
requestAnimationFrame(frame);

// used by the screenshot harness: true once the staged scene is live
window.__solara = { get state() { return state; }, player, wanted, missions };
