// hud.js — everything the player reads: money, stars, health, the
// mission card, prompts and toasts, story banners, the speedometer,
// and the minimap.
//
// The DOM half is plain element updates against the ids index.html
// provides. The minimap is a canvas painted fresh each frame: the
// island, its districts in their colours with their names, the
// avenue grid, then the moving pieces — traffic as grey ticks, the
// law in blue (flashing when a cruiser's eyes are on you), the
// objective in gold, and Dario as a white arrow that turns with him.

import { GRID_LINES, CITY_EDGE } from './city.js';

const MAP_WORLD = 580; // metres across the map's view, island and sea

// the districts, in world rectangles: [minX, minZ, maxX, maxZ,
// colour, name]. The map and the town agree on these bounds.
const DISTRICTS = [
  [-252, -252, 252, 252, '#3d4a57', ''],
  [-252, -252, 252, -90, '#46586a', 'DOWNTOWN'],
  [-252, 90, 60, 252, '#4d5f52', 'OLD TOWN'],
  [60, 90, 252, 252, '#5d5347', 'HOTEL ROW'],
  [208, -60, 272, 190, '#54626e', 'MARINA'],
  [-272, -10, -208, 120, '#5a5148', 'THE DOCKS'],
  [-272, -300, -160, -215, '#5d5648', 'AIRPORT'],
  [-300, -215, -225, 215, '#4c5a50', 'CAMPUS'],
  [-30, 96, 44, 168, '#41603f', 'PALMERA PARK'],
];

function el(id) {
  return document.getElementById(id);
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor() {
    this.moneyEl = el('money');
    this.starsEl = el('stars');
    this.healthEl = el('healthfill');
    this.bustWrap = el('bustwrap');
    this.bustFill = el('bustfill');
    this.toastEl = el('toast');
    this.bannerEl = el('banner');
    this.bannerWho = el('bannerwho');
    this.bannerText = el('bannertext');
    this.promptEl = el('prompt');
    this.missionBox = el('missionbox');
    this.missionText = el('objective');
    this.missionTimer = el('timer');
    this.speedEl = el('speed');
    this.speedWrap = el('speedwrap');
    this.lastSpeed = null;
    this.postcardsEl = el('postcards');
    this.map = el('minimap');
    this.mapCtx = this.map ? this.map.getContext('2d') : null;
    this.toastUntil = 0;
    this.storyQueue = [];
    this.storyUntil = 0;
    this.lastMoney = null;
  }

  // ------------------------------------------------------------ text

  // queue a sequence of story lines; each holds the banner for a
  // few seconds, in order, however busy the street gets. Lines
  // arrive either as [speaker, text] pairs — the shape the story
  // and the CabCo dispatcher speak in — or as plain strings, which
  // show without a name over them.
  showStory(lines) {
    for (const line of lines) {
      if (Array.isArray(line)) this.storyQueue.push({ who: line[0], text: line[1] });
      else this.storyQueue.push({ who: '', text: String(line) });
    }
  }

  toast(text) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastUntil = performance.now() + 2600;
    this.toastEl.style.opacity = '1';
  }

  // ------------------------------------------------------------ frame

  update(nowMs, s) {
    // money, with a little pop when it changes
    if (this.moneyEl) {
      const text = '$' + Math.round(s.money).toLocaleString('en-US');
      if (text !== this.lastMoney) {
        this.moneyEl.textContent = text;
        this.moneyEl.style.transform = 'scale(1.18)';
        setTimeout(() => { this.moneyEl.style.transform = 'scale(1)'; }, 120);
        this.lastMoney = text;
      }
    }
    // stars: gold for the heat, and a red pulse while seen
    if (this.starsEl) {
      const stars = '★'.repeat(s.stars) + '☆'.repeat(Math.max(0, 5 - s.stars));
      if (this.starsEl.textContent !== stars) this.starsEl.textContent = stars;
      this.starsEl.style.color = s.seenByPolice && Math.floor(nowMs / 280) % 2 === 0
        ? '#ff5d5d'
        : '#ffd34d';
      this.starsEl.style.opacity = s.stars > 0 ? '1' : '0.25';
    }
    if (this.healthEl) {
      const pct = Math.max(0, Math.min(100, s.health));
      this.healthEl.style.width = pct + '%';
      this.healthEl.style.background = pct > 45 ? '#51e07a' : pct > 22 ? '#ffd34d' : '#ff5d5d';
    }
    // the bust meter only exists while it is filling
    if (this.bustWrap && this.bustFill) {
      const show = s.bust > 0.005;
      this.bustWrap.style.display = show ? 'block' : 'none';
      if (show) this.bustFill.style.width = Math.min(100, s.bust * 100) + '%';
    }
    // toasts fade on their own schedule
    if (this.toastEl && this.toastUntil > 0 && nowMs > this.toastUntil) {
      this.toastEl.style.opacity = '0';
      this.toastUntil = 0;
    }
    // the story banner: hold each queued line, then the next —
    // the speaker's name over the line, in the banner's two parts
    if (this.bannerEl) {
      if (this.storyQueue.length > 0 && nowMs > this.storyUntil) {
        const line = this.storyQueue.shift();
        if (this.bannerWho) this.bannerWho.textContent = line.who || '';
        if (this.bannerText) this.bannerText.textContent = line.text;
        this.storyUntil = nowMs + 2900;
        this.bannerEl.style.opacity = '1';
      } else if (this.storyQueue.length === 0 && nowMs > this.storyUntil) {
        this.bannerEl.style.opacity = '0';
      }
    }
    if (this.promptEl) {
      this.promptEl.textContent = s.prompt || '';
      this.promptEl.style.opacity = s.prompt ? '1' : '0';
    }
    // the mission card: objective text, and a clock when the job
    // is timed — the clock burns red under fifteen seconds
    if (this.missionBox) {
      const has = !!(s.objective && s.objective.length);
      this.missionBox.style.display = has ? 'block' : 'none';
      if (has) {
        if (this.missionText.textContent !== s.objective) {
          this.missionText.textContent = s.objective;
        }
        if (s.timer !== null && s.timer !== undefined) {
          this.missionTimer.textContent = formatClock(s.timer);
          this.missionTimer.style.color = s.timer < 15 ? '#ff5d5d' : '#ffd34d';
          this.missionTimer.style.opacity = '1';
        } else {
          this.missionTimer.style.opacity = '0';
        }
      }
    }
    if (this.speedEl) {
      const v = Math.round(s.speedKmh || 0);
      if (v !== this.lastSpeed) {
        this.speedEl.innerHTML = v + ' <small>km/h</small>';
        this.lastSpeed = v;
      }
      this.speedEl.style.opacity = s.speedKmh > 1 ? '1' : '0.35';
    }
    // the postcard counter, once the collection exists
    if (this.postcardsEl && s.postcards) {
      const text = `✉ ${s.postcards.found}/${s.postcards.total}`;
      if (this.postcardsEl.textContent !== text) this.postcardsEl.textContent = text;
      this.postcardsEl.style.color = s.postcards.found >= s.postcards.total ? '#ffd34d' : '#e8f2ff';
    }
    this._drawMap(nowMs, s);
  }

  // ------------------------------------------------------------ the map

  _drawMap(nowMs, s) {
    const ctx = this.mapCtx;
    if (!ctx || !s.player) return;
    const W = this.map.width;
    const scale = W / MAP_WORLD;
    const px = (x) => (x + MAP_WORLD / 2) * scale;
    const pz = (z) => (z + MAP_WORLD / 2) * scale;

    // the sea first, then the island's districts on top of it
    ctx.fillStyle = '#17384a';
    ctx.fillRect(0, 0, W, W);
    for (const [x0, z0, x1, z1, color, name] of DISTRICTS) {
      ctx.fillStyle = color;
      ctx.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale);
      if (name) {
        ctx.fillStyle = 'rgba(232, 242, 255, 0.55)';
        ctx.font = `${Math.round(11 * scale * 2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(name, px((x0 + x1) / 2), pz((z0 + z1) / 2));
      }
    }
    // the harbour water cut and the marina basin read as sea again
    ctx.fillStyle = '#17384a';
    ctx.fillRect(px(252), pz(-252), (272 - 252) * scale, (252 + 252) * scale);
    // avenues: pale lines a road's width across
    ctx.strokeStyle = 'rgba(214, 222, 230, 0.5)';
    ctx.lineWidth = Math.max(1.5, 14 * scale);
    for (const line of GRID_LINES) {
      ctx.beginPath();
      ctx.moveTo(px(line), pz(-CITY_EDGE));
      ctx.lineTo(px(line), pz(CITY_EDGE));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px(-CITY_EDGE), pz(line));
      ctx.lineTo(px(CITY_EDGE), pz(line));
      ctx.stroke();
    }
    // traffic as quiet grey ticks
    ctx.fillStyle = 'rgba(200, 208, 216, 0.75)';
    for (const c of s.cars || []) {
      ctx.fillRect(px(c.x) - 2, pz(c.z) - 2, 4, 4);
    }
    // the law in blue, flashing red-blue while their eyes are on
    // you; main passes the cruiser array itself, but a {cars}
    // wrapper is read just as happily
    const cruisers = Array.isArray(s.police) ? s.police : ((s.police && s.police.cars) || []);
    for (const c of cruisers) {
      const flash = Math.floor(nowMs / 240) % 2 === 0;
      ctx.fillStyle = c.seesPlayer ? (flash ? '#ff5d5d' : '#5db4ff') : '#3f8fe0';
      ctx.beginPath();
      ctx.arc(px(c.x), pz(c.z), 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // the objective: a gold ring that breathes
    if (s.target) {
      const r = 7 + Math.sin(nowMs / 240) * 2;
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px(s.target.x), pz(s.target.z), r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Dario: a white arrow on a dark halo, turned to his heading
    const cx = px(s.player.x);
    const cy = pz(s.player.z);
    const hx = Math.sin(s.player.heading);
    const hy = Math.cos(s.player.heading);
    ctx.fillStyle = 'rgba(6, 12, 20, 0.65)';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + hx * 7, cy + hy * 7);
    ctx.lineTo(cx - hy * 4.6 - hx * 3.4, cy + hx * 4.6 - hy * 3.4);
    ctx.lineTo(cx + hy * 4.6 - hx * 3.4, cy - hx * 4.6 - hy * 3.4);
    ctx.closePath();
    ctx.fill();
  }
}
