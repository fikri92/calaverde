// All sound is synthesised with WebAudio: a low city hum, sea surf, footsteps, gunshots per weapon,
// impacts, sirens that pan with the nearest cruiser, and little blips for pickups and missions.
// Nothing is loaded from a file, and the context only starts after the player's first input,
// which browsers require.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noiseBuffer = null;
    this.siren = null;
    this.engineNodes = null;
    this.started = false;
  }

  start() {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.started = true;

    // One noise buffer reused by every noise-based sound.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.startAmbience();
  }

  startAmbience() {
    // Sea and city wash: filtered noise, slowly modulated.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.07;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();

    // A very quiet low drone for the city.
    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 46;
    const dg = this.ctx.createGain();
    dg.gain.value = 0.018;
    const dlp = this.ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 180;
    drone.connect(dlp).connect(dg).connect(this.master);
    drone.start();
  }

  noise(duration, { freq = 1200, q = 1, gain = 0.4, type = 'bandpass', sweepTo = null } = {}) {
    if (!this.started) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), this.ctx.currentTime + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, this.ctx.currentTime + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    src.stop(this.ctx.currentTime + duration);
  }

  tone(freq, duration, { type = 'sine', gain = 0.2, slideTo = null, delay = 0 } = {}) {
    if (!this.started) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  gunshot(kind = 'pistol') {
    if (kind === 'shotgun') {
      this.noise(0.3, { freq: 900, q: 0.7, gain: 0.75, sweepTo: 120 });
      this.tone(70, 0.22, { type: 'square', gain: 0.3, slideTo: 28 });
    } else if (kind === 'smg') {
      this.noise(0.1, { freq: 2100, q: 1.4, gain: 0.4, sweepTo: 400 });
      this.tone(150, 0.07, { type: 'square', gain: 0.13, slideTo: 60 });
    } else {
      this.noise(0.15, { freq: 1600, q: 1.1, gain: 0.5, sweepTo: 220 });
      this.tone(120, 0.1, { type: 'square', gain: 0.18, slideTo: 45 });
    }
  }

  impact() {
    this.noise(0.07, { freq: 3200, q: 2.4, gain: 0.14 });
  }

  footstep() {
    this.noise(0.055, { freq: 780, q: 1.6, gain: 0.055, sweepTo: 260 });
  }

  pickup() {
    this.tone(880, 0.1, { type: 'triangle', gain: 0.16 });
    this.tone(1320, 0.14, { type: 'triangle', gain: 0.12, delay: 0.07 });
  }

  missionSting(good = true) {
    const notes = good ? [523, 659, 784, 1046] : [440, 415, 370, 311];
    notes.forEach((n, i) => this.tone(n, 0.2, { type: 'triangle', gain: 0.16, delay: i * 0.1 }));
  }

  crash(intensity = 1) {
    this.noise(0.22, { freq: 400, q: 0.8, gain: 0.34 * intensity, sweepTo: 90 });
    this.tone(88, 0.16, { type: 'sawtooth', gain: 0.14 * intensity, slideTo: 40 });
  }

  speak(who) {
    // A short two-tone chirp per speaker, so dialogue reads as voices without speech synthesis.
    const base = { rafa: 150, lena: 220, chucho: 280, marisol: 190, aguilar: 120, you: 200 }[who] ?? 180;
    this.tone(base, 0.07, { type: 'square', gain: 0.07 });
    this.tone(base * 1.24, 0.09, { type: 'square', gain: 0.05, delay: 0.06 });
  }

  // Pull the siren volume from the nearest cruiser; call every frame with the distance.
  update(dt, { nearestSirenDist = null, driving = null, speed = 0, wanted = 0 } = {}) {
    if (!this.started) return;
    if (wanted > 0 && nearestSirenDist !== null) {
      if (!this.siren) this.siren = this.makeSiren();
      const closeness = Math.max(0, 1 - nearestSirenDist / 130);
      this.siren.gain.gain.value = 0.16 * closeness;
      this.siren.pan.pan.value = Math.sin(this.ctx.currentTime * 0.7) * 0.5;
      this.siren.osc.frequency.value = 640 + Math.sin(this.ctx.currentTime * 3.4) * 180;
      this.siren.osc2.frequency.value = 880 + Math.sin(this.ctx.currentTime * 3.4 + 1) * 220;
    } else if (this.siren) {
      this.siren.gain.gain.value *= 0.9;
    }

    // Engine: a sawtooth whose pitch tracks speed.
    if (driving) {
      if (!this.engineNodes) this.engineNodes = this.makeEngine();
      const norm = Math.min(1, speed / 40);
      this.engineNodes.osc.frequency.value = 42 + norm * 122;
      this.engineNodes.gain.gain.value = 0.055 + norm * 0.075;
      this.engineNodes.filter.frequency.value = 260 + norm * 900;
    } else if (this.engineNodes) {
      this.engineNodes.gain.gain.value *= 0.88;
    }
  }

  makeSiren() {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.value = 640;
    osc2.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 1.8;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    osc.start();
    osc2.start();
    return { osc, osc2, gain, filter, pan: pan ?? { pan: { value: 0 } } };
  }

  makeEngine() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    return { osc, filter, gain };
  }
}
