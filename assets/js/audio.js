// Sound engine. Every sound on the site is synthesized here, live.
// Nothing plays until the visitor opts in with a gesture.

const STORE = 'kps-sound';

class Engine {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.listeners = new Set();
    this._last = {};
  }

  get ready() { return !!this.ctx; }

  _build() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(comp); comp.connect(this.analyser); this.analyser.connect(ctx.destination);
    this.scopeBuf = new Uint8Array(this.analyser.fftSize);

    // room: a short generated impulse, so sfx sit in a space instead of the speaker cone
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.4, 2.8);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.35;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 1;
    this.sfx.connect(this.master); this.sfx.connect(this.verbIn);

    // white noise buffer reused by everything that hisses
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // the bed: band-passed static that the whole site is tuned against
    this.bedSrc = ctx.createBufferSource(); this.bedSrc.buffer = this.noise; this.bedSrc.loop = true;
    this.bedBP = ctx.createBiquadFilter(); this.bedBP.type = 'bandpass'; this.bedBP.frequency.value = 1800; this.bedBP.Q.value = 0.5;
    this.bedLP = ctx.createBiquadFilter(); this.bedLP.type = 'lowpass'; this.bedLP.frequency.value = 9000;
    this.bedGain = ctx.createGain(); this.bedGain.gain.value = 0;
    this.bedSrc.connect(this.bedBP); this.bedBP.connect(this.bedLP); this.bedLP.connect(this.bedGain); this.bedGain.connect(this.master);
    this.bedSrc.start();

    // carrier whistle used while tuning: a heterodyne that slides into a clean tone
    this.car = ctx.createOscillator(); this.car.type = 'sine'; this.car.frequency.value = 520;
    this.car2 = ctx.createOscillator(); this.car2.type = 'sine'; this.car2.frequency.value = 523;
    this.carGain = ctx.createGain(); this.carGain.gain.value = 0;
    this.car.connect(this.carGain); this.car2.connect(this.carGain); this.carGain.connect(this.master);
    this.car.start(); this.car2.start();

    // drone: three voices through a slowly breathing low-pass
    this.droneLP = ctx.createBiquadFilter(); this.droneLP.type = 'lowpass'; this.droneLP.frequency.value = 520; this.droneLP.Q.value = 3;
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    this.droneLP.connect(this.droneGain); this.droneGain.connect(this.master); this.droneGain.connect(this.verbIn);
    this.voices = [0, 1, 2].map((i) => {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sawtooth';
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.16;
      o.connect(g); g.connect(this.droneLP); o.start();
      o.detune.value = (i - 1) * 6;
      return o;
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 220;
    lfo.connect(lfoAmt); lfoAmt.connect(this.droneLP.frequency); lfo.start();
    this.setChord('hero', true);

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.on) this.ctx.resume();
    });
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _ramp(param, v, t = 0.2) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(v, now, t / 3);
  }

  // throttle helper so scroll-driven sfx never pile up
  _ok(key, ms) {
    const n = performance.now();
    if (this._last[key] && n - this._last[key] < ms) return false;
    this._last[key] = n; return true;
  }

  async enable(on = true) {
    if (on) this._build();
    if (!this.ctx) return;
    this.on = on;
    try { localStorage.setItem(STORE, on ? '1' : '0'); } catch (e) {}
    if (on && this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) {} }
    this._ramp(this.master.gain, on ? 0.9 : 0, on ? 0.6 : 0.25);
    this._ramp(this.droneGain.gain, on ? 0.045 : 0, 2.5);
    this.listeners.forEach((f) => f(on));
  }
  toggle() { return this.enable(!this.on); }
  onChange(f) { this.listeners.add(f); }
  static wanted() { try { return localStorage.getItem(STORE); } catch (e) { return null; } }

  // ── continuous layers ──────────────────────────────────────────
  bed(level, freq = 1800, q = 0.5, t = 0.25) {
    if (!this.ctx) return;
    this._ramp(this.bedGain.gain, level, t);
    this._ramp(this.bedBP.frequency, freq, t);
    this._ramp(this.bedBP.Q, q, t);
  }

  // used by the gate: x = 0 (lost) … 1 (locked)
  tuning(x) {
    if (!this.ctx) return;
    const off = (1 - x) * (1 - x);
    this.car2.frequency.setTargetAtTime(523.25 + off * 140 + Math.sin(performance.now() / 90) * off * 12, this.ctx.currentTime, 0.03);
    this.car.frequency.setTargetAtTime(523.25 - off * 60, this.ctx.currentTime, 0.03);
    this.carGain.gain.setTargetAtTime(x > 0.02 ? 0.02 + x * 0.05 : 0, this.ctx.currentTime, 0.05);
    this.bedGain.gain.setTargetAtTime(0.16 * (1 - x * 0.75), this.ctx.currentTime, 0.05);
    this.bedBP.frequency.setTargetAtTime(900 + x * 2600, this.ctx.currentTime, 0.05);
    this.bedBP.Q.setTargetAtTime(0.4 + x * 3, this.ctx.currentTime, 0.05);
  }
  carrierOff(t = 1.2) { if (this.ctx) this._ramp(this.carGain.gain, 0, t); }

  chords = {
    hero: [45, 52, 57],     // A — open, settled
    noise: [44, 51, 55],    // G#, a little sour
    filters: [45, 52, 59],  // A sus, resolving
    cases: [41, 48, 57],    // F lydian colour
    volume: [43, 50, 59],   // G
    spectrum: [38, 45, 54], // D
    onair: [40, 47, 55],    // E minor, night
    transmit: [45, 52, 61], // A major, home
  };
  setChord(name, instant = false) {
    if (!this.ctx) return;
    const notes = this.chords[name] || this.chords.hero;
    this.voices.forEach((o, i) => {
      const f = 440 * Math.pow(2, (notes[i] - 69) / 12);
      if (instant) o.frequency.value = f;
      else o.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.9);
    });
  }

  // ── one shots ──────────────────────────────────────────────────
  tick(freq = 2600, level = 0.05, key = 'tick', gap = 28) {
    if (!this.on || !this._ok(key, gap)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(bp); bp.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.06);
  }

  click(level = 0.08) {
    if (!this.on || !this._ok('click', 30)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    s.connect(hp); hp.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + 0.04);
  }

  // FM bell for the lock moment
  chime(base = 523.25, level = 0.12) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    [[1, 1], [1.5, 0.55], [2, 0.35], [3.01, 0.12]].forEach(([r, a], i) => {
      const car = ctx.createOscillator(); car.frequency.value = base * r;
      const mod = ctx.createOscillator(); mod.frequency.value = base * r * 2.01;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(base * r * 1.4, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
      mod.connect(mg); mg.connect(car.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.035);
      g.gain.linearRampToValueAtTime(level * a, t + i * 0.035 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      car.connect(g); g.connect(this.sfx);
      car.start(t); mod.start(t); car.stop(t + 3); mod.stop(t + 3);
    });
  }

  thump(level = 0.35) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.65);
  }

  // data burst for images decoding in: stepped square tones, like a modem talking to itself
  chirp(dur = 0.55, level = 0.022) {
    if (!this.on || !this._ok('chirp', 120)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(level, t0 + 0.01);
    const steps = Math.floor(dur / 0.022);
    const tones = [1200, 1800, 2400, 2100, 1500, 2700, 980, 3000];
    for (let i = 0; i < steps; i++) o.frequency.setValueAtTime(tones[(Math.random() * tones.length) | 0], t0 + i * 0.022);
    g.gain.setValueAtTime(level, t0 + dur - 0.03); g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(bp); bp.connect(g); g.connect(this.sfx); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  staticBurst(dur = 0.12, level = 0.06, key = 'static') {
    if (!this.on || !this._ok(key, 50)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 1800; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  whoosh(dur = 0.7, level = 0.08, up = true) {
    if (!this.on || !this._ok('whoosh', 160)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(up ? 280 : 3200, t); bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 280, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  tone(freq = 440, dur = 0.9, level = 0.06, key = 'tone') {
    if (!this.on || !this._ok(key, 40)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = freq;
    const b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = freq * 2.001;
    const bg = ctx.createGain(); bg.gain.value = 0.18;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    a.connect(g); b.connect(bg); bg.connect(g); g.connect(this.sfx);
    a.start(t); b.start(t); a.stop(t + dur + 0.05); b.stop(t + dur + 0.05);
  }

  // filter sweep on a burst of static: the sound of a rule taking noise out
  sweepDown(level = 0.09) {
    if (!this.on || !this._ok('sweep', 140)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 9;
    lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    s.connect(lp); lp.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + 0.65);
  }

  scope() {
    if (!this.ctx || !this.on) return null;
    this.analyser.getByteTimeDomainData(this.scopeBuf);
    return this.scopeBuf;
  }
}

export const audio = new Engine();
export const soundWanted = () => Engine.wanted();
