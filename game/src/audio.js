// audio.js — every sound in Port Solana, synthesised.
//
// There are no audio files either. GameAudio builds a small WebAudio
// graph at the first user gesture: a master gain, an engine voice
// (two detuned oscillators through a lowpass, pitched by speed), a
// siren voice whose gain follows the nearest cruiser's distance, a
// step-sequenced music loop in a sunset key, and a kit of one-shot
// voices — cash, chimes, a phone, a door, a fist, a crash — each
// drawn from oscillators and one shared noise buffer.

const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// the music's four bars: Am7, Fmaj7, Cmaj7, G6 — root, then the
// chord tones the arp walks through
const BARS = [
  { root: 45, tones: [57, 60, 64, 67] },
  { root: 41, tones: [53, 57, 60, 64] },
  { root: 48, tones: [55, 60, 64, 71] },
  { root: 43, tones: [55, 59, 62, 67] },
];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.noiseBuf = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.sirenPhase = 0;
    this.musicOn = false;
    this.step = 0;
    this.nextStepAt = 0;
  }

  // build the graph; called from the first click, as browsers require
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
    // one second of white noise, shared by every noisy voice
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._buildEngine();
    this._buildSiren();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
    }
  }

  // ------------------------------------------------------------ voices

  _buildEngine() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 2;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 55;
    const square = ctx.createOscillator();
    square.type = 'square';
    square.frequency.value = 28;
    const squareGain = ctx.createGain();
    squareGain.gain.value = 0.5;
    saw.connect(filter);
    square.connect(squareGain);
    squareGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    saw.start();
    square.start();
    this.engineNodes = { gain, filter, saw, square };
  }

  // ratio: speed as a fraction of the car's top speed; throttle 0..1
  setEngine(ratio, throttle, on) {
    if (!this.ctx || !this.engineNodes) return;
    const t = this.ctx.currentTime;
    const e = this.engineNodes;
    const freq = 48 + ratio * 175 + throttle * 22;
    e.saw.frequency.setTargetAtTime(freq, t, 0.06);
    e.square.frequency.setTargetAtTime(freq * 0.5 + 1.5, t, 0.06);
    e.filter.frequency.setTargetAtTime(320 + ratio * 900 + throttle * 260, t, 0.08);
    e.gain.gain.setTargetAtTime(on ? 0.045 + throttle * 0.05 + ratio * 0.02 : 0, t, 0.09);
  }

  _buildSiren() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 800;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.sirenNodes = { gain, osc };
  }

  // distance to the nearest cruiser, or 0 for silence: the wail
  // swells as the law closes in and thins as it falls behind
  setSiren(distance, dt) {
    if (!this.ctx || !this.sirenNodes) return;
    const t = this.ctx.currentTime;
    const s = this.sirenNodes;
    if (!distance || distance <= 0) {
      s.gain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    this.sirenPhase += dt * 4.4;
    const wail = 880 + Math.sin(this.sirenPhase) * 260;
    s.osc.frequency.setTargetAtTime(wail, t, 0.03);
    const closeness = Math.max(0, 1 - distance / 115);
    s.gain.gain.setTargetAtTime(closeness * closeness * 0.11, t, 0.12);
  }

  // ------------------------------------------------------------ music
  //
  // A step sequencer on a lookahead timer: eighth notes at 94 bpm.
  // The bass walks the bar's root, a soft arp picks chord tones on
  // the off steps, a noise hat ticks the beat, and each bar opens
  // with a pad wash of the root and fifth.

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextStepAt = this.ctx.currentTime + 0.06;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 110);
  }

  _scheduleMusic() {
    if (!this.ctx || !this.musicOn) return;
    const stepDur = 60 / 94 / 2;
    while (this.nextStepAt < this.ctx.currentTime + 0.26) {
      this._playStep(this.step, this.nextStepAt, stepDur);
      this.nextStepAt += stepDur;
      this.step++;
    }
  }

  _playStep(step, at, stepDur) {
    const bar = BARS[Math.floor(step / 8) % BARS.length];
    const inBar = step % 8;
    if (inBar === 0) this._pad(bar, at, stepDur * 8);
    if (inBar % 2 === 0) this._tone(NOTE(bar.root - 12), at, stepDur * 1.7, 'sine', 0.16);
    if (inBar === 4) this._tone(NOTE(bar.root - 5), at, stepDur * 1.4, 'sine', 0.1);
    // the arp: chord tones in a slow rotation, off the beat
    if (inBar % 2 === 1) {
      const tone = bar.tones[Math.floor(step / 2) % bar.tones.length];
      this._tone(NOTE(tone + 12), at, stepDur * 0.9, 'triangle', 0.05);
    }
    // the hat: a breath of filtered noise on every other step
    if (inBar % 2 === 0) this._hat(at);
  }

  _pad(bar, at, dur) {
    const ctx = this.ctx;
    for (const off of [0, 7, 12]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = NOTE(bar.root + off);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.028, at + dur * 0.3);
      g.gain.linearRampToValueAtTime(0, at + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
  }

  _hat(at) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.016, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(at, Math.random() * 0.4);
    src.stop(at + 0.07);
  }

  // ------------------------------------------------------------ one-shots

  // a plain oscillator voice with an envelope, the unit of every
  // little sound below
  _tone(freq, at, dur, type, vol, glideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  _noise(at, dur, vol, filterFreq, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  cash() {
    if (!this.ctx) return;
    const t = this._now();
    this._tone(NOTE(88), t, 0.09, 'square', 0.05); // E6
    this._tone(NOTE(95), t + 0.07, 0.16, 'square', 0.05); // B6: cha-ching
  }

  missionDone() {
    if (!this.ctx) return;
    const t = this._now();
    const seq = [72, 76, 79, 84];
    seq.forEach((n, i) => this._tone(NOTE(n), t + i * 0.09, 0.22, 'triangle', 0.09));
  }

  pickup() {
    if (!this.ctx) return;
    this._tone(620, this._now(), 0.14, 'sine', 0.08, 940);
  }

  checkpoint() {
    if (!this.ctx) return;
    const t = this._now();
    this._tone(NOTE(79), t, 0.12, 'triangle', 0.08);
    this._tone(NOTE(84), t + 0.08, 0.2, 'triangle', 0.08);
  }

  fareChime() {
    if (!this.ctx) return;
    const t = this._now();
    this._tone(NOTE(79), t, 0.14, 'sine', 0.07);
    this._tone(NOTE(76), t + 0.1, 0.24, 'sine', 0.07);
  }

  phoneRing() {
    if (!this.ctx) return;
    const t = this._now();
    for (const off of [0, 0.45]) {
      this._tone(440, t + off, 0.32, 'sine', 0.045);
      this._tone(480, t + off, 0.32, 'sine', 0.045);
    }
  }

  door() {
    if (!this.ctx) return;
    const t = this._now();
    this._tone(140, t, 0.13, 'sine', 0.16, 55);
    this._noise(t, 0.06, 0.05, 900);
  }

  punch() {
    if (!this.ctx) return;
    const t = this._now();
    this._noise(t, 0.09, 0.14, 1600);
    this._tone(220, t, 0.09, 'sine', 0.1, 70);
  }

  crash(strength) {
    if (!this.ctx) return;
    const t = this._now();
    const s = Math.min(1, strength / 22);
    this._noise(t, 0.28 + s * 0.3, 0.1 + s * 0.22, 500 + s * 700);
    this._tone(90, t, 0.3, 'sine', 0.14 * s + 0.04, 38);
  }

  busted() {
    if (!this.ctx) return;
    const t = this._now();
    const seq = [64, 63, 59, 52];
    seq.forEach((n, i) => this._tone(NOTE(n), t + i * 0.16, 0.3, 'triangle', 0.09));
    this.setSiren(0, 0);
  }
}
