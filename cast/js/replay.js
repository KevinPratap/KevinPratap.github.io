// Instant replay. The app is always keeping the last few seconds as small
// vertical (9:16) JPEG frames plus the matching audio. One tap turns that
// into a Reels-ready clip: the lead-up at full speed, the biggest hit again
// in slow motion with the sound pitched down, then the end card.
import { CONFIG } from './config.js';
import { drawWatermark, drawEndCard } from './recorder.js';
import { rgbToCss, easeOutCubic } from './util.js';

const KEEP = 7;          // seconds kept in the buffer
const CLIP = 6;          // seconds of lead-up in the exported clip
const SLOW = 0.35;       // slow-motion rate
const SLOW_BEFORE = 0.35, SLOW_AFTER = 0.95;
const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
const KANJI_FONT = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif';

export class Replay {
  constructor({ glCanvas, overlayCanvas, sfx }) {
    this.gl = glCanvas;
    this.ov = overlayCanvas;
    this.sfx = sfx;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.W = small ? 432 : 540;
    this.H = small ? 768 : 960;
    this.fps = small ? 24 : 30;
    this.cap = document.createElement('canvas');
    this.cap.width = this.W; this.cap.height = this.H;
    this.cg = this.cap.getContext('2d');
    this.frames = [];
    this.pending = 0;
    this.encAvg = 10;   // ms per JPEG encode, to adapt quality to the device
    this.degraded = false;
    this.acc = 0;
    this.focusX = null;
    this.highlights = [];
    this.building = false;
    this.ch = null;
  }

  setCharacter(ch) { this.ch = ch; }

  now() { return this.sfx.ctx ? this.sfx.ctx.currentTime : performance.now() / 1000; }

  // A big moment worth the slow-mo treatment.
  mark(weight = 1) {
    this.highlights.push({ t: this.now(), w: weight });
    if (this.highlights.length > 20) this.highlights.shift();
  }

  get hasHighlight() {
    const t = this.now();
    return this.highlights.some((h) => t - h.t < 5 && h.w >= 1);
  }

  // Called every render frame. focusX keeps the 9:16 crop on the action.
  capture(dt, focusX) {
    if (this.building) return;
    this.acc += dt;
    if (this.acc < 1 / this.fps) return;
    this.acc = 0;
    if (this.pending > 3) return;  // encoder is behind: skip rather than stall
    const sw = this.gl.width, sh = this.gl.height;
    let cw = sh * 9 / 16, chh = sh;
    if (cw > sw) { cw = sw; chh = sw * 16 / 9; }
    const target = focusX != null ? focusX * (sw / window.innerWidth) : sw / 2;
    this.focusX = this.focusX == null ? target : this.focusX + (target - this.focusX) * 0.08;
    const x0 = Math.max(0, Math.min(sw - cw, this.focusX - cw / 2));
    const y0 = (sh - chh) / 2;
    const g = this.cg;
    g.drawImage(this.gl, x0, y0, cw, chh, 0, 0, this.W, this.H);
    const ox = x0 * (this.ov.width / sw), oy = y0 * (this.ov.height / sh);
    g.drawImage(this.ov, ox, oy, cw * (this.ov.width / sw), chh * (this.ov.height / sh), 0, 0, this.W, this.H);
    const t = this.now();
    const t0 = performance.now();
    this.pending++;
    this.cap.toBlob((blob) => {
      this.pending--;
      this.encAvg += (performance.now() - t0 - this.encAvg) * 0.1;
      // a slow device gets smaller, sparser frames instead of a stutter
      if (!this.degraded && this.encAvg > 70 && this.frames.length > 10) {
        this.degraded = true;
        this.fps = 15;
        this.W = 360; this.H = 640;
        this.cap.width = this.W; this.cap.height = this.H;
      }
      if (!blob) return;
      this.frames.push({ t, blob });
      const cut = this.now() - KEEP;
      while (this.frames.length && this.frames[0].t < cut) this.frames.shift();
    }, 'image/jpeg', 0.82);
  }

  // Builds the clip in real time on an offscreen canvas. Resolves to the
  // same { blob, url, ext, type } shape the recorder produces.
  async build(onProgress) {
    if (this.building || this.frames.length < 8) return null;
    this.building = true;
    try {
      return await this.render(onProgress);
    } finally {
      this.building = false;
    }
  }

  async render(onProgress) {
    const ctx = this.sfx.ctx;
    const frames = this.frames.slice();
    const tEnd = frames[frames.length - 1].t;
    const tStart = Math.max(frames[0].t, tEnd - CLIP);
    const clip = frames.filter((f) => f.t >= tStart);
    // the strongest recent hit inside the clip gets the slow-mo
    const hs = this.highlights.filter((h) => h.t >= tStart + 0.2 && h.t <= tEnd - 0.1);
    const hit = hs.length ? hs.reduce((a, b) => (b.w >= a.w ? b : a)) : null;
    const slowFrames = hit ? clip.filter((f) => f.t >= hit.t - SLOW_BEFORE && f.t <= hit.t + SLOW_AFTER) : [];

    const lead = tEnd - tStart;
    const slowLen = slowFrames.length ? (slowFrames[slowFrames.length - 1].t - slowFrames[0].t) / SLOW : 0;
    const endLen = CONFIG.endCardSeconds;
    const total = lead + slowLen + (slowLen ? 0.25 : 0) + endLen;

    const out = document.createElement('canvas');
    // export at the capture size of the newest frames
    out.width = this.W; out.height = this.H;
    const g = out.getContext('2d');
    const stream = out.captureStream(30);
    let dest = null;
    if (ctx) {
      dest = ctx.createMediaStreamDestination();
      const track = dest.stream.getAudioTracks()[0];
      if (track) stream.addTrack(track);
    }
    const mime = MIMES.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 7e6 } : { videoBitsPerSecond: 7e6 });
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { mr.onstop = res; });

    // decode a sliding window of frames ahead of the playhead
    const cache = new Map();
    const get = (list, i) => {
      i = Math.max(0, Math.min(list.length - 1, i));
      const f = list[i];
      if (!cache.has(f)) cache.set(f, createImageBitmap(f.blob).catch(() => null));
      return cache.get(f);
    };
    const prefetch = (list, i) => { for (let k = 0; k < 8; k++) if (i + k < list.length) get(list, i + k); };
    prefetch(clip, 0);
    await get(clip, 0);

    // audio: the lead-up as recorded, then the hit again, slowed and deeper
    const t0 = ctx ? ctx.currentTime + 0.12 : 0;
    if (ctx && dest) {
      const a = this.sfx.ringSlice(tStart, tEnd);
      if (a) {
        const s1 = ctx.createBufferSource();
        s1.buffer = a; s1.connect(dest); s1.start(t0);
        if (slowFrames.length) {
          const s2 = ctx.createBufferSource();
          s2.buffer = a;
          s2.playbackRate.value = SLOW;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
          s2.connect(lp); lp.connect(dest);
          const off = Math.max(0, slowFrames[0].t - tStart);
          s2.start(t0 + lead, off, slowLen * SLOW);
        }
      }
    }
    mr.start(250);
    const wall0 = performance.now() / 1000 + (ctx ? t0 - ctx.currentTime : 0);

    let last = null;
    await new Promise((resolve) => {
      const step = async () => {
        const e = performance.now() / 1000 - wall0;
        if (e < 0) { requestAnimationFrame(step); return; }
        if (onProgress) onProgress(Math.min(1, e / total));
        if (e < lead) {
          const i = clip.findIndex((f) => f.t - tStart > e);
          const idx = i < 0 ? clip.length - 1 : Math.max(0, i - 1);
          prefetch(clip, idx);
          const bmp = await get(clip, idx);
          if (bmp) { g.drawImage(bmp, 0, 0, this.W, this.H); last = bmp; }
          drawWatermark(g, this.W, this.H);
        } else if (e < lead + slowLen) {
          const s = e - lead;
          const ft = slowFrames[0].t + s * SLOW;
          const i = slowFrames.findIndex((f) => f.t > ft);
          const idx = i < 0 ? slowFrames.length - 1 : Math.max(0, i - 1);
          prefetch(slowFrames, idx);
          const bmp = await get(slowFrames, idx);
          if (bmp) last = bmp;
          this.drawSlow(g, last, s / slowLen, e);
        } else if (e < lead + slowLen + (slowLen ? 0.25 : 0)) {
          if (last) g.drawImage(last, 0, 0, this.W, this.H);
          drawWatermark(g, this.W, this.H);
        } else {
          const te = e - (total - endLen);
          if (last && te < 0.05) g.drawImage(last, 0, 0, this.W, this.H);
          drawEndCard(g, this.W, this.H, te, this.ch);
        }
        if (e >= total) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    mr.stop();
    await done;
    for (const p of cache.values()) p.then((b) => b && b.close && b.close());
    const type = mr.mimeType || mime || 'video/webm';
    const blob = new Blob(chunks, { type });
    return { blob, url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm', type };
  }

  // Slow-motion section: a slow push-in, letterbox bars and a REPLAY tag.
  drawSlow(g, bmp, k, t) {
    const W = this.W, H = this.H;
    if (bmp) {
      const z = 1.04 + 0.1 * easeOutCubic(k);
      const w = W * z, h = H * z;
      g.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
    }
    const bars = H * 0.085 * Math.min(1, k * 8);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, bars);
    g.fillRect(0, H - bars, W, bars);
    const ch = this.ch;
    const a = ch ? ch.a : [1, 1, 1];
    const blink = Math.floor(t * 2) % 2 === 0;
    g.save();
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const fs = W * 0.05;
    g.font = `700 ${fs}px "Cinzel", Georgia, serif`;
    g.fillStyle = '#fff';
    g.fillText('REPLAY', W * 0.06, bars / 2);
    if (blink) {
      g.fillStyle = rgbToCss(a, 1);
      g.beginPath(); g.arc(W * 0.045, bars / 2, fs * 0.2, 0, Math.PI * 2); g.fill();
    }
    g.textAlign = 'right';
    g.font = `900 ${fs * 1.1}px ${KANJI_FONT}`;
    g.fillStyle = rgbToCss(a, 1);
    g.fillText('再生', W * 0.94, bars / 2);
    g.font = `600 ${fs * 0.55}px "JetBrains Mono", ui-monospace, monospace`;
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.textAlign = 'center';
    g.fillText(`${SLOW}x  ·  ${CONFIG.TRY_URL}`, W / 2, H - bars / 2);
    g.restore();
  }
}
