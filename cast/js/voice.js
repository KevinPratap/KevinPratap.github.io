// Shout to power up. Reads the mic's loudness against an adaptive noise
// floor, so a quiet room and a noisy one both need a real yell. The mic is
// also routed into recordings and replays (never to the speakers).

export class Voice {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = false;
    this.level = 0;     // smoothed 0..1 shout strength
    this.peak = 0;      // highest level in the last ~1.5s
    this.floor = -60;   // adaptive ambient level in dB
    this.db = -90;
    this.hist = [];
    this.sim = null;    // demo/test override: a function of time returning 0..1
  }

  async enable() {
    this.sfx.init();
    const ctx = this.sfx.ctx;
    if (!ctx || !navigator.mediaDevices) throw new Error('no audio');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    this.src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.src.connect(this.analyser);
    // Mic bus for recordings: boosted a little so a yell sits over the SFX.
    this.bus = ctx.createGain();
    this.bus.gain.value = 1.4;
    this.src.connect(this.bus);
    this.sfx.attachMic(this.bus);
    this.on = true;
  }

  disable() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.src) this.src.disconnect();
    this.sfx.attachMic(null);
    this.stream = this.src = this.analyser = null;
    this.on = false;
    this.level = 0;
    this.peak = 0;
  }

  update(dt, time) {
    let target = 0;
    if (this.sim) {
      target = this.sim(time);
    } else if (this.on && this.analyser) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(s / this.buf.length);
      this.db = 20 * Math.log10(rms + 1e-7);
      // floor drops quickly to quiet moments and creeps up slowly, so a
      // sustained yell doesn't get absorbed into it
      if (this.db < this.floor) this.floor += (this.db - this.floor) * Math.min(1, dt * 2);
      else this.floor += (this.db - this.floor) * Math.min(1, dt * 0.04);
      this.floor = Math.max(-75, Math.min(-25, this.floor));
      target = Math.max(0, Math.min(1, (this.db - this.floor - 14) / 22));
    }
    const k = 1 - Math.exp(-dt * (target > this.level ? 16 : 3.5));
    this.level += (target - this.level) * k;
    if (this.level < 0.01) this.level = 0;
    this.hist.push([time, this.level]);
    while (this.hist.length && time - this.hist[0][0] > 1.5) this.hist.shift();
    this.peak = this.hist.reduce((m, h) => Math.max(m, h[1]), 0);
  }

  // Charge-rate multiplier while shouting.
  get boost() { return 1 + this.level * 2; }
  // Power multiplier for a release, from the loudest moment just before it.
  get power() { return 1 + this.peak * 0.7; }
}
