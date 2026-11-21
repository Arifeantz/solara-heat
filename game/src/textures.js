// textures.js — the game's six painted surfaces, drawn in code.
//
// There are no image files in Solara Heat. Each texture is a small
// RGBA pixel buffer painted by hand here — window grids for tower
// facades, a striped awning and shopfront glass for the retail
// builder, speckled asphalt, beach sand, brick courses, and a soft
// radial glow for lamps and the lighthouse beam. The Renderer uploads
// each buffer once at boot; the geometry builders then repeat them
// across walls and ground by scaling their uv rectangles.
//
// Every buffer is painted deterministically (a tiny local generator,
// never Math.random), and row 0 of a buffer is the TOP of the surface
// as it appears in the world: the facade's parapet band is at the top
// of its buffer, the shop's awning likewise.

// a pocket deterministic generator for speckle and scatter
function painter(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// one pixel buffer with the few brushes the painters share
function canvas(w, h, rgb) {
  const data = new Uint8Array(w * h * 4);
  const img = {
    width: w,
    height: h,
    data,
    set(x, y, r, g, b, a = 255) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    },
    fill(x0, y0, x1, y1, r, g, b, a = 255) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) img.set(x, y, r, g, b, a);
      }
    },
    speckle(count, rng, shades) {
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rng() * w);
        const y = Math.floor(rng() * h);
        const c = shades[Math.floor(rng() * shades.length)];
        img.set(x, y, c[0], c[1], c[2]);
      }
    },
  };
  img.fill(0, 0, w, h, rgb[0], rgb[1], rgb[2]);
  return img;
}

// ------------------------------------------------------------ facade
// A tower wall, tinted by the vertex colour of whatever building
// wears it: the buffer itself stays near-white so the tint reads.
// A parapet shadow band runs along the top; below it a strict grid
// of windows, most of them blue-grey glass, a few lit warm, one or
// two open to the dark.
export function facadeTexture() {
  const img = canvas(128, 128, [238, 236, 230]);
  const rng = painter(41);
  img.fill(0, 0, 128, 7, 176, 172, 164); // the parapet shadow
  img.fill(0, 7, 128, 9, 214, 210, 200);
  const cols = 4, rows = 6;
  const cw = 128 / cols, ch = (128 - 12) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.floor(c * cw + cw * 0.24);
      const y = Math.floor(12 + r * ch + ch * 0.18);
      const w = Math.floor(cw * 0.52), h = Math.floor(ch * 0.6);
      const roll = rng();
      if (roll < 0.14) img.fill(x, y, x + w, y + h, 250, 205, 120); // lit
      else if (roll < 0.2) img.fill(x, y, x + w, y + h, 52, 58, 66); // open
      else img.fill(x, y, x + w, y + h, 96, 128, 148); // glass
      // a pale sill and a glint across the glass
      img.fill(x - 1, y + h, x + w + 1, y + h + 2, 198, 194, 186);
      img.fill(x + 2, y + 2, x + w - 4, y + 4, 226, 240, 244);
    }
  }
  img.speckle(260, rng, [[228, 224, 216], [246, 244, 238], [206, 202, 194]]);
  return img;
}

// ------------------------------------------------------------ shop
// A ground-floor storefront: a striped awning across the top, tall
// display glass beneath it, a door at the right with a brass handle,
// and a tiled step along the bottom.
export function shopTexture() {
  const img = canvas(128, 128, [240, 234, 222]);
  const rng = painter(97);
  // the awning: alternating coral and cream slats, a scalloped hem
  for (let x = 0; x < 128; x += 16) {
    img.fill(x, 0, x + 8, 30, 214, 84, 62);
    img.fill(x + 8, 0, x + 16, 30, 246, 238, 224);
  }
  img.fill(0, 30, 128, 34, 120, 60, 48);
  for (let x = 0; x < 128; x += 16) img.fill(x, 30, x + 8, 38, 214, 84, 62);
  // display glass: two broad panes with goods hinted behind them
  img.fill(8, 48, 62, 108, 88, 122, 140);
  img.fill(68, 48, 96, 108, 80, 114, 134);
  img.fill(12, 84, 58, 92, 233, 196, 106); // a shelf of bright tins
  img.fill(12, 96, 58, 102, 188, 84, 70);
  img.fill(72, 78, 92, 88, 120, 176, 120);
  img.fill(10, 50, 60, 54, 230, 242, 246); // the sky in the glass
  img.fill(70, 50, 94, 54, 230, 242, 246);
  // the door: deep teal, a glass top, a brass knob
  img.fill(102, 44, 122, 112, 28, 92, 102);
  img.fill(106, 48, 118, 74, 140, 180, 192);
  img.fill(108, 84, 110, 88, 240, 200, 90);
  // the tiled step and a worn threshold line
  img.fill(0, 112, 128, 128, 172, 158, 138);
  for (let x = 0; x < 128; x += 16) img.fill(x, 112, x + 1, 128, 140, 126, 106);
  img.speckle(160, rng, [[232, 226, 210], [248, 244, 232]]);
  return img;
}

// ------------------------------------------------------------ asphalt
// Road surface: a near-black blue-grey, aggregate speckle, the odd
// sealed crack and oil stain. It repeats hard across the avenues, so
// nothing in it may draw the eye twice the same way.
export function asphaltTexture() {
  const img = canvas(128, 128, [52, 54, 58]);
  const rng = painter(7);
  img.speckle(2400, rng, [[64, 66, 70], [44, 46, 50], [74, 76, 80], [58, 60, 64]]);
  // two tar-sealed cracks wandering the tile
  for (const startX of [22, 88]) {
    let x = startX;
    for (let y = 0; y < 128; y += 4) {
      x += Math.floor(rng() * 5) - 2;
      img.fill(x, y, x + 2, y + 4, 34, 35, 38);
    }
  }
  // one soft oil stain
  for (let y = 84; y < 104; y++) {
    for (let x = 92; x < 116; x++) {
      const dx = x - 104, dy = y - 94;
      if (dx * dx + dy * dy < 110) img.set(x, y, 40, 41, 46);
    }
  }
  return img;
}

// ------------------------------------------------------------ sand
// Beach sand for the island's base: warm pale grains, darker flecks,
// and the faintest wind ripples running one way.
export function sandTexture() {
  const img = canvas(128, 128, [226, 204, 164]);
  const rng = painter(23);
  img.speckle(1800, rng, [[236, 218, 182], [214, 190, 148], [206, 182, 138], [240, 226, 196]]);
  for (let y = 6; y < 128; y += 11) {
    for (let x = 0; x < 128; x++) {
      const wave = Math.sin((x + y * 2) * 0.22) > 0.55;
      if (wave) img.set(x, y, 216, 194, 152);
    }
  }
  return img;
}

// ------------------------------------------------------------ brick
// Brick courses for the library and the older blocks: warm reds with
// a paler mortar, each course offset half a brick from the last.
export function brickTexture() {
  const img = canvas(128, 128, [188, 178, 168]); // mortar
  const rng = painter(59);
  const bh = 10, bw = 30;
  for (let row = 0; row * bh < 128; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col * bw < 128 + bw; col++) {
      const x = Math.floor(col * bw + off);
      const y = row * bh;
      const tone = 0.88 + rng() * 0.24;
      const r = Math.floor(168 * tone), g = Math.floor(84 * tone), b = Math.floor(66 * tone);
      img.fill(x + 1, y + 1, x + bw - 1, y + bh - 1, r, g, b);
      img.fill(x + 2, y + 2, x + bw - 3, y + 3, Math.min(255, r + 26), Math.min(255, g + 18), Math.min(255, b + 12));
    }
  }
  img.speckle(300, rng, [[176, 164, 152], [198, 188, 176]]);
  return img;
}

// ------------------------------------------------------------ glow
// A soft radial disc, white at the heart and gone at the rim: lamp
// heads, the lighthouse lamp, anything that should bloom a little
// against the dusk. The colour comes from the vertex colour of the
// geometry that wears it.
export function glowTexture() {
  const img = canvas(64, 64, [0, 0, 0]);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const dx = x - 31.5, dy = y - 31.5;
      const d = Math.sqrt(dx * dx + dy * dy) / 32;
      const v = Math.max(0, 1 - d);
      const glow = Math.floor(255 * v * v * (3 - 2 * v));
      img.set(x, y, glow, glow, glow);
    }
  }
  return img;
}
