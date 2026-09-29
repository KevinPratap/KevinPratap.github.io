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
    this.puffs = []; this.knives = []; this.inkData = null; this.slashes = []; this.clockData = null; this.blasts = []; this.missileData = null; this.plates = []; this.shuData = null;
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

  // Solid cartoon smoke: the one thing additive glow can't draw. Each puff
  // is a lumpy cluster of shaded balls that swells, drifts and thins out.
  smoke(x, y, n = 8, size = 1, o = {}) {
    for (let i = 0; i < n; i++) {
      if (this.puffs.length > 260) this.puffs.shift();
      const a = rand(0, TAU), sp = rand(40, 240) * (o.spread ?? 1);
      this.puffs.push({
        x: x + rand(-20, 20) * size, y: y + rand(-20, 20) * size,
        vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.sin(a) * sp * 0.7 - rand(10, 70) + (o.vy ?? 0),
        r0: rand(18, 34) * size, r1: rand(60, 120) * size, t: 0, dur: rand(0.8, 1.5) * (o.dur ?? 1),
        tint: o.tint || [236, 244, 240], lobes: Array.from({ length: o.lobes ?? 5 }, () => [rand(0, TAU), rand(0.35, 0.7), rand(0.55, 0.85)]),
        rot: rand(-1, 1),
      });
    }
  }

  // A steel kunai that flies, sticks in the glass and quivers.
  kunai(x0, y0, x1, y1, fly, o = {}) {
    if (this.knives.length > 60) this.knives.shift();
    const k = { x0, y0, x1, y1, fly, t: 0, hold: o.hold ?? 1.6, tag: !!o.tag, stuck: false, ang: Math.atan2(y1 - y0, x1 - x0), size: o.size ?? 1, onHit: o.onHit };
    this.knives.push(k);
    return k;
  }

  // Giant windmill shuriken, set every frame: {x, y, r, rot, a, vx, vy}
  setShuriken(d) { this.shuData = d; }

  // Homing missiles, set every frame: [{x, y, a}]
  setMissiles(list) { this.missileData = list; }

  // An armor plate that flies in and locks on with a flash.
  plate(x0, y0, x1, y1, fly, col) {
    this.plates.push({ x0, y0, x1, y1, fly, t: 0, col, rot0: rand(-3, 3), rot1: rand(-0.4, 0.4), w: rand(26, 54), h: rand(18, 38) });
    if (this.plates.length > 60) this.plates.shift();
  }

  // Shadow ink: engines hand over tendril polylines every frame.
  setInk(d) { this.inkData = d; }

  // A fat crescent blade of light swept across the frame.
  slash(x, y, r, a0, a1, col, o = {}) {
    this.slashes.push({ x, y, r, a0, a1, col, t: 0, dur: o.dur ?? 0.55, thick: o.thick ?? 0.22 });
  }

  // Giant clock face for time magic, set every frame while it shows.
  setClock(d) { this.clockData = d; }

  // Onomatopoeia burst (BOOM / POOF) in manga lettering.
  sfxText(text, x, y, size = 1, col = [255, 255, 255]) {
    this.blasts.push({ text, x, y, size, col, t: 0, dur: 0.75, rot: rand(-0.25, 0.25) });
    if (this.blasts.length > 8) this.blasts.shift();
  }

  reticle(x, y, size) { this.reticles.push({ x, y, size, t: 0 }); }

  clear() {
    this.callouts.length = 0;
    this.reticles.length = 0;
    this.comboT = 9;
    this.cracks.length = 0;
    this.signData = null; this.hudData = null; this.signN = 0;
    this.puffs.length = 0; this.knives.length = 0; this.slashes.length = 0; this.blasts.length = 0;
    this.inkData = null; this.clockData = null; this.missileData = null; this.plates.length = 0; this.shuData = null;
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

    if (this.inkData) this.drawInk(this.inkData);
    this.inkData = null;
    if (this.clockData) this.drawClock(this.clockData);
    this.clockData = null;
    this.drawKnives(dt);
    this.drawPlates(dt);
    if (this.shuData) this.drawShuriken(this.shuData);
    this.shuData = null;
    if (this.missileData) this.drawMissiles(this.missileData);
    this.missileData = null;
    this.drawSlashes(dt);
    this.drawPuffs(dt);
    this.drawBlasts(dt);

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

  drawPuffs(dt) {
    const g = this.g;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      if (p.t > p.dur) { this.puffs.splice(i, 1); continue; }
      const k = p.t / p.dur;
      const drag = Math.exp(-dt * 2.4);
      p.vx *= drag; p.vy = p.vy * drag - dt * 30;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const r = p.r0 + (p.r1 - p.r0) * easeOutCubic(Math.min(1, k * 1.6));
      const a = k < 0.15 ? k / 0.15 : Math.pow(1 - (k - 0.15) / 0.85, 1.4);
      const [tr, tg, tb] = p.tint;
      g.save();
      g.globalAlpha = a * 0.92;
      // lobes first, then the core, each ball lit from the top-left
      const balls = [[0, 0, 1]];
      for (const [la, ld, ls] of p.lobes) balls.push([Math.cos(la + p.rot * k) * ld, Math.sin(la + p.rot * k) * ld, ls]);
      for (const [bx, by, bs] of balls) {
        const cx = p.x + bx * r, cy = p.y + by * r, rr = r * bs;
        const gr = g.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr);
        gr.addColorStop(0, `rgb(${tr},${tg},${tb})`);
        gr.addColorStop(0.6, `rgba(${tr * 0.78 | 0},${tg * 0.8 | 0},${tb * 0.82 | 0},0.95)`);
        gr.addColorStop(1, `rgba(${tr * 0.55 | 0},${tg * 0.6 | 0},${tb * 0.62 | 0},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
      }
      g.restore();
    }
  }

  drawKnives(dt) {
    const g = this.g;
    for (let i = this.knives.length - 1; i >= 0; i--) {
      const k = this.knives[i];
      k.t += dt;
      const f = Math.min(1, k.t / k.fly);
      if (f >= 1 && !k.stuck) { k.stuck = true; k.st = k.t; if (k.onHit) k.onHit(k); }
      const since = k.stuck ? k.t - k.st : 0;
      if (since > k.hold) { this.knives.splice(i, 1); continue; }
      const x = k.x0 + (k.x1 - k.x0) * f, y = k.y0 + (k.y1 - k.y0) * f;
      const a = since > k.hold - 0.25 ? (k.hold - since) / 0.25 : 1;
      // flying kunai spin a little and grow toward the lens
      const wob = k.stuck ? Math.sin(since * 60) * Math.exp(-since * 9) * 0.12 : 0;
      const sc = k.size * (k.stuck ? 1 : 0.55 + 0.45 * f) * 1.0;
      g.save();
      g.globalAlpha = a;
      g.translate(x, y);
      g.rotate(k.ang + wob);
      g.scale(sc, sc);
      if (!k.stuck) {
        // motion smear
        const sm = g.createLinearGradient(-160, 0, -20, 0);
        sm.addColorStop(0, 'rgba(160,255,215,0)');
        sm.addColorStop(1, 'rgba(200,255,230,0.55)');
        g.fillStyle = sm;
        g.fillRect(-160, -3, 140, 6);
      }
      // stuck blades sink into the glass: the tip is hidden
      const L = 64;
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
      // ring
      g.lineWidth = 3.2; g.strokeStyle = '#2b3232';
      g.beginPath(); g.arc(-L * 0.95, 0, 7, 0, TAU); g.stroke();
      // wrapped grip
      g.fillStyle = '#1a1d1e';
      g.fillRect(-L * 0.85, -3.6, L * 0.42, 7.2);
      g.shadowBlur = 0;
      g.strokeStyle = '#3a4a44'; g.lineWidth = 1.4;
      for (let w = 0; w < 5; w++) { const wx = -L * 0.82 + w * 5.2; g.beginPath(); g.moveTo(wx, -3.6); g.lineTo(wx + 3, 3.6); g.stroke(); }
      // blade
      const bl = g.createLinearGradient(0, -9, 0, 9);
      bl.addColorStop(0, '#e9f3f0'); bl.addColorStop(0.45, '#8c9a97'); bl.addColorStop(0.55, '#4b5553'); bl.addColorStop(1, '#23292a');
      g.fillStyle = bl;
      g.beginPath();
      g.moveTo(-L * 0.43, 0); g.lineTo(-L * 0.3, -9); g.lineTo(L * (k.stuck ? 0.18 : 0.42), 0); g.lineTo(-L * 0.3, 9); g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-L * 0.3, 0); g.lineTo(L * (k.stuck ? 0.18 : 0.4), 0); g.stroke();
      if (k.tag) {
        // paper bomb tag fluttering off the grip
        const fl = Math.sin(k.t * 22) * 4;
        g.fillStyle = '#f3ead2';
        g.beginPath(); g.moveTo(-L * 0.95, -2); g.lineTo(-L * 1.55, -10 + fl); g.lineTo(-L * 1.6, 12 + fl); g.lineTo(-L * 0.95, 4); g.closePath(); g.fill();
        g.fillStyle = '#c0282d';
        g.font = '700 11px ' + KANJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.save(); g.translate(-L * 1.28, 1 + fl * 0.5); g.rotate(Math.PI / 2); g.fillText('爆', 0, 0); g.restore();
      }
      if (k.stuck && since < 0.12) {
        g.shadowBlur = 0;
        g.fillStyle = `rgba(220,255,240,${1 - since / 0.12})`;
        g.beginPath(); g.arc(L * 0.18, 0, 16 * (1 + since * 8), 0, TAU); g.fill();
      }
      g.restore();
      if (k.stuck) {
        // small star fracture where the tip went in
        const tx = x + Math.cos(k.ang) * L * 0.18 * sc, ty = y + Math.sin(k.ang) * L * 0.18 * sc;
        if (!k.star) { k.star = []; for (let s = 0; s < 6; s++) { const aa = rand(0, TAU), ll = rand(12, 34); k.star.push([aa, ll]); } }
        g.save(); g.globalAlpha = a * 0.8; g.strokeStyle = '#fff'; g.lineWidth = 1.1;
        g.beginPath();
        for (const [aa, ll] of k.star) { g.moveTo(tx, ty); g.lineTo(tx + Math.cos(aa) * ll, ty + Math.sin(aa) * ll); }
        g.stroke(); g.restore();
      }
    }
  }

  drawMissiles(list) {
    const g = this.g;
    for (const m of list) {
      g.save();
      g.translate(m.x, m.y); g.rotate(m.a); g.scale(1.9, 1.9);
      // exhaust flame
      const fl = 26 + Math.random() * 18;
      const fg = g.createLinearGradient(-fl - 14, 0, -14, 0);
      fg.addColorStop(0, 'rgba(255,120,20,0)'); fg.addColorStop(0.6, 'rgba(255,170,50,0.9)'); fg.addColorStop(1, 'rgba(255,255,230,1)');
      g.fillStyle = fg;
      g.beginPath(); g.moveTo(-14, -5); g.lineTo(-14 - fl, 0); g.lineTo(-14, 5); g.closePath(); g.fill();
      // body
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 5;
      const bg = g.createLinearGradient(0, -5, 0, 5);
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#c9d2d8'); bg.addColorStop(1, '#6d7880');
      g.fillStyle = bg;
      g.beginPath(); g.moveTo(-14, -4.5); g.lineTo(10, -4.5); g.quadraticCurveTo(20, 0, 10, 4.5); g.lineTo(-14, 4.5); g.closePath(); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#d8262e';
      g.beginPath(); g.moveTo(8, -4.5); g.quadraticCurveTo(20, 0, 8, 4.5); g.closePath(); g.fill();
      // fins
      g.fillStyle = '#5b666d';
      g.beginPath(); g.moveTo(-14, -4.5); g.lineTo(-18, -10); g.lineTo(-8, -4.5); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-14, 4.5); g.lineTo(-18, 10); g.lineTo(-8, 4.5); g.closePath(); g.fill();
      g.restore();
    }
  }

  drawShuriken(d) {
    const g = this.g;
    const blade = (x, y, r, rot, alpha, glow) => {
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y); g.rotate(rot);
      if (glow) { g.shadowColor = 'rgba(60,255,170,0.9)'; g.shadowBlur = 22; }
      for (let i = 0; i < 4; i++) {
        g.save(); g.rotate(i * Math.PI / 2);
        const gr = g.createLinearGradient(0, -r * 0.2, r, r * 0.2);
        gr.addColorStop(0, '#f2fbf7'); gr.addColorStop(0.35, '#9aa9a6'); gr.addColorStop(0.7, '#48524f'); gr.addColorStop(1, '#1b2120');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(r * 0.12, -r * 0.16);
        g.quadraticCurveTo(r * 0.55, -r * 0.3, r, -r * 0.02);
        g.quadraticCurveTo(r * 0.55, r * 0.02, r * 0.2, r * 0.2);
        g.closePath(); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(r * 0.18, -r * 0.1); g.quadraticCurveTo(r * 0.55, -r * 0.24, r * 0.97, -r * 0.03); g.stroke();
        g.restore();
      }
      g.shadowBlur = 0;
      g.fillStyle = '#2a3230';
      g.beginPath(); g.arc(0, 0, r * 0.24, 0, TAU); g.fill();
      g.strokeStyle = '#8fe8c4'; g.lineWidth = r * 0.05;
      g.beginPath(); g.arc(0, 0, r * 0.18, 0, TAU); g.stroke();
      g.fillStyle = '#050707';
      g.beginPath(); g.arc(0, 0, r * 0.1, 0, TAU); g.fill();
      g.restore();
    };
    const sp = Math.hypot(d.vx || 0, d.vy || 0);
    if (sp > 200) {
      // motion ghosts behind a flying shuriken
      for (let k = 3; k >= 1; k--) {
        const f = k * 0.018;
        blade(d.x - d.vx * f, d.y - d.vy * f, d.r, d.rot - k * 0.5, d.a * 0.18 * (4 - k) / 3, false);
      }
    }
    blade(d.x, d.y, d.r, d.rot, d.a, true);
    if (d.spin > 10) {
      // spin blur disc
      g.save(); g.globalAlpha = d.a * Math.min(0.35, d.spin / 80);
      g.strokeStyle = 'rgba(210,255,235,0.8)'; g.lineWidth = d.r * 0.08;
      g.beginPath(); g.arc(d.x, d.y, d.r * 0.92, 0, TAU); g.stroke();
      g.restore();
    }
  }

  drawPlates(dt) {
    const g = this.g;
    for (let i = this.plates.length - 1; i >= 0; i--) {
      const p = this.plates[i];
      p.t += dt;
      const f = Math.min(1, p.t / p.fly);
      const after = p.t - p.fly;
      if (after > 0.35) { this.plates.splice(i, 1); continue; }
      const e = easeOutCubic(f);
      const x = p.x0 + (p.x1 - p.x0) * e, y = p.y0 + (p.y1 - p.y0) * e;
      const rot = p.rot0 + (p.rot1 - p.rot0) * e;
      const sc = 2.2 - 1.2 * e;
      const a = after > 0 ? 1 - after / 0.35 : 1;
      const [r, gg, b] = p.col;
      g.save();
      g.globalAlpha = a;
      g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
      const pg = g.createLinearGradient(-p.w / 2, -p.h / 2, p.w / 2, p.h / 2);
      pg.addColorStop(0, `rgb(${Math.min(255, r + 90)},${Math.min(255, gg + 90)},${Math.min(255, b + 90)})`);
      pg.addColorStop(0.5, `rgb(${r},${gg},${b})`);
      pg.addColorStop(1, `rgb(${r * 0.45 | 0},${gg * 0.45 | 0},${b * 0.45 | 0})`);
      g.fillStyle = pg;
      g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
      const w = p.w / 2, h = p.h / 2;
      g.beginPath(); g.moveTo(-w * 0.7, -h); g.lineTo(w * 0.7, -h); g.lineTo(w, 0); g.lineTo(w * 0.7, h); g.lineTo(-w * 0.7, h); g.lineTo(-w, 0); g.closePath(); g.fill();
      g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.moveTo(-w * 0.5, 0); g.lineTo(w * 0.5, 0); g.stroke();
      if (after > 0) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,240,200,${0.9 * (1 - after / 0.35)})`;
        g.fill();
      }
      g.restore();
    }
  }

  // d: { paths: [{pts:[[x,y]...], w}], col:[r,g,b], a, pool:{x,y,r}? }
  drawInk(d) {
    const g = this.g;
    const [r, gg, b] = d.col;
    g.save();
    g.globalAlpha = d.a ?? 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (d.pool && d.pool.r > 1) {
      const p = d.pool;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      gr.addColorStop(0, 'rgba(0,0,0,0.92)'); gr.addColorStop(0.75, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * (p.flat ?? 1), 0, 0, TAU); g.fill();
    }
    for (const pass of [0, 1]) {
      for (const path of d.paths) {
        const pts = path.pts;
        if (pts.length < 2) continue;
        // tapered: draw the polyline in chunks that thin toward the head
        for (let i = 1; i < pts.length; i++) {
          const f = i / (pts.length - 1);
          const w = path.w * (0.25 + 0.75 * (1 - f * f * (path.taper ?? 0.8)));
          g.lineWidth = pass ? w : w + 7;
          g.strokeStyle = pass ? '#040606' : `rgba(${r * 255 | 0},${gg * 255 | 0},${b * 255 | 0},0.55)`;
          g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
        }
      }
      if (!pass) { g.shadowBlur = 0; }
    }
    g.restore();
  }

  drawSlashes(dt) {
    const g = this.g;
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      if (s.t > s.dur) { this.slashes.splice(i, 1); continue; }
      const k = s.t / s.dur;
      const sweep = easeOutCubic(Math.min(1, k * 4));
      const fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
      const a1 = s.a0 + (s.a1 - s.a0) * sweep;
      const th = s.r * s.thick * (0.6 + 0.4 * fade);
      const [r, gg, b] = s.col.map((v) => v * 255 | 0);
      g.save();
      g.globalCompositeOperation = 'lighter';
      // crescent: outer arc forward, inner arc back, offset so it's fat in the middle
      const draw = (off, col) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(s.x, s.y, s.r + off, s.a0, a1, s.a1 < s.a0);
        const mid = (s.a0 + a1) / 2;
        const cx = s.x + Math.cos(mid) * th, cy = s.y + Math.sin(mid) * th;
        g.arc(cx, cy, s.r + off - th * 0.2, a1, s.a0, s.a1 >= s.a0);
        g.closePath(); g.fill();
      };
      g.shadowColor = `rgb(${r},${gg},${b})`; g.shadowBlur = 40;
      draw(8, `rgba(${r},${gg},${b},${0.55 * fade})`);
      g.shadowBlur = 0;
      draw(0, `rgba(255,255,255,${0.95 * fade})`);
      g.restore();
    }
  }

  // d: { x, y, r, rot, hand, k, col }
  drawClock(d) {
    const g = this.g;
    const [r, gg, b] = d.col.map((v) => v * 255 | 0);
    const R = d.r;
    g.save();
    g.globalAlpha = d.k;
    g.translate(d.x, d.y);
    g.globalCompositeOperation = 'lighter';
    g.shadowColor = `rgb(${r},${gg},${b})`; g.shadowBlur = 18;
    g.strokeStyle = `rgba(${r},${gg},${b},0.9)`;
    g.lineWidth = 4; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, R * 0.86, 0, TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, R * 1.08, 0, TAU); g.stroke();
    const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    g.fillStyle = `rgba(255,240,252,0.95)`;
    g.font = `700 ${Math.max(12, R * 0.1)}px "Cinzel", Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU + d.rot;
      const big = i % 5 === 0;
      g.lineWidth = big ? 3 : 1.2;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * (big ? 0.88 : 0.93), Math.sin(a) * R * (big ? 0.88 : 0.93));
      g.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98);
      g.stroke();
      if (big) {
        const n = nums[i / 5];
        g.save(); g.translate(Math.cos(a - Math.PI / 2) * R * 0.74, Math.sin(a - Math.PI / 2) * R * 0.74);
        g.rotate(a); g.fillText(n, 0, 0); g.restore();
      }
    }
    // hands spinning backwards
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(d.hand * 0.083 - Math.PI / 2) * R * 0.45, Math.sin(d.hand * 0.083 - Math.PI / 2) * R * 0.45); g.stroke();
    g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(d.hand - Math.PI / 2) * R * 0.7, Math.sin(d.hand - Math.PI / 2) * R * 0.7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
    g.restore();
  }

  drawBlasts(dt) {
    const g = this.g, base = Math.min(this.w, this.h);
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const s = this.blasts[i];
      s.t += dt;
      if (s.t > s.dur) { this.blasts.splice(i, 1); continue; }
      const k = s.t / s.dur;
      const pop = k < 0.12 ? 0.4 + 0.9 * easeOutCubic(k / 0.12) : 1.3 - 0.1 * (k - 0.12);
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const fs = base * 0.11 * s.size * pop;
      g.save();
      g.globalAlpha = a;
      g.translate(s.x, s.y); g.rotate(s.rot);
      g.font = `900 italic ${fs}px "Bangers", "Noto Serif JP", "Impact", "Arial Black", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = fs * 0.22; g.strokeStyle = '#000'; g.strokeText(s.text, 0, 0);
      g.lineWidth = fs * 0.1; g.strokeStyle = `rgb(${s.col[0]},${s.col[1]},${s.col[2]})`; g.strokeText(s.text, 0, 0);
      g.fillStyle = '#fff'; g.fillText(s.text, 0, 0);
      g.restore();
    }
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
