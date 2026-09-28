// 2D layer drawn over the WebGL canvas: attack callouts, manga speed lines,
// cinematic letterbox bars and lock-on reticles. It is composited into
// recordings too, so what you see is what gets posted.
import { TAU, easeOutCubic, rand, rgbToCss } from './util.js';

const KANJI_FONT = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif';

export class Overlay {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.callouts = [];
    this.reticles = [];
    this.speed = 0; this.speedTarget = 0;
    this.focus = { x: 0, y: 0 };
    this.bars = 0; this.barsTarget = 0;
    this.pr = 1; this.w = 1; this.h = 1;
    this.ch = null;
    this.hasLetterSpacing = 'letterSpacing' in this.g;
  }

  resize(pr) {
    this.pr = pr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.c.width = Math.round(this.w * pr);
    this.c.height = Math.round(this.h * pr);
  }

  setCharacter(ch) { this.ch = ch; }

  callout(kanji, name, { big = false, dur = 1.35 } = {}) {
    this.callouts = [{ kanji, name, big, dur, t: 0 }];
  }

  speedLines(intensity, x, y) {
    if (intensity > this.speedTarget) {
      this.speedTarget = intensity;
      this.focus.x = x;
      this.focus.y = y;
    }
  }

  letterbox(amount) { this.barsTarget = Math.max(this.barsTarget, amount); }

  reticle(x, y, size) { this.reticles.push({ x, y, size, t: 0 }); }

  clear() {
    this.callouts.length = 0;
    this.reticles.length = 0;
    this.speed = this.speedTarget = 0;
    this.bars = this.barsTarget = 0;
  }

  draw(dt) {
    const g = this.g, W = this.w, H = this.h;
    g.setTransform(this.pr, 0, 0, this.pr, 0, 0);
    g.clearRect(0, 0, W, H);

    this.speed += (this.speedTarget - this.speed) * (1 - Math.exp(-dt * 12));
    this.speedTarget = 0;
    if (this.speed > 0.02) this.drawSpeedLines();

    this.bars += (this.barsTarget - this.bars) * (1 - Math.exp(-dt * 6));
    this.barsTarget = 0;
    if (this.bars > 0.004) {
      const bh = this.bars * H * 0.1;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, bh);
      g.fillRect(0, H - bh, W, bh);
    }

    for (let i = this.reticles.length - 1; i >= 0; i--) {
      const r = this.reticles[i];
      r.t += dt;
      if (r.t > 0.55) { this.reticles.splice(i, 1); continue; }
      this.drawReticle(r);
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.t += dt;
      if (c.t > c.dur) this.callouts.splice(i, 1);
    }
    this.callouts.forEach((c) => this.drawCallout(c));
  }

  drawSpeedLines() {
    const g = this.g, W = this.w, H = this.h;
    const diag = Math.hypot(W, H);
    const { x, y } = this.focus;
    g.fillStyle = `rgba(255,255,255,${Math.min(0.6, this.speed * 0.55)})`;
    g.beginPath();
    const N = 84;
    for (let i = 0; i < N; i++) {
      if (Math.random() < 0.25) continue;
      const a = (i / N) * TAU + rand(-0.03, 0.03);
      const r0 = diag * rand(0.22, 0.5) * (1.25 - this.speed * 0.4);
      const w = rand(1.5, 9);
      const ca = Math.cos(a), sa = Math.sin(a);
      g.moveTo(x + ca * r0, y + sa * r0);
      g.lineTo(x + ca * diag - sa * w, y + sa * diag + ca * w);
      g.lineTo(x + ca * diag + sa * w, y + sa * diag - ca * w);
      g.closePath();
    }
    g.fill();
  }

  drawReticle(r) {
    const g = this.g;
    const k = Math.min(1, r.t / 0.28);
    const s = r.size * (2.1 - 1.1 * easeOutCubic(k));
    const alpha = r.t < 0.35 ? 1 : 1 - (r.t - 0.35) / 0.2;
    const col = this.ch ? this.ch.css[1] : '#fff';
    g.save();
    g.translate(r.x, r.y);
    g.rotate((1 - easeOutCubic(k)) * Math.PI * 0.5);
    g.globalAlpha = Math.max(0, alpha);
    g.strokeStyle = col;
    g.lineWidth = 2.5;
    const h = s / 2, l = s * 0.22;
    g.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.moveTo(sx * h, sy * (h - l));
      g.lineTo(sx * h, sy * h);
      g.lineTo(sx * (h - l), sy * h);
    }
    g.stroke();
    g.restore();
  }

  drawCallout(c) {
    const g = this.g, W = this.w, H = this.h;
    const ch = this.ch;
    const base = Math.min(W, H) * (c.big ? 1.25 : 1);
    const inT = 0.14, outT = 0.3;
    let s = 1, a = 1, dy = 0, jx = 0, jy = 0;
    if (c.t < inT) {
      const k = c.t / inT;
      s = 1 + 1.3 * (1 - easeOutCubic(k));
      a = k;
    } else if (c.t > c.dur - outT) {
      const k = (c.t - (c.dur - outT)) / outT;
      s = 1 + k * 0.12;
      a = 1 - k;
      dy = -k * 24;
    } else if (c.t < inT + 0.12) {
      jx = rand(-4, 4); jy = rand(-4, 4);
    }
    const cA = ch ? ch.a : [1, 1, 1], cB = ch ? ch.b : [1, 1, 1];

    g.save();
    g.translate(W / 2 + jx, H * 0.2 + dy + jy);
    g.rotate(-0.07);
    g.scale(s, s);
    g.globalAlpha = Math.max(0, a);

    const bw = base * 0.7, bh = base * 0.14, sk = bh * 0.45;
    const grad = g.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    grad.addColorStop(0, rgbToCss(cA, 0));
    grad.addColorStop(0.2, rgbToCss(cA, 0.9));
    grad.addColorStop(0.8, rgbToCss(cA, 0.9));
    grad.addColorStop(1, rgbToCss(cA, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-bw / 2 + sk, -bh / 2);
    g.lineTo(bw / 2 + sk, -bh / 2);
    g.lineTo(bw / 2 - sk, bh / 2);
    g.lineTo(-bw / 2 - sk, bh / 2);
    g.closePath();
    g.fill();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const kSize = base * 0.16;
    g.font = `900 ${kSize}px ${KANJI_FONT}`;
    g.lineJoin = 'round';
    g.lineWidth = kSize * 0.09;
    g.strokeStyle = 'rgba(6,4,10,0.92)';
    g.strokeText(c.kanji, 0, -base * 0.005);
    const kg = g.createLinearGradient(0, -kSize / 2, 0, kSize / 2);
    kg.addColorStop(0, '#ffffff');
    kg.addColorStop(0.55, rgbToCss(cB, 1));
    kg.addColorStop(1, rgbToCss(cA, 1));
    g.shadowColor = rgbToCss(cA, 1);
    g.shadowBlur = base * 0.05;
    g.fillStyle = kg;
    g.fillText(c.kanji, 0, -base * 0.005);

    g.shadowBlur = 0;
    const nSize = base * 0.043;
    g.font = `700 ${nSize}px "Cinzel", Georgia, serif`;
    if (this.hasLetterSpacing) g.letterSpacing = `${nSize * 0.22}px`;
    const label = c.name.toUpperCase();
    const ny = bh / 2 + nSize * 1.05;
    g.lineWidth = nSize * 0.2;
    g.strokeStyle = 'rgba(6,4,10,0.85)';
    g.strokeText(label, 0, ny);
    g.fillStyle = '#fff';
    g.fillText(label, 0, ny);
    if (this.hasLetterSpacing) g.letterSpacing = '0px';
    g.restore();
  }
}
