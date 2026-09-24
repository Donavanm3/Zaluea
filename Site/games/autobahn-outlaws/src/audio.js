// Fully synthesised audio (WebAudio): weapons, explosions, engines, sirens,
// UI jingles and three procedural radio stations.
import { G } from './game.js';

const STATIONS = [
  { name: 'Radio aus', id: 'off' },
  { name: 'Berlin Techno FM', id: 'techno', bpm: 128 },
  { name: 'Radio Blasmusik Bayern', id: 'oompah', bpm: 116 },
  { name: 'Klassik Radio Dresden', id: 'classic', bpm: 72 },
  { name: 'Autobahn Synthwave', id: 'synth', bpm: 100 },
];

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.station = 1;
    this.radioOn = false;
    this.vol = { master: 0.8, sfx: 0.9, music: 0.55 };
    this.listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    this.engine = null;
    this.siren = null;
    this.heli = null;
    this.step = 0;
    this.nextTime = 0;
    this.lastShot = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.musicDelay = ctx.createDelay(1); this.musicDelay.delayTime.value = 0.32;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    this.musicDelay.connect(fb); fb.connect(this.musicDelay);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.musicDelay.connect(wet); wet.connect(this.music);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.music.gain.value = this.vol.music * 0.6;
  }

  setListener(x, y, z, yaw) {
    const l = this.listener;
    l.x = x; l.y = y; l.z = z;
    // right vector for heading yaw (forward = sin,cos)
    l.rx = -Math.cos(yaw); l.rz = Math.sin(yaw);
  }

  spatial(pos, range = 250) {
    if (!pos) return { g: 1, p: 0 };
    const l = this.listener;
    const dx = pos.x - l.x, dy = (pos.y || 0) - l.y, dz = pos.z - l.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const g = Math.max(0, 1 - d / range);
    const p = d > 0.5 ? Math.max(-1, Math.min(1, (dx * l.rx + dz * l.rz) / d)) : 0;
    return { g: g * g, p: p * 0.8, d };
  }

  out(pos, range) {
    const ctx = this.ctx;
    const { g, p } = this.spatial(pos, range);
    if (g < 0.003) return null;
    const gain = ctx.createGain();
    gain.gain.value = g;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = p;
      gain.connect(pan); pan.connect(this.sfx);
    } else gain.connect(this.sfx);
    return gain;
  }

  noiseBurst(dest, t, dur, type, freq, q, vol, attack = 0.002, fEnd) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(dest, t, dur, type, f0, f1, vol, attack = 0.003) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  shot(kind, pos) {
    if (!this.ctx) return;
    const dest = this.out(pos, kind === 'sniper' ? 600 : 380);
    if (!dest) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'pistol':
        this.noiseBurst(dest, t, 0.16, 'bandpass', 2400, 0.8, 0.9);
        this.tone(dest, t, 0.09, 'sine', 180, 60, 0.6);
        break;
      case 'smg':
        this.noiseBurst(dest, t, 0.09, 'bandpass', 3000, 0.9, 0.7);
        this.tone(dest, t, 0.06, 'square', 150, 70, 0.25);
        break;
      case 'shotgun':
        this.noiseBurst(dest, t, 0.45, 'lowpass', 1800, 0.7, 1.0, 0.002, 300);
        this.tone(dest, t, 0.2, 'sine', 120, 40, 0.9);
        break;
      case 'rifle':
        this.noiseBurst(dest, t, 0.2, 'bandpass', 1900, 0.7, 0.9);
        this.tone(dest, t, 0.1, 'sine', 140, 50, 0.7);
        break;
      case 'sniper':
        this.noiseBurst(dest, t, 0.7, 'lowpass', 2600, 0.6, 1.0, 0.002, 250);
        this.tone(dest, t, 0.25, 'sine', 110, 35, 1.0);
        this.noiseBurst(dest, t + 0.25, 0.6, 'lowpass', 900, 0.5, 0.25);
        break;
      case 'rpg':
        this.noiseBurst(dest, t, 0.8, 'bandpass', 500, 1.2, 0.8, 0.02, 2500);
        break;
      case 'grenade':
        this.noiseBurst(dest, t, 0.12, 'highpass', 1500, 0.7, 0.3);
        break;
      case 'punch':
        this.noiseBurst(dest, t, 0.08, 'lowpass', 600, 1, 0.6);
        this.tone(dest, t, 0.08, 'sine', 90, 50, 0.5);
        break;
      case 'impact':
        this.noiseBurst(dest, t, 0.05, 'highpass', 3500, 0.8, 0.25);
        break;
      case 'metal':
        this.tone(dest, t, 0.12, 'triangle', 1400 + Math.random() * 600, 900, 0.18);
        this.noiseBurst(dest, t, 0.06, 'highpass', 4000, 0.8, 0.2);
        break;
      case 'empty':
        this.tone(dest, t, 0.04, 'square', 1800, 1500, 0.15);
        break;
      case 'reload':
        this.tone(dest, t, 0.05, 'square', 700, 500, 0.15);
        this.tone(dest, t + 0.25, 0.06, 'square', 900, 600, 0.18);
        break;
    }
  }

  explosion(pos, big = 1) {
    if (!this.ctx) return;
    const dest = this.out(pos, 900);
    if (!dest) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(dest, t, 1.8 * big, 'lowpass', 1500, 0.5, 1.0, 0.005, 80);
    this.tone(dest, t, 1.2, 'sine', 70, 25, 1.0, 0.01);
    this.noiseBurst(dest, t + 0.05, 0.3, 'bandpass', 3000, 0.5, 0.4);
  }

  crash(pos, intensity) {
    if (!this.ctx) return;
    const dest = this.out(pos, 200);
    if (!dest) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, intensity);
    this.noiseBurst(dest, t, 0.35 + v * 0.3, 'lowpass', 900 + v * 1500, 0.6, 0.4 + v * 0.6);
    this.tone(dest, t, 0.2, 'triangle', 300 + Math.random() * 300, 120, 0.25 * v);
    if (v > 0.5) this.noiseBurst(dest, t + 0.05, 0.5, 'highpass', 5000, 0.8, 0.25);
  }

  splash(pos) {
    if (!this.ctx) return;
    const dest = this.out(pos, 150);
    if (!dest) return;
    this.noiseBurst(dest, this.ctx.currentTime, 0.6, 'lowpass', 1200, 0.5, 0.7, 0.01, 300);
  }

  step2(pos, run) {
    if (!this.ctx) return;
    const dest = this.out(pos, 25);
    if (!dest) return;
    this.noiseBurst(dest, this.ctx.currentTime, 0.05, 'lowpass', run ? 900 : 700, 1, run ? 0.12 : 0.07);
  }

  ui(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.sfx;
    switch (kind) {
      case 'click': this.tone(d, t, 0.05, 'square', 900, 700, 0.08); break;
      case 'buy': this.tone(d, t, 0.08, 'square', 880, 0, 0.12); this.tone(d, t + 0.08, 0.14, 'square', 1320, 0, 0.12); break;
      case 'pickup': this.tone(d, t, 0.07, 'triangle', 1046, 0, 0.2); this.tone(d, t + 0.06, 0.1, 'triangle', 1568, 0, 0.2); break;
      case 'money': for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.05, 0.08, 'square', 1500 + i * 300, 0, 0.08); break;
      case 'checkpoint': this.tone(d, t, 0.12, 'sine', 988, 0, 0.3); this.tone(d, t + 0.1, 0.18, 'sine', 1319, 0, 0.3); break;
      case 'wanted': this.tone(d, t, 0.25, 'sawtooth', 300, 200, 0.12); break;
      case 'pass': [60, 64, 67, 72, 76].forEach((n, i) => this.tone(d, t + i * 0.12, 0.45, 'triangle', NOTE(n), 0, 0.22)); break;
      case 'fail': [67, 63, 60, 55].forEach((n, i) => this.tone(d, t + i * 0.18, 0.4, 'sawtooth', NOTE(n), 0, 0.12)); break;
      case 'wasted': this.tone(d, t, 2.5, 'sawtooth', 220, 40, 0.25, 0.05); this.noiseBurst(d, t, 1.5, 'lowpass', 600, 0.5, 0.3, 0.05, 60); break;
      case 'busted': [72, 72, 67].forEach((n, i) => this.tone(d, t + i * 0.2, 0.3, 'square', NOTE(n), 0, 0.15)); break;
      case 'phone': [0, 0.35].forEach((o) => { this.tone(d, t + o, 0.12, 'sine', 1400, 0, 0.18); this.tone(d, t + o + 0.14, 0.12, 'sine', 1100, 0, 0.18); }); break;
      case 'select': this.tone(d, t, 0.06, 'triangle', 660, 0, 0.14); break;
    }
  }

  // ---------- Continuous sounds ----------
  setEngine(active, rpm = 0, throttle = 0, kind = 'car', pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (active && !this.engine) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = kind === 'trabbi' || kind === 'bike' ? 'square' : 'sawtooth';
      o2.type = 'square';
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx);
      o1.start(); o2.start();
      this.engine = { o1, o2, f, g, kind };
    }
    if (!active && this.engine) {
      const e = this.engine;
      e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (_) { /* */ } }, 300);
      this.engine = null;
      return;
    }
    if (!this.engine) return;
    const e = this.engine;
    const t = ctx.currentTime;
    let base = 32, span = 120, vol = 0.12;
    if (e.kind === 'truck' || e.kind === 'bus') { base = 22; span = 70; vol = 0.15; }
    if (e.kind === 'sports') { base = 40; span = 190; vol = 0.13; }
    if (e.kind === 'trabbi') { base = 55; span = 150; vol = 0.08; }
    if (e.kind === 'bike') { base = 50; span = 220; vol = 0.1; }
    if (e.kind === 'boat') { base = 28; span = 90; vol = 0.12; }
    const fr = base + rpm * span;
    e.o1.frequency.setTargetAtTime(fr, t, 0.05);
    e.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.05);
    e.f.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 700, t, 0.05);
    e.g.gain.setTargetAtTime(vol * (0.45 + throttle * 0.55), t, 0.05);
  }

  setHeli(active, intensity = 0.5, pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = this.spatial(pos, 400);
    if (active && s.g > 0.003 && !this.heli) {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = ctx.createGain(); g.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 14; lfo.type = 'square';
      const lg = ctx.createGain(); lg.gain.value = 0.5;
      const am = ctx.createGain(); am.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain);
      src.connect(f); f.connect(am); am.connect(g); g.connect(this.sfx);
      src.start(); lfo.start();
      this.heli = { src, lfo, g, f };
    }
    if ((!active || s.g <= 0.003) && this.heli) {
      const h = this.heli;
      h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      setTimeout(() => { try { h.src.stop(); h.lfo.stop(); } catch (_) { /* */ } }, 400);
      this.heli = null;
      return;
    }
    if (this.heli) {
      this.heli.g.gain.setTargetAtTime(0.5 * s.g * (0.5 + intensity * 0.5), ctx.currentTime, 0.1);
      this.heli.lfo.frequency.setTargetAtTime(11 + intensity * 6, ctx.currentTime, 0.2);
    }
  }

  // German two-tone siren ("Martinshorn"), positioned at nearest active siren.
  setSiren(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = pos ? this.spatial(pos, 320) : { g: 0 };
    if (s.g > 0.003 && !this.siren) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(f); f.connect(g);
      if (pan) { g.connect(pan); pan.connect(this.sfx); } else g.connect(this.sfx);
      o.start();
      this.siren = { o, g, pan, next: ctx.currentTime, hi: false };
    }
    if (!this.siren) return;
    if (s.g <= 0.003) {
      const sr = this.siren;
      sr.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => { try { sr.o.stop(); } catch (_) { /* */ } }, 300);
      this.siren = null;
      return;
    }
    const sr = this.siren;
    while (sr.next < ctx.currentTime + 0.3) {
      sr.o.frequency.setValueAtTime(sr.hi ? 587 : 440, sr.next);
      sr.hi = !sr.hi;
      sr.next += 0.62;
    }
    sr.g.gain.setTargetAtTime(0.14 * s.g, ctx.currentTime, 0.08);
    if (sr.pan) sr.pan.pan.setTargetAtTime(s.p, ctx.currentTime, 0.08);
  }

  hornOn = null;
  setHorn(on, kind) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.hornOn) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = o2.type = 'square';
      const base = kind === 'truck' || kind === 'bus' ? 220 : kind === 'bike' ? 520 : 392;
      o1.frequency.value = base; o2.frequency.value = base * 1.26;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.value = 0.09;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx);
      o1.start(); o2.start();
      this.hornOn = { o1, o2, g };
    } else if (!on && this.hornOn) {
      const h = this.hornOn;
      h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => { try { h.o1.stop(); h.o2.stop(); } catch (_) { /* */ } }, 100);
      this.hornOn = null;
    }
  }

  npcHorn(pos) {
    if (!this.ctx) return;
    const dest = this.out(pos, 120);
    if (!dest) return;
    const t = this.ctx.currentTime;
    this.tone(dest, t, 0.35, 'square', 350 + Math.random() * 80, 0, 0.1, 0.01);
    this.tone(dest, t, 0.35, 'square', 440 + Math.random() * 80, 0, 0.08, 0.01);
  }

  // ---------- Radio ----------
  get stations() { return STATIONS; }
  setRadio(on) {
    if (on === this.radioOn) return;
    this.radioOn = on;
    if (on && this.ctx) this.nextTime = this.ctx.currentTime + 0.05;
  }
  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.05;
    return STATIONS[this.station];
  }

  update() {
    if (!this.ctx || !this.radioOn) return;
    const st = STATIONS[this.station];
    if (st.id === 'off') return;
    const ctx = this.ctx;
    const stepDur = 60 / st.bpm / 4; // 16th notes
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(st.id, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  playStep(id, s, t, sd) {
    const m = this.music;
    const bar = Math.floor(s / 16), b = s % 16;
    if (id === 'techno') {
      if (b % 4 === 0) this.tone(m, t, 0.28, 'sine', 150, 42, 0.9, 0.002);
      if (b % 4 === 2) this.noiseBurst(m, t, 0.05, 'highpass', 8000, 0.7, 0.25);
      if (b === 4 || b === 12) this.noiseBurst(m, t, 0.15, 'bandpass', 1600, 0.8, 0.35);
      const bass = [33, 33, 45, 33, 36, 33, 45, 40];
      if (b % 2 === 1) this.tone(m, t, sd * 1.6, 'sawtooth', NOTE(bass[(b >> 1) % 8]), 0, 0.22, 0.004);
      if (bar % 4 >= 2) {
        const arp = [69, 72, 76, 79, 76, 72];
        if (b % 2 === 0) this.tone(this.musicDelay, t, sd * 1.2, 'square', NOTE(arp[(s >> 1) % arp.length]), 0, 0.05, 0.004);
      }
    } else if (id === 'oompah') {
      const chords = [[48, 55, 64, 67], [43, 50, 59, 67], [48, 55, 64, 67], [43, 50, 62, 65]];
      const ch = chords[bar % 4];
      if (b === 0 || b === 8) this.tone(m, t, 0.3, 'triangle', NOTE(b === 0 ? ch[0] : ch[1] - 12), 0, 0.55, 0.01);
      if (b === 4 || b === 12) {
        for (let k = 2; k < 4; k++) this.tone(m, t, 0.14, 'sawtooth', NOTE(ch[k]), 0, 0.06, 0.005);
        this.noiseBurst(m, t, 0.06, 'highpass', 6000, 0.6, 0.12);
      }
      if (b % 4 === 0) {
        const scale = [72, 74, 76, 77, 79, 81, 79, 76];
        const n = scale[(bar * 3 + (b >> 2)) % scale.length];
        this.tone(m, t, sd * 3.5, 'triangle', NOTE(n), 0, 0.12, 0.02);
      }
    } else if (id === 'classic') {
      const prog = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
      const ch = prog[bar % 4];
      if (b % 2 === 0) {
        const idx = [0, 1, 2, 3, 2, 1, 0, 1][(b >> 1) % 8];
        this.tone(this.musicDelay, t, 0.9, 'sine', NOTE(ch[idx]), 0, 0.14, 0.01);
        this.tone(m, t, 0.9, 'triangle', NOTE(ch[idx]), 0, 0.06, 0.01);
      }
      if (b === 0) this.tone(m, t, 2.2, 'sine', NOTE(ch[0] - 24), 0, 0.25, 0.05);
    } else if (id === 'synth') {
      const prog = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]];
      const ch = prog[bar % 4];
      if (b % 4 === 0) this.tone(m, t, 0.25, 'sine', 120, 45, 0.7);
      if (b === 4 || b === 12) this.noiseBurst(m, t, 0.25, 'bandpass', 1200, 0.5, 0.3);
      if (b % 2 === 0) this.tone(m, t, sd * 1.8, 'sawtooth', NOTE(ch[0]), 0, 0.14, 0.01);
      if (b === 0) for (let k = 1; k < 4; k++) this.tone(this.musicDelay, t, sd * 14, 'triangle', NOTE(ch[k] + 12), 0, 0.05, 0.2);
      if (b % 3 === 0) this.tone(this.musicDelay, t, sd, 'square', NOTE(ch[1 + (s % 3)] + 12), 0, 0.03, 0.004);
    }
  }
}
