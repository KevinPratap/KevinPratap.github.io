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
    this.comboN = 0; this.comboT = 9;
    this.cracks = [];
    this.voiceOn = false; this.voice = 0; this.voiceShow = 0;
    this.speed = 0; this.speedTarget = 0;
    this.focus = { x: 0, y: 0 };
    this.bars = 0; this.barsTarget = 0;
    this.pr = 1; this.w = 1; this.h = 1;
    this.ch = null;
    this.signData = null; this.signShow = 0; this.signPop = []; this.signN = 0;
    this.hudData = null; this.hudShow = 0; this.hudT = 0;
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

  setVoice(on, level) { this.voiceOn = on; this.voice = level; }

  combo(n) { this.comboN = n; this.comboT = 0; }

  // Glass fracture radiating from an impact point: jagged spokes with
  // forks, joined by concentric web strands. Holds, then fades.
  crack(x, y, power = 1) {
    const W = this.w, H = this.h, diag = Math.hypot(W, H);
    const segs = [];
    const spokes = 9 + Math.floor(power * 5);
    const ends = [];
    for (let i = 0; i < spokes; i++) {
      let a = (i / spokes) * TAU + rand(-0.15, 0.15);
      let px = x, py = y;
      const len = diag * rand(0.18, 0.42) * Math.min(1.4, power);
      const path = [[px, py]];
      let d = 0;
      while (d < len) {
        const step = rand(14, 38);
        a += rand(-0.28, 0.28);
        px += Math.cos(a) * step; py += Math.sin(a) * step;
        d += step;
        path.push([px, py]);
        if (Math.random() < 0.12) {
          // fork
          let fa = a + (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 0.9), fx = px, fy = py;
          const fork = [[fx, fy]];
          for (let k = 0, fl = rand(3, 7); k < fl; k++) {
            fa += rand(-0.3, 0.3);
            fx += Math.cos(fa) * rand(10, 26); fy += Math.sin(fa) * rand(10, 26);
            fork.push([fx, fy]);
          }
          segs.push({ path: fork, w: 1.1 });
        }
      }
      segs.push({ path, w: 2.2 });
      ends.push(path);
    }
    // web strands between neighbouring spokes
    for (const ring of [0.25, 0.5, 0.75]) {
      for (let i = 0; i < ends.length; i++) {
        if (Math.random() < 0.3) continue;
        const A = ends[i], B = ends[(i + 1) % ends.length];
        const pa = A[Math.floor(A.length * ring)], pb = B[Math.floor(B.length * ring)];
        if (!pa || !pb) continue;
        const mx = (pa[0] + pb[0]) / 2 + rand(-8, 8), my = (pa[1] + pb[1]) / 2 + rand(-8, 8);
        segs.push({ path: [pa, [mx, my], pb], w: 1 });
      }
    }
    this.cracks.push({ segs, t: 0, x, y, dur: 1.6 + power * 0.4 });
    if (this.cracks.length > 3) this.cracks.shift();
  }

  // Hand-sign strip along the bottom: filled seals, a ring filling for the
  // sign being held, and a dim ghost of the sign currently detected.
  // Engines call this every frame they want it shown.
  setSigns(d) { this.signData = d; }

  // Suit HUD: targeting rings, ladders, compass and readouts.
  setHud(d) { this.hudData = d; }

  reticle(x, y, size) { this.reticles.push({ x, y, size, t: 0 }); }

  clear() {
    this.callouts.length = 0;
    this.reticles.length = 0;
    this.comboT = 9;
    this.cracks.length = 0;
    this.signData = null; this.hudData = null; this.signN = 0;
    this.speed = this.speedTarget = 0;
    this.bars = this.barsTarget = 0;
  }

  draw(dt) {
    const g = this.g, W = this.w, H = this.h;
    g.setTransform(this.pr, 0, 0, this.pr, 0, 0);
    g.clearRect(0, 0, W, H);

    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const c = this.cracks[i];
      c.t += dt;
      if (c.t > c.dur) { this.cracks.splice(i, 1); continue; }
      this.drawCrack(c);
    }

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
    this.hudShow += ((this.hudData ? this.hudData.k : 0) - this.hudShow) * (1 - Math.exp(-dt * 6));
    if (this.hudShow > 0.01) { this.hudT += dt; if (this.hudData) this.drawHud(this.hudData, this.hudShow); }
    this.hudData = null;
    this.signShow += ((this.signData ? 1 : 0) - this.signShow) * (1 - Math.exp(-dt * 8));
    if (this.signData) this.drawSigns(this.signData, dt);
    this.signData = null;
    this.voiceShow += ((this.voiceOn ? 1 : 0) - this.voiceShow) * (1 - Math.exp(-dt * 6));
    if (this.voiceShow > 0.02) this.drawVoice();
    this.comboT += dt;
    if (this.comboN >= 2 && this.comboT < 2.4) this.drawCombo();
  }

  drawSigns(d, dt) {
    const g = this.g, W = this.w, H = this.h, base = Math.min(W, H);
    const ch = this.ch, cA = ch ? ch.a : [1, 1, 1], cB = ch ? ch.b : [1, 1, 1];
    const n = d.slots, r = base * 0.046, gap = r * 2.5;
    const x0 = W / 2 - ((n - 1) * gap) / 2, y = H * (d.y || 0.8);
    if (d.seq.length > this.signN) this.signPop[d.seq.length - 1] = 0;
    this.signN = d.seq.length;
    g.save();
    g.globalAlpha = Math.min(1, this.signShow);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      const filled = i < d.seq.length;
      let pop = 1;
      if (filled && this.signPop[i] !== undefined && this.signPop[i] < 0.35) {
        this.signPop[i] += dt;
        pop = 1 + 0.55 * Math.max(0, 1 - this.signPop[i] / 0.35);
      }
      g.save();
      g.translate(x, y);
      g.scale(pop, pop);
      g.lineWidth = 2.4;
      g.strokeStyle = filled ? rgbToCss(cB, 1) : 'rgba(255,255,255,0.28)';
      if (!filled) g.setLineDash([5, 6]);
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.setLineDash([]);
      if (filled) {
        g.fillStyle = rgbToCss(cA, 0.35);
        g.shadowColor = rgbToCss(cA, 1); g.shadowBlur = r * 0.9;
        g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
        g.shadowBlur = 0;
        g.font = `900 ${r * 1.15}px ${KANJI_FONT}`;
        g.fillStyle = '#fff';
        g.fillText(d.seq[i], 0, r * 0.06);
      } else if (i === d.seq.length && d.pending) {
        // the sign being held: ghost glyph plus a filling ring
        g.font = `900 ${r * 1.15}px ${KANJI_FONT}`;
        g.fillStyle = rgbToCss(cB, 0.45);
        g.fillText(d.pending.k, 0, r * 0.06);
        g.strokeStyle = rgbToCss(cB, 1);
        g.lineWidth = 4;
        g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * d.pending.p); g.stroke();
      }
      g.restore();
    }
    if (d.label) {
      g.font = `600 ${base * 0.024}px "JetBrains Mono", ui-monospace, monospace`;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(d.label, W / 2, y + r * 1.9);
    }
    g.restore();
  }

  drawHud(d, k) {
    const g = this.g, W = this.w, H = this.h, base = Math.min(W, H), t = this.hudT;
    const col = d.gold ? [1, 0.78, 0.25] : (this.ch ? this.ch.a : [0.3, 0.9, 1]);
    const hi = d.gold ? [1, 0.95, 0.7] : (this.ch ? this.ch.b : [1, 1, 1]);
    const c1 = (a) => rgbToCss(col, a * k), c2 = (a) => rgbToCss(hi, a * k);
    const mono = (s) => `600 ${s}px "JetBrains Mono", ui-monospace, monospace`;
    g.save();
    g.lineWidth = 2;
    g.lineCap = 'butt';
    // corner brackets
    const mx = W * 0.035, my = H * 0.05, bl = base * 0.07;
    g.strokeStyle = c1(0.9);
    g.beginPath();
    for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = sx ? W - mx : mx, y = sy ? H - my : my, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
      g.moveTo(x + dx * bl, y); g.lineTo(x, y); g.lineTo(x, y + dy * bl);
    }
    g.stroke();
    // compass ruler along the top
    const cw = W * 0.42, cx = W / 2, cy = my + base * 0.03;
    g.strokeStyle = c1(0.7);
    g.beginPath();
    for (let i = -20; i <= 20; i++) {
      const x = cx + i * (cw / 40) - ((t * 14) % (cw / 40));
      if (Math.abs(x - cx) > cw / 2) continue;
      const long = ((i + 40) % 5 === 0);
      g.moveTo(x, cy); g.lineTo(x, cy + (long ? base * 0.022 : base * 0.011));
    }
    g.stroke();
    g.fillStyle = c2(1);
    g.beginPath(); g.moveTo(cx, cy + base * 0.03); g.lineTo(cx - 6, cy + base * 0.044); g.lineTo(cx + 6, cy + base * 0.044); g.closePath(); g.fill();
    // left altitude ladder
    g.strokeStyle = c1(0.55);
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const y = H * 0.3 + i * (H * 0.4 / 24) + ((t * 18) % (H * 0.4 / 24));
      if (y > H * 0.7) continue;
      g.moveTo(mx + 6, y); g.lineTo(mx + (i % 4 === 0 ? 30 : 16), y);
    }
    g.stroke();
    g.font = mono(base * 0.02); g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = c1(0.9);
    g.fillText('ALT', mx + 6, H * 0.3 - 18);
    g.fillText(String(Math.round(d.alt || 0)).padStart(4, '0'), mx + 6, H * 0.7 + 18);
    // right power gauge
    const gx = W - mx - 22, gy0 = H * 0.3, gh = H * 0.4;
    g.strokeStyle = c1(0.8);
    g.strokeRect(gx, gy0, 14, gh);
    g.fillStyle = c1(0.85);
    const pw = Math.max(0, Math.min(1, d.power ?? 0.5));
    g.fillRect(gx + 2, gy0 + gh * (1 - pw) + 2, 10, gh * pw - 4);
    g.textAlign = 'right';
    g.fillText('PWR', gx + 14, gy0 - 18);
    g.fillText(`${Math.round(pw * 100)}%`, gx + 14, gy0 + gh + 18);
    // sweep line
    const sy = ((t * 0.45) % 1) * H;
    const sg = g.createLinearGradient(0, sy - 40, 0, sy);
    sg.addColorStop(0, c1(0)); sg.addColorStop(1, c1(0.16));
    g.fillStyle = sg; g.fillRect(0, sy - 40, W, 40);
    // targets
    (d.targets || []).forEach((tg, i) => {
      const r = tg.r, lk = tg.lock ?? 0;
      g.save();
      g.translate(tg.x, tg.y);
      g.rotate(t * (i % 2 ? -1.2 : 1.2));
      g.strokeStyle = c1(0.9);
      g.setLineDash([r * 0.32, r * 0.18]);
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.setLineDash([]);
      g.rotate(-t * (i % 2 ? -2.4 : 2.4));
      g.strokeStyle = c2(0.9);
      g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU * (0.25 + 0.75 * lk)); g.stroke();
      g.restore();
      g.strokeStyle = c2(1);
      const b = r * 1.25, bl2 = r * 0.35;
      g.beginPath();
      for (const [sx, sy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(tg.x + sx * b, tg.y + sy2 * (b - bl2)); g.lineTo(tg.x + sx * b, tg.y + sy2 * b); g.lineTo(tg.x + sx * (b - bl2), tg.y + sy2 * b);
      }
      g.stroke();
      g.font = mono(base * 0.019); g.textAlign = 'left';
      g.fillStyle = c2(1);
      g.fillText(tg.label || 'TARGET', tg.x + b + 8, tg.y - r * 0.4);
      g.fillStyle = c1(0.9);
      g.fillText(`LOCK ${Math.round(lk * 100)}%`, tg.x + b + 8, tg.y - r * 0.4 + base * 0.026);
    });
    // readout block, bottom left
    g.font = mono(base * 0.02); g.textAlign = 'left';
    const lines = d.lines || [];
    lines.forEach((ln, i) => {
      g.fillStyle = i === 0 ? c2(1) : c1(0.85);
      g.fillText(ln, mx + 6, H - my - 12 - (lines.length - 1 - i) * base * 0.03);
    });
    g.restore();
  }

  // Vertical shout meter on the left edge: fills and flares as you yell.
  drawVoice() {
    const g = this.g, H = this.h, base = Math.min(this.w, H);
    const ch = this.ch;
    const cA = ch ? ch.a : [1, 1, 1], cB = ch ? ch.b : [1, 1, 1];
    const v = this.voice;
    const x = 18, h = H * 0.32, y = H * 0.5 - h / 2, w = 8;
    g.save();
    g.globalAlpha = this.voiceShow * (0.55 + v * 0.45);
    g.fillStyle = 'rgba(8,6,12,0.7)';
    g.beginPath();
    g.roundRect ? g.roundRect(x - 3, y - 3, w + 6, h + 6, 7) : g.rect(x - 3, y - 3, w + 6, h + 6);
    g.fill();
    const fillH = h * v;
    const gr = g.createLinearGradient(0, y + h, 0, y);
    gr.addColorStop(0, rgbToCss(cA, 1));
    gr.addColorStop(1, rgbToCss(cB, 1));
    g.fillStyle = gr;
    g.shadowColor = rgbToCss(cA, 1);
    g.shadowBlur = 8 + v * 22;
    g.fillRect(x, y + h - fillH, w, fillH);
    g.shadowBlur = 0;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${Math.round(base * 0.034)}px ${KANJI_FONT}`;
    g.fillStyle = v > 0.5 ? '#fff' : rgbToCss(cB, 0.85);
    const jx = v > 0.6 ? rand(-2, 2) : 0;
    g.fillText('叫', x + w / 2 + jx, y - base * 0.035);
    if (v > 0.6) {
      g.font = `700 ${Math.round(base * 0.022)}px "Cinzel", Georgia, serif`;
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      g.fillText('POWER UP', x + w + 10, y + h - fillH);
    }
    g.restore();
  }

  drawCombo() {
    const g = this.g, W = this.w, H = this.h, t = this.comboT;
    const base = Math.min(W, H);
    const ch = this.ch;
    const cA = ch ? ch.a : [1, 1, 1], cB = ch ? ch.b : [1, 1, 1];
    const pop = t < 0.12 ? 1 + (1 - t / 0.12) * 0.9 : 1;
    const a = t > 1.9 ? 1 - (t - 1.9) / 0.5 : 1;
    const jx = t < 0.2 ? rand(-5, 5) : 0;
    g.save();
    g.translate(W - base * 0.06 + jx, H * 0.52);
    g.rotate(-0.08);
    g.scale(pop, pop);
    g.globalAlpha = Math.max(0, a);
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    const big = base * (0.13 + Math.min(this.comboN, 8) * 0.008);
    g.font = `italic 900 ${big}px "Sora", system-ui, sans-serif`;
    g.lineJoin = 'round';
    g.lineWidth = big * 0.1;
    g.strokeStyle = 'rgba(6,4,10,0.9)';
    const txt = `${this.comboN}`;
    g.strokeText(txt, 0, 0);
    const gr = g.createLinearGradient(0, -big, 0, 0);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, rgbToCss(cB, 1));
    gr.addColorStop(1, rgbToCss(cA, 1));
    g.fillStyle = gr;
    g.shadowColor = rgbToCss(cA, 1);
    g.shadowBlur = base * 0.03;
    g.fillText(txt, 0, 0);
    g.shadowBlur = 0;
    const sm = base * 0.034;
    g.font = `900 ${sm}px ${KANJI_FONT}`;
    g.lineWidth = sm * 0.2;
    g.strokeText('連撃', 0, sm * 1.3);
    g.fillStyle = rgbToCss(cB, 1);
    g.fillText('連撃', 0, sm * 1.3);
    g.font = `700 ${sm * 0.8}px "Cinzel", Georgia, serif`;
    g.strokeText('COMBO', 0, sm * 2.4);
    g.fillStyle = '#fff';
    g.fillText('COMBO', 0, sm * 2.4);
    g.restore();
  }

  drawCrack(c) {
    const g = this.g;
    // snaps outward in the first 60ms, holds, fades over the last 40%
    const grow = Math.min(1, c.t / 0.06);
    const a = c.t < c.dur * 0.6 ? 1 : 1 - (c.t - c.dur * 0.6) / (c.dur * 0.4);
    g.save();
    g.lineJoin = 'miter';
    g.lineCap = 'round';
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? `rgba(255,255,255,${0.85 * a})` : `rgba(0,0,0,${0.55 * a})`;
      for (const sgm of c.segs) {
        const n = Math.max(2, Math.ceil(sgm.path.length * grow));
        g.lineWidth = sgm.w * (pass ? 1 : 2.6);
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const [px, py] = sgm.path[i];
          const ox = pass ? 0 : 1.2, oy = pass ? 0 : 1.2;
          i ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy);
        }
        g.stroke();
      }
    }
    // bright chip at the point of impact
    const r = 26 * a;
    const rg = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 2);
    rg.addColorStop(0, `rgba(255,255,255,${0.7 * a})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(c.x - r * 2, c.y - r * 2, r * 4, r * 4);
    g.restore();
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
