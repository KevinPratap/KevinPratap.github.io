// Sound that follows the motion. A soft pad holds the room, a wind made of
// filtered noise rises whenever particles are in flight, and small bells mark
// the moments things settle. Everything is synthesized; nothing is loaded.

const KEY = 'kps-sound';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  constructor() { this.ctx = null; this.on = false; this.subs = new Set(); this.last = {}; }

  _build() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(ctx.destination);

    // a long, dark room
    const len = ctx.sampleRate * 3.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.55;
    this.wet.connect(this.verb); this.verb.connect(this.master);
    this.fx = ctx.createGain(); this.fx.connect(this.master); this.fx.connect(this.wet);

    const nlen = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    // pinkish noise: softer than white, reads as air rather than hiss
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < nlen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      nd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }

    // wind
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 500; this.windBP.Q.value = 0.9;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windBP); this.windBP.connect(this.windG); this.windG.connect(this.master); this.windG.connect(this.wet);
    src.start();

    // pad
    this.padLP = ctx.createBiquadFilter(); this.padLP.type = 'lowpass'; this.padLP.frequency.value = 900; this.padLP.Q.value = 0.7;
    this.padG = ctx.createGain(); this.padG.gain.value = 0;
    this.padLP.connect(this.padG); this.padG.connect(this.master); this.padG.connect(this.wet);
    this.voices = [0, 1, 2, 3].map((i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine';
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.42 : 0.2;
      o.detune.value = (i - 1.5) * 5;
      o.connect(g); g.connect(this.padLP); o.start();
      return o;
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const amt = ctx.createGain(); amt.gain.value = 350; lfo.connect(amt); amt.connect(this.padLP.frequency); lfo.start();
    this.chord(this.current || 'hello', true);

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.on) this.ctx.resume();
    });
    return true;
  }

  _to(p, v, t = 0.3) { const n = this.ctx.currentTime; p.cancelScheduledValues(n); p.setValueAtTime(p.value, n); p.setTargetAtTime(v, n, t / 3); }
  _gap(k, ms) { const n = performance.now(); if (this.last[k] && n - this.last[k] < ms) return false; this.last[k] = n; return true; }

  async enable(on) {
    if (on && !this._build()) return;
    if (!this.ctx) return;
    this.on = on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (on && this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) {} }
    this._to(this.master.gain, on ? 0.95 : 0, on ? 1.2 : 0.4);
    this._to(this.padG.gain, on ? 0.05 : 0, 3);
    if (on) this.bell(659.25, 0.07);
    this.subs.forEach((f) => f(on));
  }
  toggle() { return this.enable(!this.on); }
  onChange(f) { this.subs.add(f); }
  static wanted() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }

  // flight: 0..1 how much is in motion; speed: scroll speed
  wind(flight, speed) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const g = Math.min(0.2, flight * 0.12 + Math.min(1, Math.abs(speed) / 40) * 0.08);
    this.windG.gain.setTargetAtTime(g, t, 0.12);
    this.windBP.frequency.setTargetAtTime(300 + flight * 1500 + Math.min(1, Math.abs(speed) / 40) * 1200, t, 0.15);
  }

  chords = {
    hello: [45, 52, 57, 64], about: [41, 48, 57, 64], work: [43, 50, 59, 66], ld: [45, 52, 59, 64], trip: [41, 48, 55, 64],
    gods: [38, 45, 53, 60], tools: [43, 50, 57, 62], clients: [45, 52, 61, 64], systems: [40, 47, 55, 62],
    cast: [38, 45, 54, 61], more: [43, 50, 57, 64], contact: [45, 52, 57, 61],
  };
  chord(name, now = false) {
    this.current = name;
    if (!this.ctx) return;
    const c = this.chords[name] || this.chords.hello;
    this.voices.forEach((o, i) => {
      const f = mtof(c[i]);
      if (now) o.frequency.value = f; else o.frequency.setTargetAtTime(f, this.ctx.currentTime, 1.2);
    });
  }

  bell(f = 523.25, level = 0.06) {
    if (!this.on || !this._gap('bell' + f, 300)) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    [[1, 1], [2.0, 0.3], [3.01, 0.1]].forEach(([r, a]) => {
      const car = ctx.createOscillator(); car.frequency.value = f * r;
      const mod = ctx.createOscillator(); mod.frequency.value = f * r * 1.5;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(f * r * 0.8, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.5);
      mod.connect(mg); mg.connect(car.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level * a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      car.connect(g); g.connect(this.fx); car.start(t); mod.start(t); car.stop(t + 3.3); mod.stop(t + 3.3);
    });
  }

  tick(level = 0.02) {
    if (!this.on || !this._gap('tick', 50)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(2400, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.04);
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + 0.08);
  }

  // a breath of noise that sweeps up: used when the intro assembles
  swell(dur = 2.6, level = 0.12) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.8);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.fx); s.start(t); s.stop(t + dur + 0.1);
  }
}

export const sound = new Sound();
export const soundWanted = () => Sound.wanted();
