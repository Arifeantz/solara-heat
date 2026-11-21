// hud.js — everything drawn over the 3D view: money, wanted stars, health,
// the mission objective and timer, prompts, story banners, and the minimap.
//
// The minimap is a small canvas map of Port Solana: a static layer (island,
// avenues, blocks, beach) painted once, then blips each frame for the
// player, the mission target, traffic and the police.

import { GRID_LINES } from './city.js';

const MAP_MIN = -350;
const MAP_MAX = 370;
const MAP_SPAN = MAP_MAX - MAP_MIN;

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['money', 'stars', 'healthfill', 'speed', 'objective', 'timer', 'bustwrap', 'bustfill', 'prompt', 'banner', 'bannerwho', 'bannertext', 'toast', 'minimap']) {
      this.el[id] = document.getElementById(id);
    }
    this.bannerQueue = [];
    this.bannerUntil = 0;
    this.toastUntil = 0;
    this.mapCtx = this.el.minimap.getContext('2d');
    this.staticMap = this.paintStaticMap();
  }

  worldToMap(x, z, size) {
    return [
      ((x - MAP_MIN) / MAP_SPAN) * size,
      ((z - MAP_MIN) / MAP_SPAN) * size,
    ];
  }

  paintStaticMap() {
    const size = 380;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#2e8fa8'; // the sea
    g.fillRect(0, 0, size, size);
    const [ix0, iz0] = this.worldToMap(-300, -300, size);
    const [ix1, iz1] = this.worldToMap(300, 300, size);
    g.fillStyle = '#e8d9ae'; // sand island
    g.fillRect(ix0, iz0, ix1 - ix0, iz1 - iz0);
    const [bx0, bz0] = this.worldToMap(-252, -252, size);
    const [bx1, bz1] = this.worldToMap(252, 252, size);
    g.fillStyle = '#a9b39a'; // city ground
    g.fillRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
    // blocks
    g.fillStyle = '#8fa583';
    for (const cx of [-135, -45, 45, 135]) {
      for (const cz of [-135, -45, 45, 135]) {
        const [x, z] = this.worldToMap(cx - 38, cz - 38, size);
        const [x2, z2] = this.worldToMap(cx + 38, cz + 38, size);
        g.fillRect(x, z, x2 - x, z2 - z);
      }
    }
    // avenues
    g.strokeStyle = '#5a5a60';
    g.lineWidth = 7;
    for (const gx of GRID_LINES) {
      const [x] = this.worldToMap(gx, 0, size);
      g.beginPath(); g.moveTo(x, bz0); g.lineTo(x, bz1); g.stroke();
      const [, z] = this.worldToMap(0, gx, size);
      g.beginPath(); g.moveTo(bx0, z); g.lineTo(bx1, z); g.stroke();
    }
    // the promenade
    const [, pz] = this.worldToMap(0, 216, size);
    g.strokeStyle = '#e6d3ac';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(bx0, pz); g.lineTo(bx1, pz); g.stroke();
    // the airfield on the north shore: its grass, the runway strip, the
    // terminal block — small, but a pilot's eye should find them
    const [ax0, az0] = this.worldToMap(-248, -298, size);
    const [ax1, az1] = this.worldToMap(248, -216, size);
    g.fillStyle = '#7d9b6a';
    g.fillRect(ax0, az0, ax1 - ax0, az1 - az0);
    const [rx0, rz0] = this.worldToMap(-235, -290, size);
    const [rx1, rz1] = this.worldToMap(235, -270, size);
    g.fillStyle = '#5a5a60';
    g.fillRect(rx0, rz0, rx1 - rx0, rz1 - rz0);
    const [tx0, tz0] = this.worldToMap(45, -237, size);
    const [tx1, tz1] = this.worldToMap(115, -223, size);
    g.fillStyle = '#cbb98f';
    g.fillRect(tx0, tz0, tx1 - tx0, tz1 - tz0);
    // the marina on the east shore: a bite of harbour water in the sand,
    // with the boardwalk drawn along its west bank
    const [mx0, mz0] = this.worldToMap(260, -60, size);
    const [mx1, mz1] = this.worldToMap(294, 140, size);
    g.fillStyle = '#2e8fa8';
    g.fillRect(mx0, mz0, mx1 - mx0, mz1 - mz0);
    const [wx0, wz0] = this.worldToMap(252, -64, size);
    const [wx1, wz1] = this.worldToMap(260, 144, size);
    g.fillStyle = '#a98f66';
    g.fillRect(wx0, wz0, wx1 - wx0, wz1 - wz0);
    // Solana Heights on the west shore: its grass strip, the coast road
    // as one dark line, and the quad as a pale green square a student
    // could navigate by
    const [hx0, hz0] = this.worldToMap(-300, -218, size);
    const [hx1, hz1] = this.worldToMap(-252, 218, size);
    g.fillStyle = '#7d9b6a';
    g.fillRect(hx0, hz0, hx1 - hx0, hz1 - hz0);
    const [hrx] = this.worldToMap(-265, 0, size);
    g.strokeStyle = '#5a5a60';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(hrx, hz0); g.lineTo(hrx, hz1); g.stroke();
    const [qx0, qz0] = this.worldToMap(-295, -72, size);
    const [qx1, qz1] = this.worldToMap(-270, -12, size);
    g.fillStyle = '#93b184';
    g.fillRect(qx0, qz0, qx1 - qx0, qz1 - qz0);
    // district names, lettered small and plain like a paper map's —
    // a legend the eye reads once and then navigates by forever
    g.fillStyle = 'rgba(20, 34, 40, 0.55)';
    g.font = '700 10px "Avenir Next", "Segoe UI", sans-serif';
    g.textAlign = 'center';
    const label = (x, z, text) => {
      const [lx, lz] = this.worldToMap(x, z, size);
      g.fillText(text, lx, lz);
    };
    label(0, -306, 'SOLANA AIRFIELD');
    label(282, 150, 'MARINA');
    label(-282, 226, 'SOLANA HEIGHTS');
    label(-208, 30, 'DOCKS');
    return c;
  }

  showStory(lines) {
    for (const [who, text] of lines) this.bannerQueue.push({ who, text });
  }

  toast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastUntil = performance.now() + seconds * 1000;
  }

  update(now, s) {
    // ---- banner queue
    const banner = this.el.banner;
    if (now > this.bannerUntil && this.bannerQueue.length) {
      const line = this.bannerQueue.shift();
      this.el.bannerwho.textContent = line.who;
      this.el.bannertext.textContent = line.text;
      banner.style.opacity = '1';
      this.bannerUntil = now + 3400;
    } else if (now > this.bannerUntil) {
      banner.style.opacity = '0';
    }
    if (now > this.toastUntil) this.el.toast.style.opacity = '0';

    // ---- top-right cluster
    this.el.money.textContent = '$' + Math.floor(s.money).toLocaleString('en-US');
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.stars ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = s.stars > 0 ? '#ffd23c' : 'rgba(255,255,255,0.35)';
    this.el.stars.style.textShadow = s.seenByPolice && s.stars > 0 ? '0 0 12px #ff4040' : '0 1px 3px rgba(0,0,0,0.6)';
    this.el.healthfill.style.width = Math.max(0, s.health) + '%';
    this.el.healthfill.style.background = s.health > 35 ? '#7ac74f' : '#e63946';

    // ---- speed and objective
    if (s.speedKmh !== null && s.speedKmh !== undefined) {
      this.el.speed.style.opacity = '1';
      this.el.speed.innerHTML = Math.round(s.speedKmh) + '<small> km/h</small>';
    } else {
      this.el.speed.style.opacity = '0';
    }
    this.el.objective.textContent = s.objective || '';
    if (s.timer !== null && s.timer !== undefined) {
      const t = Math.ceil(s.timer);
      this.el.timer.style.opacity = '1';
      this.el.timer.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
      this.el.timer.style.color = t < 25 ? '#ff5a4e' : '#fff';
    } else {
      this.el.timer.style.opacity = '0';
    }
    if (s.bust > 0.02) {
      this.el.bustwrap.style.opacity = '1';
      this.el.bustfill.style.width = s.bust * 100 + '%';
    } else {
      this.el.bustwrap.style.opacity = '0';
    }
    if (s.prompt) {
      this.el.prompt.style.opacity = '1';
      this.el.prompt.textContent = s.prompt;
    } else {
      this.el.prompt.style.opacity = '0';
    }

    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const g = this.mapCtx;
    const size = this.el.minimap.width;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.staticMap, 0, 0, size, size);
    // traffic as pale dots
    g.fillStyle = 'rgba(240,240,235,0.75)';
    for (const c of s.cars) {
      const [x, z] = this.worldToMap(c.x, c.z, size);
      g.fillRect(x - 1, z - 1, 2, 2);
    }
    // police as flashing blue/red dots
    const phase = Math.floor(performance.now() / 300) % 2 === 0;
    for (const c of s.police) {
      const [x, z] = this.worldToMap(c.x, c.z, size);
      g.fillStyle = phase ? '#3b82f6' : '#ef4444';
      g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill();
    }
    // mission target: a gold diamond that breathes, with its name
    // lettered beside it when the def gave it one — a passenger's name
    // reads differently from a place's, and both are worth knowing
    if (s.target) {
      const [x, z] = this.worldToMap(s.target.x, s.target.z, size);
      const r = 4.5 + Math.sin(performance.now() / 240) * 1.2;
      g.fillStyle = '#ffc93c';
      g.save();
      g.translate(x, z);
      g.rotate(Math.PI / 4);
      g.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
      g.restore();
      if (s.target.label) {
        g.font = '700 10px "Avenir Next", "Segoe UI", sans-serif';
        g.textAlign = x > size - 70 ? 'right' : 'left';
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(s.target.label, x + (g.textAlign === 'right' ? -8 : 8) + 1, z + 4);
        g.fillStyle = '#ffd968';
        g.fillText(s.target.label, x + (g.textAlign === 'right' ? -8 : 8), z + 3);
      }
    }
    // the player: a white arrow pointing the way he faces
    const [px, pz] = this.worldToMap(s.player.x, s.player.z, size);
    g.save();
    g.translate(px, pz);
    g.rotate(headingAngle(s.player.heading));
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-4, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

// The map draws world x to the right and world z downward, and the arrow
// glyph points up the canvas. A heading's forward vector (sin h, cos h) in
// world space is (sin h, cos h) on the map too, so the arrow must rotate by
// π − h for its tip to track the way the player faces.
function headingAngle(heading) {
  return Math.PI - heading;
}
