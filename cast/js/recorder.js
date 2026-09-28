// Records the composited view (WebGL + overlay + watermark + sound) and
// appends a short end card that points viewers back to the app.
import { CONFIG } from './config.js';
import { rgbToCss, easeOutCubic } from './util.js';

const MIMES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export class Recorder {
  constructor({ glCanvas, overlayCanvas, sfx, onTick, onDone, onError }) {
    this.gl = glCanvas;
    this.ov = overlayCanvas;
    this.sfx = sfx;
    this.onTick = onTick;
    this.onDone = onDone;
    this.onError = onError;
    this.active = false;
    this.ending = 0;
    this.ch = null;
  }

  static supported() {
    return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
  }

  setCharacter(ch) { this.ch = ch; }

  start() {
    if (this.active) return;
    if (!Recorder.supported()) { this.onError('Recording is not supported in this browser. Try Chrome or Safari.'); return; }
    this.mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const gw = this.gl.width, gh = this.gl.height;
    const s = Math.min(1, 1920 / Math.max(gw, gh));
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round((gw * s) / 2) * 2;
    this.canvas.height = Math.round((gh * s) / 2) * 2;
    this.g = this.canvas.getContext('2d');
    const stream = this.canvas.captureStream(30);
    const audio = this.sfx.newStream();
    if (audio && audio.getAudioTracks().length) stream.addTrack(audio.getAudioTracks()[0]);
    try {
      this.mr = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 8e6 } : { videoBitsPerSecond: 8e6 });
    } catch (err) {
      this.onError('Could not start recording on this device.');
      return;
    }
    this.chunks = [];
    this.mr.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.mr.onstop = () => {
      this.sfx.endStream();
      const type = this.mr.mimeType || this.mime || 'video/webm';
      const blob = new Blob(this.chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      this.onDone({ blob, url: URL.createObjectURL(blob), ext, type });
    };
    this.mr.start(250);
    this.t = 0;
    this.ending = 0;
    this.endT = 0;
    this.active = true;
  }

  requestStop() {
    if (!this.active || this.ending > 0) return;
    this.ending = CONFIG.endCardSeconds;
    this.endT = 0;
  }

  frame(dt) {
    if (!this.active) return;
    const g = this.g, W = this.canvas.width, H = this.canvas.height;
    if (this.ending > 0) {
      this.endT += dt;
      this.drawEndCard(this.endT);
      this.ending -= dt;
      if (this.ending <= 0) { this.active = false; this.mr.stop(); }
      return;
    }
    this.t += dt;
    g.drawImage(this.gl, 0, 0, W, H);
    g.drawImage(this.ov, 0, 0, W, H);
    this.drawWatermark();
    this.onTick(this.t);
    if (this.t >= CONFIG.recordMaxSeconds) this.requestStop();
  }

  drawWatermark() { drawWatermark(this.g, this.canvas.width, this.canvas.height); }

  drawEndCard(t) { drawEndCard(this.g, this.canvas.width, this.canvas.height, t, this.ch); }
}

export function drawWatermark(g, W, H) {
  let fs = Math.max(12, Math.round(Math.min(W, H) * 0.028));
  const text = `CAST  ·  try it → ${CONFIG.TRY_URL}`;
  g.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
  let tw = g.measureText(text).width;
  // shrink to fit narrow (vertical) frames
  if (tw > W * 0.8) {
    fs = Math.max(9, Math.floor(fs * (W * 0.8) / tw));
    g.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`;
    tw = g.measureText(text).width;
  }
  const padX = fs * 0.9, bh = fs * 2;
  const x = (W - tw) / 2 - padX, y = H - bh - fs * 1.4;
  g.fillStyle = 'rgba(6,5,10,0.62)';
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, tw + padX * 2, bh, bh / 2) : g.rect(x, y, tw + padX * 2, bh);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, x + padX, y + bh / 2);
}

export function drawEndCard(g, W, H, t, ch) {
  const base = Math.min(W, H);
  const a = ch ? ch.a : [1, 0.4, 0.2], b = ch ? ch.b : [1, 0.8, 0.4];
  g.fillStyle = `rgba(6,5,10,${Math.min(0.35, t * 0.8)})`;
  g.fillRect(0, 0, W, H);
  const k = easeOutCubic(Math.min(1, t / 0.45));
  const rg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, base * 0.7);
  rg.addColorStop(0, rgbToCss(a, 0.22 * k));
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);

  g.save();
  g.translate(W / 2, H * 0.44);
  g.scale(1.25 - 0.25 * k, 1.25 - 0.25 * k);
  g.globalAlpha = k;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const big = base * 0.2;
  g.font = `700 ${big}px "Cinzel", Georgia, serif`;
  const lg = g.createLinearGradient(-big * 1.5, 0, big * 1.5, 0);
  lg.addColorStop(0, rgbToCss(a, 1));
  lg.addColorStop(1, rgbToCss(b, 1));
  g.shadowColor = rgbToCss(a, 1);
  g.shadowBlur = base * 0.04;
  g.fillStyle = lg;
  g.fillText('CAST', 0, 0);
  g.shadowBlur = 0;
  const fs = base * 0.04;
  g.font = `500 ${fs}px "Sora", system-ui, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillText('Cast powers with your bare hands', 0, big * 0.78);
  g.font = `600 ${fs * 1.05}px "JetBrains Mono", ui-monospace, monospace`;
  g.fillStyle = rgbToCss(b, 1);
  g.fillText(`try it → ${CONFIG.TRY_URL}`, 0, big * 0.78 + fs * 1.9);
  g.font = `400 ${fs * 0.8}px "JetBrains Mono", ui-monospace, monospace`;
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(`more projects → ${CONFIG.MORE_URL}`, 0, big * 0.78 + fs * 3.4);
  g.restore();
}
