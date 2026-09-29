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
        whip: { on: false, k: 0, pts: [], snapCool: 0, called: false, tipV: 0 },
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
    this.sing = { on: false, hold: 0, slot: 'R', x: 0, y: 0, vx: 0, vy: 0, thrown: false, t: 0, R: 44, k: 0, well: null, lens: null, spawnT: 0, rockT: 0, eaten: 0, lost: 0, cool: 0, pulse: 0, rim: new FXQuad(S, 'ring', { a: CH.a, b: CH.b, intensity: 0 }) };
    this.timers = [];
    this.slash = { on: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0 };
  }

  enter() {
    this.portal.src = Post.source('window');
    this.sing.lens = Post.source('lens');
  }

  exit() {
    for (const st of Object.values(this.slots)) {
      st.k = 0; st.path.length = 0;
      st.whip.on = false; st.whip.k = 0;
      st.sigil.target = 0; st.sigil.level = 0; st.sigil.update(0, 0, 0, 0, 1);
      st.halo.intensity = 0;
    }
    this.endSing(true);
    if (this.sing.lens) { const j = Post.persistent.indexOf(this.sing.lens); if (j >= 0) Post.persistent.splice(j, 1); this.sing.lens = null; }
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
    const singOn = this.updateSing(hands, dt, time);
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
    const want = h.present && !busy && h.isOpen && h.still && !h.point && !h.two && !h.pinch && !st.whip.on ? 1 : 0;
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
    // ---- Eldritch Whip ----
    this.updateWhip(st, h, dt, time, busy);
    return 0.32 + K * 0.35;
  }

  // A rope of light hanging from your pinch. Verlet physics: it swings,
  // wraps and trails behind your hand; snap your wrist to crack it.
  updateWhip(st, h, dt, time, busy) {
    const w = st.whip, { lines, sfx, fx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    const N = 26, SEG = Math.min(W, H) * 0.56 / N;
    const want = h.present && h.pinch && !busy;
    w.snapCool -= dt;
    if (want && !w.on) {
      w.on = true; w.pts = [];
      for (let i = 0; i < N; i++) w.pts.push({ x: h.pinchX, y: h.pinchY + i * SEG * 0.3, px: h.pinchX, py: h.pinchY + i * SEG * 0.3 });
      sfx.play('chime');
      if (!w.called) { w.called = true; overlay.callout('魔鞭', 'Eldritch Whip'); this.ctx.onMove(5); }
      fx.ring({ x: h.pinchX, y: h.pinchY, r0: 6, r1: h.scale * 1.6, dur: 0.3, width: 6, a: CH.a, b: CH.b, intensity: 1.6 });
    }
    w.k = damp(w.k, want ? 1 : 0, want ? 8 : 5, dt);
    if (!w.on) return;
    if (!want && w.k < 0.03) { w.on = false; return; }
    const P = w.pts;
    const sdt = Math.min(dt, 1 / 30);
    // integrate
    for (let i = 1; i < N; i++) {
      const p = P[i];
      const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + 1400 * sdt * sdt;
    }
    if (want) { P[0].px = P[0].x; P[0].py = P[0].y; P[0].x = h.pinchX; P[0].y = h.pinchY; }
    for (let it = 0; it < 8; it++) {
      for (let i = 1; i < N; i++) {
        const a = P[i - 1], b = P[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-4;
        const diff = (d - SEG) / d;
        if (i === 1 && want) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
    }
    // crack: the tip breaking past a speed you can only reach with a snap
    const tip = P[N - 1];
    const tv = Math.hypot(tip.x - tip.px, tip.y - tip.py) / Math.max(sdt, 1e-3);
    w.tipV = tv;
    if (want && tv > Math.min(W, H) * 2.8 && w.snapCool <= 0) {
      w.snapCool = 0.3;
      const a = Math.atan2(tip.y - tip.py, tip.x - tip.px);
      sfx.play('whip'); sfx.play('crack');
      Post.shake(0.4); Post.aberrate(8); Post.freeze(0.04);
      Post.shockwave({ x: tip.x, y: tip.y, speed: 1300, width: 60, strength: 26, life: 0.5 });
      fx.glow({ x: tip.x, y: tip.y, s0: 20, s1: 260, dur: 0.25, a: CH.a, b: [1, 1, 1], intensity: 2.2 });
      fx.ring({ x: tip.x, y: tip.y, r0: 6, r1: 200, dur: 0.35, width: 10, a: CH.a, b: CH.b, intensity: 1.8 });
      for (let i = 0; i < 40; i++) this.spark(tip.x, tip.y, a + rand(-0.9, 0.9), rand(400, 1600), { life: rand(0.2, 0.45) });
      overlay.sfxText('SNAP!', tip.x, tip.y - 60, 0.6, [255, 120, 230]);
    }
    // draw: a hot core with a wider halo, thinning to the tip
    for (let i = 1; i < N; i++) {
      const a = P[i - 1], b = P[i], f = i / N;
      lines.spawn(a.x, a.y, b.x, b.y, (26 - 16 * f) * w.k, MAG[1], 0.9 * w.k, 0.055);
      lines.spawn(a.x, a.y, b.x, b.y, (8 - 5 * f) * w.k, [1, 0.92, 0.99], 1.8 * w.k, 0.055);
    }
    if (Math.random() < dt * 40 * w.k) {
      const i = (Math.random() * N) | 0;
      this.ctx.particles.spawn({ x: P[i].x, y: P[i].y, vx: rand(-40, 40), vy: rand(-60, 20), drag: 1.4, life: rand(0.4, 0.8), c: pick(MAG), bright: 1.2, size: rand(4, 8), size1: 1, fade: 1 });
    }
    if (tv > Math.min(W, H) * 2) this.spark(tip.x, tip.y, rand(0, TAU), rand(100, 400), { life: 0.2, width: 1.5 });
    sfx.loop('hum', 0.35 * w.k);
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

  // ---------- Singularity ----------
  // Hold a fist still and a black hole forms in it. Real gravity pulls
  // debris and sparks into orbit around it: they spiral in, heat up and
  // vanish at the horizon. Move your fist and the whole swirl follows.
  // Open the hand to let go, and everything it swallowed is flung out.
  updateSing(hands, dt, time) {
    const s = this.sing, { overlay, sfx, fx, phys, lines } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H), diag = Math.hypot(W, H);
    s.cool -= dt;
    const L = hands.L, R = hands.R;
    let h = null;
    for (const c of [L, R]) {
      const o = c === L ? R : L;
      if (c.present && c.fist && (!o.present || Math.hypot(o.cx - c.cx, o.cy - c.cy) > c.scale * 4.5) && !c.pinch) h = c;
    }
    const tHand = s.on ? hands[s.slot] : h;
    if (!s.on) {
      if (h && h.still && s.cool <= 0 && !this.mir.on && this.tl.phase === 'idle') {
        s.hold += dt * this.ctx.voice.boost; s.slot = h.slot; s.x = h.cx; s.y = h.cy;
      } else s.hold = Math.max(0, s.hold - dt * 2.5);
      if (s.hold > 0.05) {
        // charging: a dark seed and a ring collapsing onto the fist
        const c = clamp(s.hold / 0.6, 0, 1), sc = h ? h.scale : 70;
        if (h) { s.x = h.cx; s.y = h.cy; }
        setRing(s.rim, s.x, s.y, sc * (3.2 - 2.4 * c), 3 + c * 3, 0.9 + c, time, 0.06);
        Post.wantDim(0.25 * c);
        sfx.loop('charge', c * 0.8);
        if (Math.random() < dt * 110 * c) {
          const a = rand(0, TAU), d = sc * rand(2.4, 4);
          this.ctx.streaks.spawn({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 6, vy: -Math.sin(a) * d * 6, drag: 0, life: 0.16, c: pick(MAG), bright: 1.8, width: 2, stretch: 0.06, fade: 0.8 });
        }
        if (s.hold >= 0.6) this.startSing(h);
      } else s.rim.intensity = 0;
      return false;
    }
    // ---- alive ----
    s.t += dt;
    s.k = damp(s.k, 1, 5, dt);
    s.rim.intensity = 0;
    const releasing = !s.thrown && (!tHand.present ? (s.lost += dt) > 0.6 : (s.lost = 0, tHand.isOpen && tHand.open > 0.75 && s.t > 0.5));
    if (!s.thrown) {
      if (tHand.present) {
        // heavy: it lags behind the fist, so it swings when you sweep
        const k = 1 - Math.exp(-7 * dt);
        const nx = s.x + (tHand.cx - s.x) * k, ny = s.y + (tHand.cy - s.y) * k;
        s.vx = (nx - s.x) / dt; s.vy = (ny - s.y) / dt; s.x = nx; s.y = ny;
        if (tHand.flick && tHand.fist && s.t > 0.6) {
          const d = tHand.dir();
          s.thrown = true; s.t = 0; s.vx = d.x * 1500; s.vy = d.y * 1500;
          overlay.callout('特異点', 'Singularity: Thrown', { dur: 0.9 });
          sfx.play('whip');
          Post.shake(0.4);
        }
      }
    } else {
      s.x += s.vx * dt; s.y += s.vy * dt;
      const drag = Math.exp(-0.7 * dt); s.vx *= drag; s.vy *= drag;
      if (s.x < 60 && s.vx < 0) s.vx *= -0.8;
      if (s.x > W - 60 && s.vx > 0) s.vx *= -0.8;
      if (s.y < 60 && s.vy < 0) s.vy *= -0.8;
      if (s.y > H - 60 && s.vy > 0) s.vy *= -0.8;
    }
    s.R = base * 0.075 * (1 + Math.min(0.5, s.eaten / 160));
    if (s.well) { s.well.x = s.x; s.well.y = s.y; s.well.rs = s.R * 0.9; }
    // spawn matter on a wide ring: some near-circular, some plunging
    s.spawnT -= dt; s.rockT -= dt;
    if (s.spawnT <= 0) {
      s.spawnT = 0.014;
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU), r = rand(base * 0.35, base * 0.85);
        const px = s.x + Math.cos(a) * r, py = s.y + Math.sin(a) * r * 0.85;
        const vc = Math.sqrt(s.well.GM / r) * rand(0.45, 0.98);
        phys.orbiter(px, py, -Math.sin(a) * vc + s.vx * 0.3, Math.cos(a) * vc + s.vy * 0.3, { life: rand(5, 9), hue: Math.random() });
      }
    }
    if (s.rockT <= 0 && !releasing) {
      s.rockT = rand(0.18, 0.4);
      const x = rand(W * 0.05, W * 0.95);
      phys.shard(x, H * 0.98, rand(-120, 120), -rand(900, 1700), pick(['rock', 'rock', 'glass']), rand(10, 22), { life: 9 });
    }
    // ---- look: horizon, Einstein ring, tilted accretion disk ----
    const Rh = s.R * s.k;
    if (s.lens) { s.lens.x = s.x; s.lens.y = s.y; s.lens.radius = Math.max(Rh * 0.9, 1); s.lens.strength = Rh > 2 ? 0.75 : 0; s.lens.horizon = Rh; s.lens.seed = 3; }
    s.rim.intensity = 0;
    overlay.setHole({ x: s.x, y: s.y, r: Rh, k: s.k });
    s.pulse = damp(s.pulse, 0, 4, dt);
    const spin = time * 1.9;
    for (let ring = 0; ring < 4; ring++) {
      const rr = Rh * (1.55 + ring * 0.55), N = 44 - ring * 4, heat = 1 - ring / 4.5;
      for (let i = 0; i < N; i++) {
        const a0 = spin * (1.3 - ring * 0.2) + (i / N) * TAU, a1 = a0 + TAU / N * 0.8;
        // doppler beaming: the side coming at us is brighter
        const beam = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(a0 + 0.4));
        const col = ring < 1 ? [1, 0.95, 0.85] : ring < 2 ? [1, 0.7, 0.9] : [0.75, 0.45, 1];
        const br = (0.55 + heat) * beam * s.k * (1 + s.pulse);
        const p0x = s.x + Math.cos(a0) * rr, p0y = s.y + Math.sin(a0) * rr * 0.26;
        const p1x = s.x + Math.cos(a1) * rr, p1y = s.y + Math.sin(a1) * rr * 0.26;
        lines.spawn(p0x, p0y, p1x, p1y, 5 - ring, col, br * 0.8, 0.04);
      }
    }
    // the far side of the disk, bent up and over the hole by gravity
    for (let i = 0; i < 26; i++) {
      const a0 = Math.PI + (i / 26) * Math.PI, a1 = Math.PI + ((i + 0.8) / 26) * Math.PI;
      const rr = Rh * 1.75;
      lines.spawn(s.x + Math.cos(a0) * rr, s.y + Math.sin(a0) * rr * 1.05, s.x + Math.cos(a1) * rr, s.y + Math.sin(a1) * rr * 1.05, 4, [1, 0.85, 0.9], 0.8 * s.k, 0.04);
    }
    Post.wantDim(0.4 * s.k);
    Post.wantZoom(0.025 * s.k, s.x, s.y);
    Post.aberrate(3 * s.k);
    Post.shake(dt * 0.4 * s.k);
    overlay.letterbox(0.4 * s.k);
    sfx.loop('drone', 0.7 * s.k);
    sfx.loop('hum', 0.4 * s.k);
    if (s.t > 11 || releasing) this.endSing(false);
    else if (s.thrown && s.t > 5) this.endSing(false);
    return true;
  }

  startSing(h) {
    const s = this.sing, { overlay, sfx, fx, phys } = this.ctx;
    const base = Math.min(window.innerWidth, window.innerHeight);
    s.on = true; s.t = 0; s.k = 0; s.thrown = false; s.eaten = 0; s.lost = 0; s.hold = 0; s.pulse = 0;
    s.x = h.cx; s.y = h.cy; s.vx = 0; s.vy = 0;
    s.well = phys.well(s.x, s.y, 4.6e7, base * 0.07);
    phys.onEat = (p, w) => {
      s.eaten++;
      s.pulse = Math.min(0.5, s.pulse + 0.02);
      if (s.eaten % 6 === 0) this.spark(s.x, s.y, rand(0, TAU), rand(200, 600), { life: 0.25, width: 2 });
    };
    overlay.callout('特異点', 'Singularity', { big: true, dur: 1.9 });
    sfx.play('singularity');
    Post.impact(0.1, CH.b);
    Post.flashScreen(0.3, CH.b);
    Post.freeze(0.08);
    Post.shake(0.9);
    Post.shockwave({ x: s.x, y: s.y, speed: 1500, width: 100, strength: 44, life: 0.8 });
    fx.ring({ x: s.x, y: s.y, r0: 20, r1: Math.hypot(window.innerWidth, window.innerHeight) * 0.7, dur: 0.7, width: 30, a: CH.a, b: CH.b, noise: 0.1, intensity: 2 });
    // the room's loose junk lifts off the floor
    for (let i = 0; i < 14; i++) phys.shard(rand(60, window.innerWidth - 60), window.innerHeight * 0.98, rand(-100, 100), -rand(700, 1600), pick(['rock', 'glass', 'rock']), rand(10, 24), { life: 9 });
    this.ctx.onMove(6);
  }

  endSing(silent) {
    const s = this.sing, { sfx, fx, phys, overlay } = this.ctx;
    if (!s.on) { s.rim.intensity = 0; return; }
    s.on = false; s.thrown = false; s.cool = 1.5; s.rim.intensity = 0;
    if (s.lens) s.lens.strength = 0;
    phys.onEat = null;
    if (s.well) {
      if (!silent) {
        // let go: everything still in orbit is ejected outward, and the hole pays back what it ate
        const power = 900 + Math.min(1400, s.eaten * 9);
        for (const p of phys.orbs) {
          const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1;
          p.vx = (dx / d) * power * rand(0.6, 1.3) + p.vx * 0.3; p.vy = (dy / d) * power * rand(0.6, 1.3) + p.vy * 0.3; p.life = p.age + 1.2;
        }
        phys.blast(s.x, s.y, 900, power * 2);
        for (let i = 0; i < 60 + Math.min(120, s.eaten); i++) this.spark(s.x, s.y, rand(0, TAU), rand(700, 2600), { life: rand(0.3, 0.8), width: rand(2, 4) });
        const diag = Math.hypot(window.innerWidth, window.innerHeight);
        Post.impact(0.12, CH.b);
        Post.flashScreen(0.6, CH.b);
        Post.freeze(0.1);
        Post.shake(1);
        Post.punch(2.2, s.x, s.y);
        Post.aberrate(16);
        Post.shockwave({ x: s.x, y: s.y, speed: 2000, width: 130, strength: 60, life: 1 });
        fx.ring({ x: s.x, y: s.y, r0: 20, r1: diag * 0.9, dur: 0.9, width: 40, a: CH.a, b: CH.b, noise: 0.1, intensity: 2.4 });
        fx.glow({ x: s.x, y: s.y, s0: 60, s1: diag * 0.6, dur: 0.4, a: CH.a, b: [1, 1, 1], intensity: 2 });
        overlay.sfxText('RELEASE', s.x, s.y - 120, 1.2, [255, 120, 230]);
        sfx.play('nova');
      }
      phys.dropWell(s.well);
      s.well = null;
    }
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
    arc(0.2, 10, 2, 0.3, 0.04);
    // the blade itself: a fat crescent of light swept through the frame
    {
      const mx0 = (ax + bx) / 2, my0 = (ay + by) / 2;
      for (const [grow, dly, col, thick] of [[1.25, 0, CH.a, 0.24], [1.7, 0.07, CH.b, 0.12]]) {
        const cxx = mx0 - nx * L * 0.55 * grow, cyy = my0 - ny * L * 0.55 * grow;
        const A = [mx0 + (ax - mx0) * grow, my0 + (ay - my0) * grow], B = [mx0 + (bx - mx0) * grow, my0 + (by - my0) * grow];
        const r = Math.hypot(A[0] - cxx, A[1] - cyy);
        const a0 = Math.atan2(A[1] - cyy, A[0] - cxx);
        let d = Math.atan2(B[1] - cyy, B[0] - cxx) - a0;
        while (d > Math.PI) d -= TAU;
        while (d <= -Math.PI) d += TAU;
        this.after(dly, () => overlay.slash(cxx, cyy, r, a0, a0 + d, col, { dur: 0.6, thick }));
      }
    }
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
      if (p > 0.6) Post.glitchFor(0.15);
      Post.wantDim(0.6 * p);
      Post.wantZoom(-0.02 + 0.06 * p, t.x, t.y);
      Post.afterimage(0.35 * p, -300 * (0.3 + p));
      Post.aberrate(2 + 4 * p);
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
        Post.flashScreen(0.45, CH.b);
        Post.freeze(0.12);
        Post.shake(1);
        Post.punch(2.4, t.x, t.y);
        Post.aberrate(18);
        Post.bloom(2.4);
        Post.shockwave({ x: t.x, y: t.y, speed: 2000, width: 130, strength: 60, life: 1.0 });
        fx.ring({ x: t.x, y: t.y, r0: 10, r1: diag * 0.85, dur: 0.9, width: 40, a: CH.a, b: CH.b, noise: 0.1, intensity: 2.4 });
        fx.ring({ x: t.x, y: t.y, r0: 10, r1: diag * 0.6, dur: 0.6, width: 20, a: CH.b, b: [1, 1, 1], intensity: 1.8 });
        fx.glow({ x: t.x, y: t.y, s0: 80, s1: diag * 0.6, dur: 0.4, a: CH.a, b: CH.b, intensity: 1.6 });
        overlay.sfxText('REWIND', t.x, t.y + base * 0.05, 1.1, [255, 120, 230]);
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
    setRing(t.rim, t.x, t.y, R0 * 1.05, R0 * 0.02 + 3, 0.9 * t.k, time, 0.05);
    t.sigil.target = t.k > 0.05 ? 1 : 0;
    t.sigil.charge = charge;
    t.sigil.update(dt, time, t.x, t.y, R0 * 1.6, -1.4 + t.ang * 0.3);
    t.sigil.outer.intensity *= 0.4; t.sigil.inner.intensity *= 0.4;
    // giant clock face with roman numerals; the hands spin backwards
    overlay.setClock({ x: t.x, y: t.y, r: clamp(R0 * 1.05, base * 0.2, base * 0.4), rot: t.ang * 0.15, hand: t.ang * 3.2, k: t.k, col: CH.a });
    if (t.phase === 'rewind') {
      // a second, bigger ghost clock turning the other way
      overlay.setClock({ x: t.x, y: t.y, r: base * 0.62, rot: -t.ang * 0.1, hand: -t.ang * 1.3, k: t.k * 0.35, col: CH.b });
    }
    if (t.phase === 'idle') t.ang += dt * 1.5;
    sfx.loop('charge', charge * 0.5);
    Post.wantAura(0.45 * t.k, CH.a, CH.b);
    overlay.letterbox(t.k * 0.7);
    levels[0] = Math.max(levels[0], 0.3 * t.k);
    levels[1] = Math.max(levels[1], 0.3 * t.k);
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
