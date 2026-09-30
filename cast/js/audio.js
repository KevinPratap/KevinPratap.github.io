// Procedural sound effects. No audio files: everything is synthesized from
// noise and oscillators, and the mix is also routed into recordings.

export class SFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.targets = {};
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.comp = comp;

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.6, 2.8);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.3;
    this.verbIn.connect(this.verb);
    this.verb.connect(this.master);

    this.noise = this.noiseBuffer(2);
    this.loops = {};
    this.buildLoops();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  // A fresh destination per recording keeps audio timestamps aligned with
  // the new video track (a long-lived one makes MP4 durations wrong).
  newStream() {
    if (!this.ctx) return null;
    this.endStream();
    this.recDest = this.ctx.createMediaStreamDestination();
    this.comp.connect(this.recDest);
    if (this.mic) this.mic.connect(this.recDest);
    return this.recDest.stream;
  }

  endStream() {
    if (!this.recDest) return;
    try { this.comp.disconnect(this.recDest); } catch (e) { /* already disconnected */ }
    if (this.mic) { try { this.mic.disconnect(this.recDest); } catch (e) { /* not connected */ } }
    this.recDest = null;
  }

  // The mic bus joins recordings and the replay buffer, never the speakers.
  attachMic(node) {
    if (this.mic) {
      if (this.recDest) { try { this.mic.disconnect(this.recDest); } catch (e) { /* */ } }
      if (this.ringIn) { try { this.mic.disconnect(this.ringIn); } catch (e) { /* */ } }
    }
    this.mic = node;
    if (node) {
      if (this.recDest) node.connect(this.recDest);
      if (this.ringIn) node.connect(this.ringIn);
    }
  }

  // Rolling capture of everything audible (SFX + mic) for instant replays.
  startRing(seconds = 9) {
    if (!this.ctx || this.ring) return;
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
    this.ring = { L: new Float32Array(len), R: new Float32Array(len), len, abs: 0, t: 0 };
    this.ringIn = ctx.createGain();
    this.comp.connect(this.ringIn);
    if (this.mic) this.mic.connect(this.ringIn);
    const proc = ctx.createScriptProcessor(4096, 2, 2);
    this.ringIn.connect(proc);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    proc.connect(mute);
    mute.connect(ctx.destination);
    proc.onaudioprocess = (e) => {
      const r = this.ring, inL = e.inputBuffer.getChannelData(0);
      const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
      for (let i = 0; i < inL.length; i++) {
        const j = (r.abs + i) % r.len;
        r.L[j] = inL[i]; r.R[j] = inR[i];
      }
      r.abs += inL.length;
      r.t = ctx.currentTime;
    };
    this.ringProc = proc;
  }

  // AudioBuffer covering context time t0..t1 (clamped to what's buffered).
  ringSlice(t0, t1) {
    const r = this.ring;
    if (!r || !r.abs) return null;
    const sr = this.ctx.sampleRate;
    const end = r.abs, start = Math.max(0, end - r.len + 1);
    let a = Math.round(end - (r.t - t0) * sr), b = Math.round(end - (r.t - t1) * sr);
    a = Math.max(start, Math.min(end, a)); b = Math.max(a + 1, Math.min(end, b));
    const n = b - a;
    const buf = this.ctx.createBuffer(2, n, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < n; i++) {
      const j = (a + i) % r.len;
      L[i] = r.L[j]; R[i] = r.R[j];
    }
    return buf;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
  }

  impulse(dur, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(sec) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  out(node, send) {
    node.connect(this.master);
    if (send) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(this.verbIn);
    }
  }

  hit({ dur = 0.4, type = 'bandpass', f0 = 800, f1 = 200, q = 1, gain = 0.5, attack = 0.006, send = 0.3, when = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    this.out(g, send);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone({ type = 'sine', f0 = 200, f1 = 60, dur = 0.5, gain = 0.5, attack = 0.006, send = 0.2, when = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.out(g, send);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, s = 1) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'appear':
        this.tone({ type: 'triangle', f0: 500, f1: 1100, dur: 0.16, gain: 0.07, send: 0.1 });
        break;
      case 'ready':
        this.tone({ type: 'sine', f0: 700, f1: 1500, dur: 0.28, gain: 0.14 });
        this.tone({ type: 'triangle', f0: 1400, f1: 2800, dur: 0.22, gain: 0.06, when: 0.05 });
        break;
      case 'throw':
        this.hit({ type: 'bandpass', f0: 450, f1: 2800, q: 1.3, dur: 0.3, gain: 0.5 });
        this.tone({ f0: 190, f1: 55, dur: 0.28, gain: 0.4 });
        break;
      case 'explode':
        this.hit({ type: 'lowpass', f0: 3200, f1: 110, dur: 1.0 * s, gain: 0.9, send: 0.45 });
        this.tone({ f0: 130, f1: 28, dur: 0.9 * s, gain: 0.9 });
        this.hit({ type: 'highpass', f0: 5000, f1: 2200, dur: 0.14, gain: 0.25 });
        break;
      case 'whip':
        this.hit({ type: 'bandpass', f0: 900, f1: 3400, q: 2, dur: 0.18, gain: 0.35, send: 0.15 });
        break;
      case 'crack':
        this.hit({ type: 'highpass', f0: 2600, f1: 6500, dur: 0.07, gain: 0.6, attack: 0.002, send: 0.35 });
        this.tone({ type: 'square', f0: 2300, f1: 500, dur: 0.05, gain: 0.1 });
        break;
      case 'nova':
        this.hit({ type: 'lowpass', f0: 6000, f1: 70, dur: 1.7, gain: 1.0, send: 0.55 });
        this.tone({ f0: 150, f1: 24, dur: 1.4, gain: 1.0 });
        this.tone({ type: 'sawtooth', f0: 90, f1: 40, dur: 1.2, gain: 0.25, send: 0.4 });
        break;
      case 'thud':
        this.tone({ f0: 120, f1: 36, dur: 0.32, gain: 0.95 });
        this.hit({ type: 'lowpass', f0: 900, f1: 120, dur: 0.22, gain: 0.5 });
        break;
      case 'debris':
        this.hit({ type: 'bandpass', f0: 1800, f1: 700, q: 1.2, dur: 0.09, gain: 0.35, attack: 0.002 });
        this.tone({ type: 'square', f0: 340, f1: 160, dur: 0.06, gain: 0.08 });
        break;
      case 'singularity':
        this.tone({ f0: 55, f1: 28, dur: 1.4, gain: 0.9 });
        this.hit({ type: 'lowpass', f0: 3000, f1: 80, dur: 1.2, gain: 0.5, attack: 0.3, send: 0.5 });
        break;
      case 'holo':
        this.tone({ f0: 660, f1: 1320, dur: 0.18, gain: 0.16, send: 0.4 });
        this.tone({ f0: 990, f1: 1980, dur: 0.22, gain: 0.1, send: 0.4 });
        break;
      case 'whoomp':
        this.hit({ type: 'lowpass', f0: 250, f1: 2200, dur: 0.55, gain: 0.55, attack: 0.08 });
        break;
      case 'push':
        this.tone({ f0: 240, f1: 38, dur: 0.55, gain: 0.95 });
        this.hit({ type: 'bandpass', f0: 280, f1: 1600, q: 0.8, dur: 0.4, gain: 0.5, send: 0.4 });
        break;
      case 'portal':
        this.hit({ type: 'lowpass', f0: 7000, f1: 160, dur: 1.5, gain: 0.95, send: 0.6 });
        this.tone({ f0: 100, f1: 26, dur: 1.2, gain: 0.95 });
        [440, 659, 880].forEach((f, i) => this.tone({ type: 'triangle', f0: f, f1: f * 1.01, dur: 1.6, gain: 0.07, attack: 0.05, send: 0.8, when: 0.05 * i }));
        break;
      case 'collapse':
        this.tone({ f0: 70, f1: 520, dur: 0.32, gain: 0.45, attack: 0.25 });
        this.tone({ f0: 210, f1: 34, dur: 0.5, gain: 0.9, when: 0.32 });
        this.hit({ type: 'lowpass', f0: 3000, f1: 100, dur: 0.6, gain: 0.7, when: 0.32, send: 0.5 });
        break;
      case 'intro':
        this.hit({ type: 'bandpass', f0: 180, f1: 3200, q: 0.9, dur: 0.55, gain: 0.35, attack: 0.4 });
        this.tone({ f0: 90, f1: 30, dur: 0.9, gain: 0.8, when: 0.45 });
        this.hit({ type: 'lowpass', f0: 4000, f1: 120, dur: 0.9, gain: 0.6, when: 0.45, send: 0.5 });
        break;
      case 'zap':
        this.hit({ type: 'highpass', f0: 3000, f1: 7000, dur: 0.09 * s, gain: 0.35, attack: 0.002, send: 0.2 });
        this.tone({ type: 'square', f0: 1800, f1: 300, dur: 0.07 * s, gain: 0.08 });
        this.tone({ type: 'sawtooth', f0: 120, f1: 60, dur: 0.1 * s, gain: 0.12, send: 0.1 });
        break;
      case 'thunder':
        this.hit({ type: 'highpass', f0: 2400, f1: 5000, dur: 0.12, gain: 0.9, attack: 0.001, send: 0.5 });
        this.tone({ type: 'square', f0: 900, f1: 80, dur: 0.12, gain: 0.25 });
        this.hit({ type: 'lowpass', f0: 1800, f1: 60, dur: 1.6 * s, gain: 0.9, attack: 0.03, send: 0.7, when: 0.04 });
        this.tone({ f0: 70, f1: 25, dur: 1.4 * s, gain: 0.9, when: 0.04 });
        break;
      case 'rail':
        this.tone({ type: 'sawtooth', f0: 2600, f1: 90, dur: 0.35, gain: 0.3, attack: 0.002, send: 0.3 });
        this.hit({ type: 'bandpass', f0: 5000, f1: 600, q: 1.5, dur: 0.3, gain: 0.8, attack: 0.001, send: 0.4 });
        this.tone({ f0: 160, f1: 30, dur: 0.6, gain: 1.0 });
        break;
      case 'tear':
        this.hit({ type: 'bandpass', f0: 6000, f1: 400, q: 3, dur: 0.45, gain: 0.7, attack: 0.002, send: 0.6 });
        this.tone({ type: 'sawtooth', f0: 1400, f1: 40, dur: 0.5, gain: 0.25, send: 0.5 });
        this.tone({ f0: 90, f1: 30, dur: 0.8, gain: 0.8, when: 0.03 });
        break;
      case 'kiblast':
        this.tone({ type: 'triangle', f0: 900, f1: 250, dur: 0.14, gain: 0.25, send: 0.15 });
        this.hit({ type: 'bandpass', f0: 1200, f1: 3500, q: 1.4, dur: 0.14, gain: 0.35, send: 0.15 });
        break;
      case 'kiwave':
        this.hit({ type: 'lowpass', f0: 8000, f1: 300, dur: 1.2, gain: 1.0, attack: 0.01, send: 0.5 });
        this.tone({ f0: 180, f1: 40, dur: 1.0, gain: 1.0 });
        this.tone({ type: 'sawtooth', f0: 220, f1: 330, dur: 1.2, gain: 0.18, send: 0.5 });
        break;
      case 'awaken':
        this.hit({ type: 'lowpass', f0: 7000, f1: 90, dur: 2.0, gain: 1.0, send: 0.6 });
        this.tone({ f0: 120, f1: 22, dur: 1.6, gain: 1.0 });
        [220, 277, 330, 440].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, f1: f * 1.5, dur: 1.4, gain: 0.07, attack: 0.08, send: 0.8, when: 0.02 * i }));
        break;
      case 'step':
        this.hit({ type: 'bandpass', f0: 400, f1: 6000, q: 1.2, dur: 0.16, gain: 0.55, attack: 0.002, send: 0.3 });
        this.tone({ type: 'sine', f0: 1500, f1: 3000, dur: 0.1, gain: 0.14, when: 0.12 });
        this.tone({ type: 'sine', f0: 2000, f1: 900, dur: 0.12, gain: 0.1, when: 0.14 });
        break;
      case 'overload':
        this.play('thunder', 1.3);
        this.hit({ type: 'lowpass', f0: 6000, f1: 70, dur: 1.5, gain: 1.0, send: 0.6, when: 0.02 });
        break;
      case 'seal':
        this.tone({ type: 'triangle', f0: 620 + s * 170, f1: 420 + s * 120, dur: 0.11, gain: 0.2, send: 0.35 });
        this.hit({ type: 'highpass', f0: 4200, f1: 7000, dur: 0.04, gain: 0.3, attack: 0.001, send: 0.2 });
        this.tone({ type: 'sine', f0: 1800 + s * 240, f1: 2400 + s * 240, dur: 0.16, gain: 0.07, when: 0.05, send: 0.6 });
        break;
      case 'poof':
        this.hit({ type: 'lowpass', f0: 2600, f1: 160, dur: 0.55 * s, gain: 0.75, attack: 0.004, send: 0.4 });
        this.tone({ f0: 160, f1: 45, dur: 0.35, gain: 0.55 });
        this.hit({ type: 'highpass', f0: 5500, f1: 3000, dur: 0.1, gain: 0.2 });
        break;
      case 'kunai':
        this.hit({ type: 'bandpass', f0: 2200, f1: 7500, q: 1.6, dur: 0.22, gain: 0.5, send: 0.2 });
        this.tone({ type: 'triangle', f0: 3200, f1: 1600, dur: 0.1, gain: 0.08, when: 0.12, send: 0.5 });
        break;
      case 'chime':
        [880, 1318, 1760, 2637].forEach((f, i) => this.tone({ type: 'triangle', f0: f, f1: f * 1.005, dur: 1.3, gain: 0.09 - i * 0.012, attack: 0.004, send: 0.9, when: 0.06 * i }));
        this.tone({ f0: 110, f1: 55, dur: 0.6, gain: 0.5 });
        break;
      case 'rewind':
        this.hit({ type: 'bandpass', f0: 200, f1: 7000, q: 1.2, dur: 0.9, gain: 0.5, attack: 0.7, send: 0.6 });
        this.tone({ type: 'sawtooth', f0: 120, f1: 1800, dur: 0.85, gain: 0.16, attack: 0.7, send: 0.5 });
        this.tone({ f0: 90, f1: 26, dur: 0.9, gain: 0.9, when: 0.85 });
        break;
      case 'mirror':
        this.hit({ type: 'lowpass', f0: 9000, f1: 200, dur: 1.4, gain: 0.7, send: 0.7 });
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'sine', f0: f, f1: f * 2, dur: 1.2, gain: 0.08, attack: 0.05, send: 0.9, when: 0.07 * i }));
        this.tone({ f0: 100, f1: 30, dur: 1.0, gain: 0.8 });
        break;
      case 'repulsor':
        this.tone({ type: 'sawtooth', f0: 300, f1: 2400, dur: 0.16, gain: 0.25, attack: 0.002, send: 0.3 });
        this.tone({ f0: 170, f1: 28, dur: 0.7, gain: 1.0, when: 0.05 });
        this.hit({ type: 'highpass', f0: 4000, f1: 9000, dur: 0.16, gain: 0.5, attack: 0.002, send: 0.4, when: 0.03 });
        this.hit({ type: 'lowpass', f0: 3500, f1: 120, dur: 0.7 * s, gain: 0.6, when: 0.05, send: 0.4 });
        break;
      case 'lock':
        this.tone({ type: 'square', f0: 1900, f1: 1880, dur: 0.05, gain: 0.07, send: 0.1 });
        this.tone({ type: 'square', f0: 2500, f1: 2480, dur: 0.06, gain: 0.07, when: 0.08, send: 0.1 });
        break;
      case 'hud':
        [900, 1200, 1600, 2100].forEach((f, i) => this.tone({ type: 'square', f0: f, f1: f, dur: 0.05, gain: 0.05, when: 0.06 * i, send: 0.2 }));
        this.hit({ type: 'bandpass', f0: 300, f1: 5000, q: 1, dur: 0.35, gain: 0.25, attack: 0.25 });
        break;
      case 'missile':
        this.hit({ type: 'bandpass', f0: 700, f1: 3800, q: 1.1, dur: 0.6, gain: 0.45, attack: 0.02, send: 0.3 });
        this.tone({ type: 'sawtooth', f0: 220, f1: 700, dur: 0.4, gain: 0.08, send: 0.2 });
        break;
      case 'suit':
        for (let i = 0; i < 5; i++) {
          this.hit({ type: 'bandpass', f0: 1800 + i * 300, f1: 600, q: 4, dur: 0.06, gain: 0.5, attack: 0.001, when: i * 0.09, send: 0.3 });
          this.tone({ type: 'square', f0: 260 + i * 40, f1: 140, dur: 0.05, gain: 0.1, when: i * 0.09 });
        }
        this.hit({ type: 'lowpass', f0: 7000, f1: 90, dur: 1.6, gain: 0.95, when: 0.5, send: 0.6 });
        this.tone({ f0: 130, f1: 24, dur: 1.4, gain: 1.0, when: 0.5 });
        [330, 495, 660].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, f1: f * 1.6, dur: 1.2, gain: 0.06, attack: 0.1, send: 0.8, when: 0.5 + 0.03 * i }));
        break;
      // ---- blade & telekinesis ----
      case 'ignite':
        // snap-hiss: a bright crack, then a rising saw that settles into the hum
        this.hit({ type: 'highpass', f0: 3500, f1: 900, dur: 0.12, gain: 0.5, attack: 0.002, send: 0.3 });
        this.tone({ type: 'sawtooth', f0: 60, f1: 180, dur: 0.35, gain: 0.3, send: 0.35 });
        this.hit({ type: 'bandpass', f0: 600, f1: 2400, q: 2, dur: 0.3, gain: 0.35, send: 0.3 });
        break;
      case 'retract':
        this.tone({ type: 'sawtooth', f0: 180, f1: 40, dur: 0.3, gain: 0.28, send: 0.3 });
        this.hit({ type: 'bandpass', f0: 2000, f1: 400, q: 2, dur: 0.25, gain: 0.25 });
        break;
      case 'swing':
        this.hit({ type: 'bandpass', f0: 300 * s, f1: 1100 * s, q: 3, dur: 0.22, gain: 0.28, attack: 0.03, send: 0.25 });
        this.tone({ type: 'sawtooth', f0: 140 * s, f1: 95, dur: 0.22, gain: 0.12, send: 0.2 });
        break;
      case 'blaster':
        this.tone({ type: 'square', f0: 1900, f1: 180, dur: 0.18, gain: 0.16, send: 0.3 });
        this.tone({ type: 'sawtooth', f0: 1200, f1: 90, dur: 0.22, gain: 0.1, send: 0.4 });
        break;
      case 'deflect':
        this.tone({ type: 'square', f0: 2600, f1: 900, dur: 0.12, gain: 0.18, send: 0.35 });
        this.hit({ type: 'highpass', f0: 4200, f1: 2000, dur: 0.1, gain: 0.45, attack: 0.002, send: 0.3 });
        this.tone({ type: 'sawtooth', f0: 240, f1: 120, dur: 0.18, gain: 0.2 });
        break;
      case 'clash':
        this.hit({ type: 'highpass', f0: 5000, f1: 1600, dur: 0.25, gain: 0.6, attack: 0.001, send: 0.45 });
        this.tone({ type: 'sawtooth', f0: 300, f1: 90, dur: 0.3, gain: 0.3, send: 0.3 });
        break;
      case 'crush':
        // metal crumpling: stacked short bandpassed noise hits
        for (let i = 0; i < 5; i++) this.hit({ type: 'bandpass', f0: 1400 - i * 180, f1: 300, q: 4, dur: 0.12, gain: 0.35, attack: 0.002, when: i * 0.045, send: 0.2 });
        this.tone({ f0: 140, f1: 40, dur: 0.4, gain: 0.7 });
        break;
      case 'lift':
        this.hit({ type: 'lowpass', f0: 120, f1: 900, dur: 1.2, gain: 0.5, attack: 0.4, send: 0.5 });
        this.tone({ f0: 50, f1: 70, dur: 1.2, gain: 0.5, attack: 0.3 });
        break;
      case 'slam':
        this.tone({ f0: 90, f1: 22, dur: 0.9, gain: 1.0 });
        this.hit({ type: 'lowpass', f0: 2600, f1: 60, dur: 1.1, gain: 0.9, send: 0.5 });
        break;
      // ---- ninja ----
      case 'rasengan':
        this.hit({ type: 'bandpass', f0: 300, f1: 2200, q: 1.2, dur: 0.6, gain: 0.5, attack: 0.1, send: 0.4 });
        this.tone({ f0: 90, f1: 220, dur: 0.6, gain: 0.35 });
        break;
      case 'chidori':
        this.hit({ type: 'highpass', f0: 3000, f1: 7000, dur: 0.3, gain: 0.35, attack: 0.02, send: 0.3 });
        this.tone({ type: 'square', f0: 2200, f1: 3200, dur: 0.3, gain: 0.08 });
        break;
      case 'fireball':
        this.hit({ type: 'lowpass', f0: 400, f1: 2600, dur: 1.4, gain: 0.95, attack: 0.25, send: 0.5 });
        this.tone({ f0: 70, f1: 38, dur: 1.4, gain: 0.8, attack: 0.1 });
        break;
      // ---- limitless ----
      case 'blue':
        this.tone({ type: 'sine', f0: 900, f1: 180, dur: 0.6, gain: 0.3, send: 0.6 });
        this.hit({ type: 'lowpass', f0: 3000, f1: 200, dur: 0.8, gain: 0.5, attack: 0.1, send: 0.5 });
        break;
      case 'red':
        this.tone({ type: 'sawtooth', f0: 90, f1: 420, dur: 0.35, gain: 0.35, send: 0.4 });
        this.hit({ type: 'lowpass', f0: 5000, f1: 120, dur: 0.9, gain: 0.95, attack: 0.002, send: 0.5 });
        this.tone({ f0: 110, f1: 26, dur: 0.8, gain: 0.95 });
        break;
      case 'purple':
        this.tone({ type: 'sine', f0: 1800, f1: 60, dur: 2.4, gain: 0.35, send: 0.8 });
        this.hit({ type: 'lowpass', f0: 7000, f1: 50, dur: 2.2, gain: 1.0, attack: 0.02, send: 0.7 });
        this.tone({ f0: 70, f1: 20, dur: 2.0, gain: 1.0 });
        break;
      case 'domain':
        // a deep bell toll with a shimmering cluster over it
        [55, 110, 165.5, 221].forEach((f, i) => this.tone({ type: 'sine', f0: f, f1: f * 0.995, dur: 3.2, gain: 0.3 / (i + 1), attack: 0.004, send: 0.9 }));
        [1318, 1760, 2349, 2637].forEach((f, i) => this.tone({ type: 'triangle', f0: f, f1: f * 1.004, dur: 2.4, gain: 0.04, attack: 0.3, send: 1.0, when: 0.2 + i * 0.12 }));
        this.hit({ type: 'lowpass', f0: 200, f1: 3000, dur: 2.5, gain: 0.5, attack: 1.2, send: 0.8 });
        break;
      case 'snap':
        this.hit({ type: 'bandpass', f0: 2800, f1: 2400, q: 3, dur: 0.05, gain: 0.7, attack: 0.001, send: 0.3 });
        break;
      case 'shutter':
        this.tone({ type: 'square', f0: 1600, f1: 1500, dur: 0.04, gain: 0.08, send: 0 });
        break;
      default:
        break;
    }
  }

  buildLoops() {
    const ctx = this.ctx;
    const noiseSrc = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, Math.random());
      return s;
    };
    const bus = (base) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      this.out(g, 0.35);
      return { g, base, level: 0 };
    };

    // Rising energy whine while charging.
    const charge = bus(0.32);
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.Q.value = 3; cf.frequency.value = 400;
    noiseSrc().connect(cf); cf.connect(charge.g);
    const co = ctx.createOscillator(); co.type = 'sawtooth'; co.frequency.value = 110;
    const cl = ctx.createBiquadFilter(); cl.type = 'lowpass'; cl.frequency.value = 500;
    const cg = ctx.createGain(); cg.gain.value = 0.35;
    co.connect(cl); cl.connect(cg); cg.connect(charge.g); co.start();
    charge.apply = (L, t) => {
      cf.frequency.setTargetAtTime(300 + L * 2600, t, 0.05);
      co.frequency.setTargetAtTime(90 + L * 260, t, 0.05);
    };

    // Fire roar with flutter.
    const roar = bus(0.55);
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 600;
    const trem = ctx.createGain(); trem.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.3;
    lfo.connect(lfoAmt); lfoAmt.connect(trem.gain); lfo.start();
    noiseSrc().connect(rf); rf.connect(trem); trem.connect(roar.g);
    roar.apply = (L, t) => rf.frequency.setTargetAtTime(400 + L * 900, t, 0.1);

    // Sub-bass drone for the singularity.
    const drone = bus(0.7);
    const d1 = ctx.createOscillator(); d1.frequency.value = 42;
    const d2 = ctx.createOscillator(); d2.frequency.value = 42.8;
    d1.connect(drone.g); d2.connect(drone.g); d1.start(); d2.start();
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 200;
    noiseSrc().connect(df); df.connect(drone.g);
    drone.apply = (L, t) => {
      d1.frequency.setTargetAtTime(38 + L * 30, t, 0.2);
      d2.frequency.setTargetAtTime(38.9 + L * 31, t, 0.2);
    };

    // Detuned chord for an open portal.
    const hum = bus(0.22);
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 500; hf.Q.value = 4;
    [55, 82.6, 110.4, 165].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(hf); o.start();
    });
    hf.connect(hum.g);
    const hl = ctx.createOscillator(); hl.frequency.value = 0.35;
    const hla = ctx.createGain(); hla.gain.value = 300;
    hl.connect(hla); hla.connect(hf.frequency); hl.start();
    hum.apply = () => {};

    // Sucking wind for Pull.
    const vortex = bus(0.4);
    const vf = ctx.createBiquadFilter(); vf.type = 'bandpass'; vf.Q.value = 5; vf.frequency.value = 700;
    const vl = ctx.createOscillator(); vl.frequency.value = 3;
    const vla = ctx.createGain(); vla.gain.value = 350;
    vl.connect(vla); vla.connect(vf.frequency); vl.start();
    noiseSrc().connect(vf); vf.connect(vortex.g);
    vortex.apply = () => {};

    // Electric buzz: detuned saws chopped by a fast square LFO.
    const buzz = bus(0.22);
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 1.2;
    const chop = ctx.createGain(); chop.gain.value = 0.6;
    const cl2 = ctx.createOscillator(); cl2.type = 'square'; cl2.frequency.value = 37;
    const cla = ctx.createGain(); cla.gain.value = 0.4;
    cl2.connect(cla); cla.connect(chop.gain); cl2.start();
    [120, 121.5, 180].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bf); o.start();
    });
    const hs = ctx.createBiquadFilter(); hs.type = 'highpass'; hs.frequency.value = 3000;
    noiseSrc().connect(hs); hs.connect(chop);
    bf.connect(chop); chop.connect(buzz.g);
    buzz.apply = (L, t) => bf.frequency.setTargetAtTime(900 + L * 1800, t, 0.05);

    // Sustained energy beam roar.
    const beam = bus(0.55);
    const bmf = ctx.createBiquadFilter(); bmf.type = 'lowpass'; bmf.frequency.value = 900;
    noiseSrc().connect(bmf);
    const bo = ctx.createOscillator(); bo.type = 'sawtooth'; bo.frequency.value = 70;
    const bog = ctx.createGain(); bog.gain.value = 0.25;
    bo.connect(bog); bog.connect(bmf); bo.start();
    bmf.connect(beam.g);
    beam.apply = (L, t) => bmf.frequency.setTargetAtTime(600 + L * 2400, t, 0.08);

    // Thruster roar: turbulent noise with a whining turbine underneath.
    const jet = bus(0.6);
    const jf = ctx.createBiquadFilter(); jf.type = 'bandpass'; jf.frequency.value = 1400; jf.Q.value = 0.6;
    noiseSrc().connect(jf); jf.connect(jet.g);
    const jo = ctx.createOscillator(); jo.type = 'sawtooth'; jo.frequency.value = 180;
    const jg = ctx.createGain(); jg.gain.value = 0.06;
    jo.connect(jg); jg.connect(jet.g); jo.start();
    jet.apply = (L, t) => {
      jf.frequency.setTargetAtTime(900 + L * 2200, t, 0.1);
      jo.frequency.setTargetAtTime(160 + L * 300, t, 0.1);
    };

    // Lightsaber hum: two detuned saws through a resonant lowpass. Swing
    // speed opens the filter and bends the pitch like a doppler sweep.
    const saber = bus(0.3);
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 380; sf.Q.value = 6;
    const s1 = ctx.createOscillator(); s1.type = 'sawtooth'; s1.frequency.value = 88;
    const s2 = ctx.createOscillator(); s2.type = 'sawtooth'; s2.frequency.value = 90.5;
    const sfl = ctx.createOscillator(); sfl.frequency.value = 6.5;
    const sfa = ctx.createGain(); sfa.gain.value = 1.5;
    sfl.connect(sfa); sfa.connect(s1.frequency); sfl.start();
    s1.connect(sf); s2.connect(sf); s1.start(); s2.start();
    sf.connect(saber.g);
    saber.apply = (L, t) => {
      const sw = Math.max(0, L - 0.4) / 0.6;
      sf.frequency.setTargetAtTime(380 + sw * 2200, t, 0.03);
      s1.frequency.setTargetAtTime(88 + sw * 60, t, 0.04);
      s2.frequency.setTargetAtTime(90.5 + sw * 64, t, 0.04);
    };

    // Chidori: thousands of birds. High noise chirped by a fast LFO.
    const chirp = bus(0.35);
    const chf = ctx.createBiquadFilter(); chf.type = 'bandpass'; chf.frequency.value = 4200; chf.Q.value = 3;
    const chl = ctx.createOscillator(); chl.type = 'sawtooth'; chl.frequency.value = 23;
    const cha = ctx.createGain(); cha.gain.value = 2600;
    chl.connect(cha); cha.connect(chf.frequency); chl.start();
    const chg = ctx.createGain(); chg.gain.value = 0.7;
    const chq = ctx.createOscillator(); chq.type = 'square'; chq.frequency.value = 47;
    const chqa = ctx.createGain(); chqa.gain.value = 0.35;
    chq.connect(chqa); chqa.connect(chg.gain); chq.start();
    noiseSrc().connect(chf); chf.connect(chg); chg.connect(chirp.g);
    chirp.apply = (L, t) => chl.frequency.setTargetAtTime(18 + L * 16, t, 0.1);

    // Spinning wind for the Rasengan.
    const spin = bus(0.45);
    const spf = ctx.createBiquadFilter(); spf.type = 'bandpass'; spf.Q.value = 2.5; spf.frequency.value = 900;
    const spl = ctx.createOscillator(); spl.frequency.value = 14;
    const spa = ctx.createGain(); spa.gain.value = 500;
    spl.connect(spa); spa.connect(spf.frequency); spl.start();
    noiseSrc().connect(spf); spf.connect(spin.g);
    spin.apply = (L, t) => { spl.frequency.setTargetAtTime(8 + L * 22, t, 0.1); spf.frequency.setTargetAtTime(600 + L * 1400, t, 0.1); };

    this.loops = { charge, roar, drone, hum, vortex, buzz, beam, jet, saber, chirp, spin };
  }

  // Engines raise loop levels every frame; unset loops fade out.
  loop(name, level) { this.targets[name] = Math.max(this.targets[name] || 0, level); }

  endFrame() {
    if (!this.ctx) { this.targets = {}; return; }
    const t = this.ctx.currentTime;
    for (const [name, L] of Object.entries(this.loops)) {
      const lv = this.enabled ? Math.min(1, this.targets[name] || 0) : 0;
      if (Math.abs(lv - L.level) > 0.004 || (lv === 0 && L.level !== 0)) {
        L.g.gain.setTargetAtTime(lv * L.base, t, 0.08);
        L.apply(lv, t);
        L.level = lv;
      }
    }
    this.targets = {};
  }
}
