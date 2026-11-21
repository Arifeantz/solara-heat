// audio.js — every sound in Solara Heat is synthesised with WebAudio.
//
// No audio files ship with the game: the engine note and the police siren
// are oscillators, crashes and punches are shaped noise, and the music is a
// slow tropical chord loop with a soft plucked melody, scheduled live.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.chordStep = 0;
  }

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
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);
    // shared noise buffer for impacts
    const len = ctx.sampleRate * 0.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // engine voice
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineSub.start();
    // siren voice
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 800;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenPhase = 0;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  // rpm 0..1, load 0..1 (throttle), silent when the player is on foot
  setEngine(rpm, load, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 50 + rpm * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineSub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(240 + rpm * 900 + load * 300, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + rpm * 0.075 : 0, t, 0.09);
  }

  setSiren(proximity, dt) {
    if (!this.ctx) return;
    this.sirenPhase += dt * 5.2;
    const f = 760 + Math.sin(this.sirenPhase) * 130;
    this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03);
    const g = proximity <= 0 ? 0 : Math.max(0, 0.055 * (1 - proximity / 85));
    this.sirenGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.1);
  }

  tone(freq, dur, type, gain, when = 0, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, gain, filterFreq, when = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  door() { this.noise(0.09, 0.12, 900); this.tone(140, 0.07, 'sine', 0.1); }
  punch() { this.noise(0.11, 0.2, 500); this.tone(90, 0.1, 'sine', 0.16, 0, 45); }
  crash(strength) {
    const s = Math.min(1, strength / 22);
    this.noise(0.28, 0.1 + s * 0.3, 700 + s * 500);
    this.tone(70, 0.25, 'sine', 0.12 + s * 0.15, 0, 35);
  }
  pickup() { this.tone(660, 0.1, 'triangle', 0.14); this.tone(880, 0.16, 'triangle', 0.14, 0.09); }
  cash() { this.tone(990, 0.09, 'square', 0.06); this.tone(1320, 0.14, 'square', 0.06, 0.07); }
  missionDone() {
    this.tone(523, 0.14, 'triangle', 0.15);
    this.tone(659, 0.14, 'triangle', 0.15, 0.12);
    this.tone(784, 0.14, 'triangle', 0.15, 0.24);
    this.tone(1047, 0.3, 'triangle', 0.16, 0.36);
  }
  busted() {
    this.tone(392, 0.25, 'sawtooth', 0.1);
    this.tone(311, 0.25, 'sawtooth', 0.1, 0.22);
    this.tone(233, 0.5, 'sawtooth', 0.11, 0.44);
  }
  horn() { this.tone(370, 0.18, 'square', 0.07); this.tone(466, 0.18, 'square', 0.05); }

  // the CabCo phone: a two-tone warble, twice, the way a cheap handset
  // rings in a hot car — dispatch calling with money on the line
  phoneRing() {
    for (const at of [0, 0.55]) {
      for (let i = 0; i < 5; i++) {
        this.tone(i % 2 ? 1180 : 1040, 0.07, 'square', 0.045, at + i * 0.09);
      }
    }
  }

  // the meter's little victory bell when a fare lands: two bright dings
  // a semitone apart, then the cash register's answer underneath
  fareChime() {
    this.tone(1568, 0.12, 'sine', 0.09);
    this.tone(1760, 0.2, 'sine', 0.09, 0.1);
    this.tone(784, 0.16, 'triangle', 0.05, 0.12);
  }

  // a checkpoint blip for the Derby Day Loop and the side-job legs: one
  // rising note, short enough to hear at speed through an open window
  checkpoint() {
    this.tone(740, 0.09, 'triangle', 0.12, 0, 1180);
    this.tone(1180, 0.14, 'triangle', 0.1, 0.08);
  }

  // water against a hull: a soft, low wash of filtered noise, for the
  // moments the game stands still by the marina and listens
  splash() {
    this.noise(0.5, 0.05, 420);
    this.noise(0.35, 0.035, 300, 0.22);
  }

  // a slow sun-drenched loop: Am7 — Fmaj7 — Cmaj7 — G, plucked pentatonic
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [130.81, 196.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 392.0],
    ];
    const melody = [440, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 440];
    let beat = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const chord = chords[this.chordStep % 4];
      if (beat % 4 === 0) {
        for (const f of chord) this.tone(f, 2.4, 'triangle', 0.028);
        this.chordStep += 1;
      }
      if (beat % 2 === 0 && Math.random() < 0.75) {
        const note = melody[Math.floor(Math.random() * melody.length)];
        this.tone(note, 0.5, 'sine', 0.035);
      }
      beat += 1;
    }, 620);
  }
}
