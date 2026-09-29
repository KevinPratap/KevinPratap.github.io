// Mystral: an arcane sorcerer. Spinning mandalas, portals drawn in the air
// with a fingertip, a dimension that folds the whole world into a
// kaleidoscope, crescent slashes, and time run backward.
import { CONFIG, CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad, Sigil, makeSigilTextures } from '../render/objects.js';
import { clamp, rand, pick, TAU, damp, lerp, easeOutCubic } from '../util.js';

const CH = CHARACTERS.mystral;
const MAG = [[1, 0.35, 0.85], [1, 0.62, 0.95], [1, 0.92, 0.99], [0.75, 0.3, 1]];
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// Puts a 'ring' quad at radius R (px) with band width w.
function setRing(q, x, y, R, w, intensity, time, noise = 0.05) {
  const S = R / 0.4 + w * 4;
  q.set(x, y, S);
  q.param(R / (S / 2), w / (S / 2), noise, 0);
  q.intensity = intensity;
  q.tick(time);
}

export class Mystral {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    this.tex = makeSigilTextures('mystral', 91);
    this.slots = {};
    for (const s of ['L', 'R']) {
      this.slots[s] = {
        k: 0, cool: 0, callout: 0, burstCool: 0, x: 0, y: 0, size: 80,
        sigil: new Sigil(S, this.tex, CH.a, CH.b),
        halo: new FXQuad(S, 'glow', { a: CH.a, b: CH.b, intensity: 0, param: [3, 0, 0, 0] }),
        path: [], circCool: 0, sparkT: 0,
      };
    }
    this.portal = {
      on: false, t: 0, x: 0, y: 0, R: 0, life: 7, k: 0, src: null,
      rim: new FXQuad(S, 'ring', { a: CH.a, b: CH.b, intensity: 0 }),
      rim2: new FXQuad(S, 'ring', { a: CH.a, b: CH.b, intensity: 0 }),
      sigil: new Sigil(S, this.tex, CH.a, CH.b),
    };
    this.mir = {
      t: 0, on: false, k: 0, lost: 0, x: 0, y: 0, called: false,
      sigil: new Sigil(S, this.tex, CH.a, CH.b),
    };
    this.tl = {
      t: 0, phase: 'idle', pt: 0, x: 0, y: 0, R: 0, k: 0, cool: 0, lost: 0, ang: 0,
      rim: new FXQuad(S, 'ring', { a: CH.a, b: CH.b, intensity: 0 }),
      sigil: new Sigil(S, this.tex, CH.a, CH.b),
    };
    this.cool = { crescent: 0 };
    this.timers = [];
    this.slash = { on: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0 };
  }

  enter() {
    this.portal.src = Post.source('window');
  }

  exit() {
    for (const st of Object.values(this.slots)) {
      st.k = 0; st.path.length = 0;
      st.sigil.target = 0; st.sigil.level = 0; st.sigil.update(0, 0, 0, 0, 1);
      st.halo.intensity = 0;
    }
    const p = this.portal;
    p.on = false; p.k = 0;
    p.rim.intensity = 0; p.rim2.intensity = 0;
    p.sigil.target = 0; p.sigil.level = 0; p.sigil.update(0, 0, 0, 0, 1);
    const i = Post.persistent.indexOf(p.src);
    if (i >= 0) Post.persistent.splice(i, 1);
    p.src = null;
    const m = this.mir;
    m.t = 0; m.on = false; m.k = 0;
    m.sigil.target = 0; m.sigil.level = 0; m.sigil.update(0, 0, 0, 0, 1);
    const t = this.tl;
    t.phase = 'idle'; t.t = 0; t.k = 0;
    t.rim.intensity = 0;
    t.sigil.target = 0; t.sigil.level = 0; t.sigil.update(0, 0, 0, 0, 1);
    Post.resetExtras();
    this.timers.length = 0;
  }

  after(t, fn) { this.timers.push({ t, fn }); }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: o.drag ?? 1.5, grav: o.grav ?? 0,
      life: o.life ?? rand(0.3, 0.6), c: pick(MAG), bright: o.bright ?? 2.1,
      width: o.width ?? rand(1.5, 3), stretch: o.stretch ?? 0.04, fade: 1.2, fn: o.fn,
    });
  }

  update(dt, time, hands) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    this.cool.crescent -= dt;
    const levels = [0.32, 0.32];
    const mirrorOn = this.updateMirror(hands, dt, time, levels);
    const clockOn = this.updateTime(hands, dt, time, levels);
    const busy = mirrorOn || clockOn;
    levels[0] = Math.max(levels[0], this.updateHand(this.slots.L, hands.L, dt, time, busy));
    levels[1] = Math.max(levels[1], this.updateHand(this.slots.R, hands.R, dt, time, busy));
    this.updatePortal(dt, time);
    return levels;
  }

  // ---------- per hand: Mandala Shield, Portal Ring, Crescent Slash ----------
  updateHand(st, h, dt, time, busy) {
    const { overlay, sfx, fx } = this.ctx;
    st.callout -= dt; st.burstCool -= dt; st.circCool -= dt; st.sparkT -= dt;
    if (h.present) {
      st.x = damp(st.x || h.cx, h.cx, 22, dt);
      st.y = damp(st.y || h.cy, h.cy, 22, dt);
      st.size = h.scale;
      if (st.sparkT <= 0) {
        st.sparkT = 0.05;
        const p = h.pts[pick([4, 8, 12, 16, 20])];
        this.ctx.particles.spawn({
          x: p.x, y: p.y, vx: rand(-50, 50), vy: rand(-90, -20), drag: 1.2, life: rand(0.5, 0.9),
          c: pick(MAG), bright: 0.8, size: rand(4, 8), size1: 12, fade: 1.2, flicker: 0.2,
        });
      }
    }

    // ---- Mandala Shield ----
    const want = h.present && !busy && h.isOpen && h.still && !h.point && !h.two ? 1 : 0;
    st.k = damp(st.k, want, want ? 3.2 : 6, dt);
    if (st.k < 0.004) st.k = 0;
    const K = st.k;
    if (K > 0.55 && st.callout <= 0) {
      overlay.callout('護法陣', 'Mandala Shield');
      sfx.play('chime');
      this.ctx.onMove(0);
      st.callout = 3.2;
      fx.ring({ x: st.x, y: st.y, r0: st.size, r1: st.size * 4.5, dur: 0.5, width: 12, a: CH.a, b: CH.b, intensity: 2 });
    }
    st.sigil.target = K > 0.04 ? 1 : 0;
    st.sigil.charge = K;
    const size = st.size * (2.2 + K * 1.5);
    st.sigil.update(dt, time, st.x, st.y, size, 0.9 + K * 1.4);
    st.halo.set(st.x, st.y, size * 1.5);
    st.halo.intensity = K > 0.02 ? K * 0.18 : 0;
    st.halo.tick(time);
    if (K > 0.05) {
      // sparks orbit the rim like a spinning wheel of fire
      const n = Math.floor(160 * K * dt + Math.random());
      const R = size * 0.42;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const s = this.spark(st.x + Math.cos(a) * R * rand(0.94, 1.04), st.y + Math.sin(a) * R * rand(0.94, 1.04), a + Math.PI / 2, rand(280, 520), { life: rand(0.35, 0.7), drag: 0.9, width: rand(1.5, 2.8) });
        if (s) { s.vx += Math.cos(a) * 60; s.vy += Math.sin(a) * 60; }
      }
      sfx.loop('hum', K * 0.6);
      Post.wantAura(K * 0.35, CH.a, CH.b);
      if (h.present && (h.thrust || h.flick) && st.burstCool <= 0 && K > 0.5) this.shieldBurst(st, h);
    }

    // ---- Portal Ring: trace a circle with a fingertip ----
    if (h.present && h.point && !busy) {
      if (h.speed > 0.9) {
        st.path.push({ x: h.tipX, y: h.tipY, t: time });
        if (Math.random() < dt * 90) {
          this.ctx.particles.spawn({
            x: h.tipX, y: h.tipY, vx: rand(-40, 40), vy: rand(-30, 60), drag: 1.5, life: rand(0.6, 1.1),
            c: pick(MAG), bright: 1.4, size: rand(4, 8), size1: 1, fade: 1,
          });
        }
      }
      while (st.path.length && time - st.path[0].t > 1.8) st.path.shift();
      if (st.path.length > 12 && st.circCool <= 0) this.checkCircle(st, h);
      this.drawPath(st, h);
    } else if (st.path.length) {
      st.path.length = 0;
    }

    // ---- Crescent Slash ----
    this.updateSlash(st, h, dt, time);
    return 0.32 + K * 1.2;
  }

  drawPath(st, h) {
    // the stroke you are drawing stays lit for a moment
    const P = st.path;
    for (let i = 1; i < P.length; i++) {
      this.ctx.lines.spawn(P[i - 1].x, P[i - 1].y, P[i].x, P[i].y, 7, MAG[1], 1.6, 0.05);
    }
  }

  checkCircle(st, h) {
    const P = st.path, n = P.length;
    let cx = 0, cy = 0;
    for (const p of P) { cx += p.x; cy += p.y; }
    cx /= n; cy /= n;
    let sum = 0, meanR = 0, prev = Math.atan2(P[0].y - cy, P[0].x - cx);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(P[i].y - cy, P[i].x - cx);
      if (i) sum += angDiff(a, prev);
      prev = a;
      meanR += Math.hypot(P[i].x - cx, P[i].y - cy);
    }
    meanR /= n;
    const base = Math.min(window.innerWidth, window.innerHeight);
    if (Math.abs(sum) < 5.2 || meanR < Math.max(h.scale * 0.8, 36) || meanR > base * 0.42) return;
    let v = 0;
    for (const p of P) v += (Math.hypot(p.x - cx, p.y - cy) - meanR) ** 2;
    if (Math.sqrt(v / n) / meanR > 0.4) return;
    st.path.length = 0;
    st.circCool = 1.2;
    this.openPortal(cx, cy, clamp(meanR * 1.25, base * 0.13, base * 0.3));
  }

  openPortal(x, y, R) {
    const { fx, sfx, overlay } = this.ctx;
    const p = this.portal;
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    p.on = true; p.t = 0; p.x = x; p.y = y; p.R = R; p.life = 7;
    Post.flashScreen(0.4, CH.b);
    Post.shake(0.7);
    Post.punch(1.6, x, y);
    Post.aberrate(10);
    Post.bloom(1.6);
    Post.shockwave({ x, y, speed: 1400, width: 90, strength: 40, life: 0.8 });
    fx.ring({ x, y, r0: R * 0.5, r1: diag * 0.6, dur: 0.7, width: 30, a: CH.a, b: CH.b, noise: 0.1, intensity: 2.2 });
    fx.glow({ x, y, s0: R, s1: R * 5, dur: 0.4, a: CH.a, b: [1, 1, 1], intensity: 2.8 });
    for (let i = 0; i < 120; i++) this.spark(x + Math.cos(i) * R, y + Math.sin(i) * R, rand(0, TAU), rand(500, 1800), { life: rand(0.3, 0.7) });
    overlay.callout('転移門', 'Portal Ring', { big: true, dur: 1.5 });
    sfx.play('portal');
    sfx.play('chime');
    this.ctx.onMove(1);
  }

  updatePortal(dt, time) {
    const p = this.portal;
    if (!p.on && p.k < 0.003) {
      p.rim.intensity = 0; p.rim2.intensity = 0;
      p.sigil.target = 0; p.sigil.update(dt, time, p.x, p.y, 10);
      if (p.src) p.src.strength = 0;
      return;
    }
    if (p.on) {
      p.t += dt;
      if (p.t > p.life) { p.on = false; this.closePortal(); }
    }
    p.k = damp(p.k, p.on ? 1 : 0, p.on ? 7 : 8, dt);
    const k = p.k, R = p.R * (0.25 + 0.75 * easeOutCubic(k));
    if (p.src) {
      p.src.x = p.x; p.src.y = p.y; p.src.radius = R; p.src.strength = k;
    }
    setRing(p.rim, p.x, p.y, R, R * 0.035 + 3, 0.55 * k, time, 0.14);
    setRing(p.rim2, p.x, p.y, R * 1.07, R * 0.015 + 2, 0.3 * k, time + 5, 0.25);
    p.sigil.target = k > 0.05 ? 1 : 0;
    p.sigil.charge = 1;
    p.sigil.update(dt, time, p.x, p.y, R * 2.3, 1.2);
    p.sigil.outer.intensity *= 0.55; p.sigil.inner.intensity *= 0.55;
    // sparks pour around the rim, and now and then burst toward you
    const n = Math.floor(220 * k * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU) + time * 2;
      const cx = p.x + Math.cos(a) * R, cy = p.y + Math.sin(a) * R;
      const out = Math.random() < 0.3;
      this.spark(cx, cy, out ? a : a + Math.PI / 2 + rand(-0.2, 0.2), out ? rand(300, 900) : rand(380, 760), { life: rand(0.3, 0.7), drag: out ? 1.2 : 0.7 });
    }
    if (Math.random() < dt * 2 * k) {
      fx_burst(this, p, R);
    }
    this.ctx.sfx.loop('hum', 0.55 * k);
    Post.wantAura(0.4 * k, CH.a, CH.b);
    Post.wantEdge(0.2 * k, CH.a);
    Post.wantDim(0.3 * k);
    Post.shake(dt * 0.25 * k);
  }

  closePortal() {
    const { fx, sfx } = this.ctx;
    const p = this.portal;
    fx.ring({ x: p.x, y: p.y, r0: p.R * 1.2, r1: 6, dur: 0.3, width: 16, a: CH.a, b: CH.b, intensity: 1.8 });
    this.after(0.3, () => {
      Post.shockwave({ x: p.x, y: p.y, speed: 1200, width: 70, strength: 30, life: 0.6 });
      Post.flashScreen(0.3, CH.b);
      Post.shake(0.5);
      fx.glow({ x: p.x, y: p.y, s0: 40, s1: p.R * 4, dur: 0.35, a: CH.a, b: [1, 1, 1], intensity: 2.6 });
      for (let i = 0; i < 80; i++) this.spark(p.x, p.y, rand(0, TAU), rand(400, 1500));
    });
    sfx.play('collapse');
  }

  // ---------- Mandala burst ----------
  shieldBurst(st, h) {
    const { fx, sfx, overlay } = this.ctx;
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    st.burstCool = 0.7;
    const x = st.x, y = st.y;
    st.k *= 0.2;
    fx.ring({ x, y, r0: h.scale, r1: diag * 0.6, dur: 0.6, width: 24, a: CH.a, b: CH.b, noise: 0.08, intensity: 2.2 });
    fx.ring({ x, y, r0: h.scale, r1: diag * 0.4, dur: 0.45, width: 12, a: CH.b, b: [1, 1, 1], intensity: 1.6 });
    fx.glow({ x, y, s0: h.scale * 2, s1: h.scale * 9, dur: 0.3, a: CH.a, b: CH.b, intensity: 2.6 });
    Post.shockwave({ x, y, speed: 1400, width: 80, strength: 38, life: 0.7 });
    Post.shake(0.6);
    Post.punch(1.8, x, y);
    Post.aberrate(10);
    Post.bloom(1.6);
    Post.flashScreen(0.25, CH.b);
    for (let i = 0; i < 90; i++) this.spark(x, y, rand(0, TAU), rand(500, 1800));
    overlay.callout('護法陣', 'Mandala Burst');
    sfx.play('push');
    sfx.play('chime');
  }

  // ---------- Crescent Slash ----------
  updateSlash(st, h, dt, time) {
    const s = this.slash;
    const fast = h.present && h.two && h.speed > CONFIG.slashSpeed * (st.slashing ? 0.45 : 1);
    if (fast) {
      if (!st.slashing) { st.slashing = true; st.sx = h.tipX; st.sy = h.tipY; st.st = 0; this.ctx.sfx.play('whip'); }
      st.st += dt;
      st.ex = h.tipX; st.ey = h.tipY;
      if (Math.random() < dt * 80) this.spark(h.tipX, h.tipY, rand(0, TAU), rand(80, 300), { life: 0.25 });
    } else if (st.slashing) {
      st.slashing = false;
      const len = Math.hypot(st.ex - st.sx, st.ey - st.sy);
      if (len > h.scale * 2 && this.cool.crescent <= 0 && st.st < 0.8) this.crescent(st.sx, st.sy, st.ex, st.ey, h.scale);
    }
  }

  crescent(x0, y0, x1, y1, sc) {
    const { fx, sfx, overlay, lines } = this.ctx;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // extend past both ends, bulge toward the top of the screen
    const ax = x0 - ux * len * 0.2, ay = y0 - uy * len * 0.2;
    const bx = x1 + ux * len * 0.25, by = y1 + uy * len * 0.25;
    let nx = -uy, ny = ux;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const L = Math.hypot(bx - ax, by - ay);
    this.cool.crescent = 0.45;
    const arc = (bulge, w, bright, life, delay) => this.after(delay, () => {
      const cx = (ax + bx) / 2 + nx * L * bulge, cy = (ay + by) / 2 + ny * L * bulge;
      const N = 34;
      let px = ax, py = ay;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const qx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
        const qy = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
        const taper = Math.pow(Math.sin(Math.PI * t), 0.75);
        lines.spawn(px, py, qx, qy, w * taper + 1, MAG[i % 2 ? 1 : 2], bright, life);
        px = qx; py = qy;
      }
    });
    arc(0.34, 46, 3, 0.4, 0);
    arc(0.22, 26, 2.2, 0.32, 0.03);
    arc(0.11, 14, 1.8, 0.26, 0.06);
    Post.tear({ x0: ax, y0: ay, x1: bx, y1: by, strength: 22, width: 10, life: 1.0 });
    Post.freeze(0.07);
    Post.shake(0.55);
    Post.aberrate(10);
    Post.flashScreen(0.2, CH.b);
    Post.bloom(1.5);
    const mx = (ax + bx) / 2 + nx * L * 0.17, my = (ay + by) / 2 + ny * L * 0.17;
    fx.glow({ x: mx, y: my, s0: sc, s1: L * 1.1, dur: 0.3, a: CH.a, b: [1, 1, 1], intensity: 2 });
    fx.ring({ x: mx, y: my, r0: sc * 0.5, r1: L * 0.6, dur: 0.5, width: 16, a: CH.a, b: CH.b, intensity: 1.8 });
    for (let i = 0; i < 70; i++) {
      const t = rand(0, 1);
      const px = lerp(ax, bx, t) + nx * L * 0.3 * Math.sin(Math.PI * t), py = lerp(ay, by, t) + ny * L * 0.3 * Math.sin(Math.PI * t);
      this.spark(px, py, Math.atan2(ny, nx) + rand(-0.6, 0.6), rand(200, 1100), { life: rand(0.3, 0.6) });
    }
    overlay.callout('月光斬', 'Crescent Slash', { big: true, dur: 1.2 });
    sfx.play('tear');
    sfx.play('chime');
    this.ctx.onMove(3);
  }

  // ---------- Mirror Dimension ----------
  updateMirror(hands, dt, time, levels) {
    const m = this.mir, L = hands.L, R = hands.R;
    const { overlay, sfx, fx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    let hold = false;
    if (L.present && R.present && L.two && R.two && L.speed < CONFIG.stillSpeed * 2.4 && R.speed < CONFIG.stillSpeed * 2.4) hold = true;
    m.lost = hold ? 0 : m.lost + dt;
    if (hold) m.t += dt * this.ctx.voice.boost;
    if (!m.on && m.t > 0.7) {
      m.on = true;
      overlay.callout('鏡像界', 'Mirror Dimension', { big: true, dur: 1.8 });
      sfx.play('mirror');
      this.ctx.onMove(2);
      Post.flashScreen(0.5, CH.b);
      Post.impact(0.1, CH.b);
      Post.freeze(0.08);
      Post.shake(0.9);
      Post.aberrate(14);
      Post.shockwave({ x: W / 2, y: H / 2, speed: 1800, width: 100, strength: 50, life: 0.9 });
      fx.ring({ x: W / 2, y: H / 2, r0: 20, r1: diag * 0.7, dur: 0.8, width: 36, a: CH.a, b: CH.b, noise: 0.1, intensity: 2.4 });
      fx.glow({ x: W / 2, y: H / 2, s0: 80, s1: diag, dur: 0.5, a: CH.a, b: [1, 1, 1], intensity: 3 });
    }
    if (m.on && m.lost > 0.35) {
      m.on = false; m.t = 0;
      Post.flashScreen(0.3, CH.b);
      Post.shake(0.5);
      Post.aberrate(10);
      sfx.play('collapse');
      fx.ring({ x: W / 2, y: H / 2, r0: diag * 0.5, r1: 10, dur: 0.35, width: 24, a: CH.a, b: CH.b, intensity: 2 });
    }
    if (!m.on && !hold) m.t = Math.max(0, m.t - dt * 2);
    m.k = damp(m.k, m.on ? 1 : 0, m.on ? 3.5 : 6, dt);
    if (m.k < 0.004) {
      m.k = 0;
      m.sigil.target = 0; m.sigil.update(dt, time, W / 2, H / 2, 10);
      return false;
    }
    Post.wantKaleido(m.k * 0.95, 8);
    Post.wantAura(0.12 * m.k, CH.a, CH.b);
    Post.wantEdge(0.15 * m.k, CH.a);
    m.sigil.target = 1;
    m.sigil.charge = 1;
    m.sigil.update(dt, time, W / 2, H / 2, Math.min(W, H) * 0.95 * m.k, 0.6);
    m.sigil.outer.intensity *= 0.35; m.sigil.inner.intensity *= 0.35;
    Post.wantDim(0.6 * m.k);
    // orbiting sparks around the middle
    const n = Math.floor(90 * m.k * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), r = Math.min(W, H) * rand(0.15, 0.5);
      this.spark(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, a + Math.PI / 2, rand(200, 600), { life: rand(0.5, 1), drag: 0.5 });
    }
    sfx.loop('hum', 0.8 * m.k);
    sfx.loop('drone', 0.35 * m.k);
    overlay.letterbox(m.k * 0.8);
    levels[0] = Math.max(levels[0], 0.25 * m.k);
    levels[1] = Math.max(levels[1], 0.25 * m.k);
    return m.on;
  }

  // ---------- Time Loop ----------
  updateTime(hands, dt, time, levels) {
    const t = this.tl, L = hands.L, R = hands.R;
    const { overlay, sfx, fx, lines, streaks } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H), diag = Math.hypot(W, H);
    t.cool -= dt;
    let hold = false;
    if (L.present && R.present && t.phase !== 'boom') {
      const sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      if (d < CONFIG.touchDist * 1.3 && L.speed < CONFIG.stillSpeed * 2.4 && R.speed < CONFIG.stillSpeed * 2.4 && !L.point && !R.point && !L.two && !R.two) {
        hold = true;
        const mx = (L.cx + R.cx) / 2, my = (L.cy + R.cy) / 2;
        t.x = t.pt > 0 ? damp(t.x, mx, 12, dt) : mx;
        t.y = t.pt > 0 ? damp(t.y, my, 12, dt) : my;
        t.R = sc * 2.2;
      }
    }
    if (t.phase === 'idle') {
      t.lost = hold ? 0 : t.lost + dt;
      if (hold && t.cool <= 0) t.pt += dt * this.ctx.voice.boost; else t.pt = Math.max(0, t.pt - dt * 2);
      if (t.pt > 1.0) {
        t.phase = 'rewind'; t.t = 0;
        overlay.callout('時廻', 'Time Loop', { big: true, dur: 2.0 });
        sfx.play('rewind');
        this.ctx.onMove(4);
        Post.freeze(0.06);
        Post.flashScreen(0.3, CH.b);
      }
    }
    const charge = clamp(t.pt / 1.0, 0, 1);
    let vis = t.phase === 'idle' ? charge : 1;
    if (t.phase === 'rewind') {
      t.t += dt;
      const p = clamp(t.t / 1.5, 0, 1);
      // the clock unwinds faster and faster
      t.ang -= dt * (2 + 18 * p * p);
      Post.glitchFor(0.25 + 0.5 * p);
      Post.wantDim(0.6 * p);
      Post.wantZoom(-0.02 + 0.06 * p, t.x, t.y);
      Post.afterimage(0.35 * p, -300 * (0.3 + p));
      Post.aberrate(4 + 12 * p);
      // debris streams backward: every spark flies in toward the clock
      const n = Math.floor(160 * dt * (0.4 + p) + Math.random());
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = diag * rand(0.4, 0.75);
        const sx = t.x + Math.cos(a) * d, sy = t.y + Math.sin(a) * d;
        streaks.spawn({
          x: sx, y: sy, vx: -Math.cos(a) * rand(1200, 2600), vy: -Math.sin(a) * rand(1200, 2600), drag: 0,
          life: d / 2000, c: pick(MAG), bright: 2, width: rand(1.5, 3), stretch: 0.06, fade: 0.6,
        });
      }
      sfx.loop('charge', 0.4 + p * 0.6);
      if (t.t >= 1.5) {
        t.phase = 'boom'; t.t = 0;
        Post.impact(0.14, CH.b);
        Post.flashScreen(0.85, CH.b);
        Post.freeze(0.12);
        Post.shake(1);
        Post.punch(2.4, t.x, t.y);
        Post.aberrate(18);
        Post.bloom(2.4);
        Post.shockwave({ x: t.x, y: t.y, speed: 2000, width: 130, strength: 60, life: 1.0 });
        fx.ring({ x: t.x, y: t.y, r0: 10, r1: diag * 0.85, dur: 0.9, width: 40, a: CH.a, b: CH.b, noise: 0.1, intensity: 2.4 });
        fx.ring({ x: t.x, y: t.y, r0: 10, r1: diag * 0.6, dur: 0.6, width: 20, a: CH.b, b: [1, 1, 1], intensity: 1.8 });
        fx.glow({ x: t.x, y: t.y, s0: 80, s1: diag, dur: 0.6, a: CH.a, b: [1, 1, 1], intensity: 3.2 });
        overlay.crack(t.x, t.y, 1.3);
        for (let i = 0; i < 180; i++) this.spark(t.x, t.y, rand(0, TAU), rand(600, 2400), { life: rand(0.4, 0.9), width: rand(2, 4) });
        sfx.play('nova');
        sfx.play('chime');
      }
    } else if (t.phase === 'boom') {
      t.t += dt;
      vis = clamp(1 - t.t / 0.5, 0, 1);
      if (t.t > 0.5) { t.phase = 'idle'; t.pt = 0; t.cool = 2.2; t.t = 0; }
    }
    t.k = damp(t.k, vis, 10, dt);
    if (t.k < 0.005) {
      t.rim.intensity = 0;
      t.sigil.target = 0; t.sigil.update(dt, time, t.x, t.y, 10);
      return t.phase !== 'idle';
    }
    const R0 = Math.max(t.R * (0.9 + 0.5 * t.k), base * 0.1) * (t.phase === 'rewind' ? 1.5 + 0.8 * clamp(t.t / 1.5, 0, 1) : 1);
    setRing(t.rim, t.x, t.y, R0, R0 * 0.03 + 3, 1.8 * t.k, time, 0.05);
    t.sigil.target = t.k > 0.05 ? 1 : 0;
    t.sigil.charge = charge;
    t.sigil.update(dt, time, t.x, t.y, R0 * 2.3, -1.4 + t.ang * 0.3);
    // clock face: 60 ticks and two hands, drawn fresh each frame
    const c = MAG[1];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2, long = i % 5 === 0;
      const r0 = R0 * (long ? 0.86 : 0.92), r1 = R0 * 0.98;
      lines.spawn(t.x + Math.cos(a) * r0, t.y + Math.sin(a) * r0, t.x + Math.cos(a) * r1, t.y + Math.sin(a) * r1, long ? 4 : 2, c, 1.5 * t.k, 0.04);
    }
    const ha = t.ang * 0.6, ma = t.ang * 3.2;
    lines.spawn(t.x, t.y, t.x + Math.cos(ha) * R0 * 0.55, t.y + Math.sin(ha) * R0 * 0.55, 7, MAG[2], 2.2 * t.k, 0.04);
    lines.spawn(t.x, t.y, t.x + Math.cos(ma) * R0 * 0.85, t.y + Math.sin(ma) * R0 * 0.85, 4, MAG[1], 2.2 * t.k, 0.04);
    if (t.phase === 'idle') t.ang += dt * 1.5;
    sfx.loop('charge', charge * 0.5);
    Post.wantAura(0.45 * t.k, CH.a, CH.b);
    overlay.letterbox(t.k * 0.7);
    levels[0] = Math.max(levels[0], 0.8 + t.k);
    levels[1] = Math.max(levels[1], 0.8 + t.k);
    return true;
  }
}

// Occasional sparkler burst that flies out of the open portal.
function fx_burst(self, p, R) {
  const a0 = rand(0, TAU);
  for (let i = 0; i < 18; i++) {
    const a = a0 + rand(-0.6, 0.6);
    self.spark(p.x + Math.cos(a) * R * 0.7, p.y + Math.sin(a) * R * 0.7, a, rand(700, 1600), { life: rand(0.3, 0.6), width: rand(2, 3.5) });
  }
}
