// textures.js — every texture in Solara Heat is painted on a canvas at load.
//
// No image files ship with the game: facades with lit windows, a beach-umbrella
// stripe, asphalt grain and the water sparkle are all drawn here with plain
// canvas 2D, then uploaded by the engine as WebGL textures.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// A tower facade: warm plaster with a grid of windows, some of them lit.
// tint is multiplied in the shader through the vertex colour, so one texture
// serves every pastel tower in the city.
export function facadeTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#f5efe4';
  g.fillRect(0, 0, 256, 256);
  // faint plaster streaks
  g.fillStyle = 'rgba(190,170,140,0.12)';
  for (let i = 0; i < 40; i++) {
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 14 + Math.random() * 30);
  }
  const cols = 6, rows = 8;
  const ww = 256 / cols, hh = 256 / rows;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const px = x * ww + ww * 0.24;
      const py = y * hh + hh * 0.2;
      const w = ww * 0.52, h = hh * 0.58;
      const lit = Math.random() < 0.24;
      g.fillStyle = lit ? '#ffd98a' : '#3d5a68';
      g.fillRect(px, py, w, h);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(px, py, w, h * 0.3);
      g.fillStyle = 'rgba(30,40,50,0.55)';
      g.fillRect(px, py + h - 2, w, 2);
    }
  }
  return c;
}

// Low-rise shopfront facade: awning stripe along the bottom, bigger windows.
export function shopTexture() {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#f8f2e6';
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 4; x++) {
    g.fillStyle = '#46606e';
    g.fillRect(14 + x * 62, 18, 46, 44);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(14 + x * 62, 18, 46, 14);
  }
  // awning
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#e4572e' : '#fdf6ec';
    g.fillRect(i * 16, 74, 16, 18);
  }
  g.fillStyle = '#5d4a38';
  g.fillRect(0, 96, 256, 32);
  g.fillStyle = '#2e2a26';
  g.fillRect(20, 100, 60, 28);
  g.fillRect(110, 100, 60, 28);
  g.fillRect(200, 100, 40, 28);
  return c;
}

// Asphalt with a little grain, used on every road quad.
export function asphaltTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#4a4a50';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 60 + Math.random() * 30;
    g.fillStyle = `rgba(${v},${v},${v + 8},0.5)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.6, 1.6);
  }
  return c;
}

// Sand with speckles for the beach strip.
export function sandTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#ecd9a8';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(200,170,110,0.5)' : 'rgba(255,246,214,0.5)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return c;
}

// Soft radial sparkle used for the mission beacon glow sprite.
export function glowTexture() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}
