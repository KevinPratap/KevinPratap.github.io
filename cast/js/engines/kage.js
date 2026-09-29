// Kage: a shadow ninja. Nothing fires from a single pose. You chain hand
// signs (fist, two fingers, point, open palm, clap) and the last sign
// unleashes the jutsu that chain spells. Longer chains hit harder.
import { CONFIG, CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad, Trail } from '../render/objects.js';
import { clamp, rand, pick, TAU, damp, lerp, easeOutCubic, easeInCubic } from '../util.js';

const CH = CHARACTERS.kage;
const JADE = [[0.15, 0.95, 0.6], [0.4, 1, 0.75], [0.8, 1, 0.92], [0.08, 0.72, 0.5]];
const SMOKE = [0.85, 1, 0.94];

const SIGNS = {
  fist: { k: '子', w: 'FIST' },
  two: { k: '寅', w: 'TWO FINGERS' },
  point: { k: '午', w: 'POINT' },
  open: { k: '辰', w: 'OPEN PALM' },
  clap: { k: '合', w: 'CLAP' },
};

// Longest first. No recipe is the ending of another, so a chain never
// fires the wrong jutsu halfway through a longer one.
const RECIPES = [
  { move: 4, seq: ['fist', 'two', 'point', 'open', 'clap'], fn: 'eclipse' },
  { move: 3, seq: ['fist', 'point', 'two', 'clap'], fn: 'bind' },
  { move: 0, seq: ['two', 'fist', 'clap'], fn: 'clones' },
  { move: 1, seq: ['open', 'fist', 'point'], fn: 'smoke' },
  { move: 2, seq: ['point', 'two', 'open'], fn: 'kunai' },
];

const HOLD = 0.2;       // seconds a sign must be held to count
const CHAIN_GAP = 2.6;  // seconds before a half-made chain is forgotten
const CLONE_X = [-0.36, 0.36, -0.7, 0.7];

const oneHand = (h) => (h.two ? 'two' : h.point ? 'point' : h.fist ? 'fist' : h.isOpen ? 'open' : null);

export class Kage {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    this.seq = [];
    this.cand = null; this.candT = 0; this.held = null;
    this.lastReg = -99; this.clearAt = 0;
    this.level = 0;
    this.timers = [];
    this.clone = { on: false, t: 0, life: 0, n: 0 };
    this.vanish = { t: 0, on: false };
    this.bindS = { on: false, t: 0, x: 0, y: 0, squeezed: false, tr: [] };
    for (let i = 0; i < 8; i++) {
      this.bindS.tr.push({
        trail: new Trail(S, { max: 40, width: 30, life: 1.0, fire: false, a: CH.a, b: [1, 1, 1] }),
        ex: 0, ey: 0, ph: 0, amp: 0, delay: 0,
      });
    }
    this.ecl = { on: false, t: 0, x: 0, y: 0, r: 0, lens: null, glow: new FXQuad(S, 'glow', { a: CH.a, b: CH.b, intensity: 0, param: [2.2, 0, 0, 0] }), rays: 0 };
    this.wisp = 0;
  }

  enter() {
    Post.clCol = [0.3, 1, 0.75];
    this.ecl.lens = Post.source('lens');
  }

  exit() {
    this.seq.length = 0;
    this.cand = null; this.candT = 0; this.held = null;
    this.timers.length = 0;
    this.clone.on = false;
    for (let i = 0; i < 4; i++) Post.clone(i, 0, 0, 0);
    Post.resetExtras();
    this.bindS.on = false;
    this.bindS.tr.forEach((t) => { t.trail.pts.length = 0; t.trail.update(0); });
    this.ecl.on = false;
    this.ecl.glow.intensity = 0;
    const i = Post.persistent.indexOf(this.ecl.lens);
    if (i >= 0) Post.persistent.splice(i, 1);
    this.ecl.lens = null;
  }

  after(t, fn) { this.timers.push({ t, fn }); }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: o.drag ?? 1.6, grav: o.grav ?? 0,
      life: o.life ?? rand(0.3, 0.6), c: pick(JADE), bright: o.bright ?? 2.1,
      width: o.width ?? rand(1.5, 3), stretch: o.stretch ?? 0.04, fade: 1.2, fn: o.fn,
    });
  }

  puff(x, y, n, spread = 1, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(30, 260) * spread;
      this.ctx.particles.spawn({
        x: x + rand(-30, 30) * spread, y: y + rand(-30, 30) * spread,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - rand(0, 60), drag: 1.6,
        life: rand(0.6, 1.3), c: SMOKE, bright: 0.24, size: rand(46, 90) * size, size1: rand(110, 190) * size, fade: 1.4,
      });
    }
    for (let i = 0; i < n * 0.5; i++) this.spark(x, y, rand(0, TAU), rand(200, 900) * spread, { life: rand(0.25, 0.6) });
  }

  center(hands) {
    const W = window.innerWidth, H = window.innerHeight;
    const hs = [hands.L, hands.R].filter((h) => h.present);
    if (!hs.length) return { x: W / 2, y: H * 0.5, sc: 90 };
    return { x: hs.reduce((a, h) => a + h.cx, 0) / hs.length, y: hs.reduce((a, h) => a + h.cy, 0) / hs.length, sc: hs[0].scale };
  }

  // ---------- sign recognition ----------
  classify(L, R) {
    if (L.present && R.present) {
      const sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      const pose = L.point || L.two || R.point || R.two;
      if (d < CONFIG.touchDist * 1.35 && !pose) return 'clap';
      const a = oneHand(L), b = oneHand(R);
      if (a === b) return a;
      if (a && !b) return a;
      if (b && !a) return b;
      return null;
    }
    const h = L.present ? L : R.present ? R : null;
    return h ? oneHand(h) : null;
  }

  register(sign, time, hands) {
    const { sfx, fx } = this.ctx;
    this.seq.push(sign);
    if (this.seq.length > 5) this.seq.shift();
    this.lastReg = time;
    this.level = 1.3;
    sfx.play('seal', this.seq.length);
    const hs = [hands.L, hands.R].filter((h) => h.present);
    const near = sign === 'clap' ? [this.center(hands)] : hs;
    for (const h of near) {
      const x = h.cx ?? h.x, y = h.cy ?? h.y, sc = h.scale ?? h.sc;
      fx.ring({ x, y, r0: sc * 0.4, r1: sc * 2.4, dur: 0.35, width: 8, a: CH.a, b: CH.b, intensity: 1.6 });
      fx.glow({ x, y, s0: sc, s1: sc * 3.4, dur: 0.22, a: CH.a, b: CH.b, intensity: 1.6 });
      for (let i = 0; i < 10; i++) this.spark(x, y, rand(0, TAU), rand(250, 650), { life: rand(0.2, 0.4), width: 2 });
    }
    Post.bloom(0.5);
    Post.aberrate(3 + this.seq.length * 1.4);
    for (const r of RECIPES) {
      if (this.seq.length < r.seq.length) continue;
      const tail = this.seq.slice(-r.seq.length);
      if (tail.every((s, i) => s === r.seq[i])) {
        this.cast(r, hands);
        this.after(0.5, () => { this.seq.length = 0; });
        return;
      }
    }
  }

  cast(r, hands) {
    this.ctx.sfx.play('ready');
    this[r.fn](this.center(hands), hands);
    this.ctx.onMove(r.move);
    this.level = 2;
  }

  // ---------- main update ----------
  update(dt, time, hands) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const L = hands.L, R = hands.R;
    const any = L.present || R.present;

    const sign = this.classify(L, R);
    if (sign !== this.cand) { this.cand = sign; this.candT = 0; if (sign !== this.held) this.held = null; } else if (sign) this.candT += dt;
    if (sign && this.candT >= HOLD && this.held !== sign && !(this.seq[this.seq.length - 1] === sign && time - this.lastReg < 1.0)) {
      this.held = sign;
      this.register(sign, time, hands);
    }
    if (this.seq.length && time - this.lastReg > CHAIN_GAP) this.seq.length = 0;

    if (any || this.seq.length) {
      this.ctx.overlay.setSigns({
        slots: 5,
        seq: this.seq.map((s) => SIGNS[s].k),
        pending: sign && this.held !== sign ? { k: SIGNS[sign].k, p: clamp(this.candT / HOLD, 0, 1) } : null,
        label: sign ? SIGNS[sign].w : '',
        y: 0.68,
      });
    }

    // shadow wisps curling off the fingertips
    this.wisp -= dt;
    for (const h of [L, R]) {
      if (h.present && this.wisp <= 0) {
        const p = h.pts[[4, 8, 12, 16, 20][(Math.random() * 5) | 0]];
        this.ctx.particles.spawn({
          x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-80, -20), drag: 1.4, life: rand(0.5, 0.9),
          c: pick(JADE), bright: 0.55, size: rand(5, 9), size1: 14, fade: 1.2, flicker: 0.2,
        });
      }
    }
    if (this.wisp <= 0) this.wisp = 0.06;

    this.updateClones(dt, time);
    this.updateBind(dt, time);
    this.updateEclipse(dt, time);
    this.level = damp(this.level, 0, 2.2, dt);

    if (this.seq.length >= 2) Post.wantEdge(0.05 * this.seq.length, CH.a);
    const lv = 0.32 + this.level * 0.5 + (this.clone.on ? 0.3 : 0) + (this.ecl.on ? 0.8 : 0);
    return [lv, lv];
  }

  // ---------- Shadow Clones ----------
  clones(c, hands) {
    const { overlay, sfx } = this.ctx;
    const W = window.innerWidth;
    this.clone.on = true; this.clone.t = 0; this.clone.life = 9; this.clone.n = 0; this.clone.popT = 0; this.clone.cx = c.x; this.clone.cy = c.y;
    overlay.callout('影分身', 'Shadow Clones', { big: true, dur: 1.5 });
    sfx.play('clone');
    sfx.play('poof');
    Post.flashScreen(0.25, CH.b);
    Post.shake(0.4);
    Post.aberrate(10);
    Post.glitchFor(0.5);
    // each clone bursts in with its own puff, a heartbeat apart
    for (let i = 0; i < 4; i++) {
      this.after(0.12 * i, () => {
        this.clone.n = i + 1;
        const x = c.x + CLONE_X[i] * W, y = c.y;
        this.puff(x, y, 10, 1.1, 0.6);
        this.ctx.overlay.smoke(x, y - 20, 16, 1.5, { spread: 1.4 });
        this.ctx.overlay.smoke(x, y + 120, 8, 1.2, { spread: 1.8 });
        if (i % 2 === 0) this.ctx.overlay.sfxText('POOF!', x, y - 160, 0.8, [80, 255, 180]);
        this.ctx.fx.glow({ x, y, s0: 60, s1: 300, dur: 0.25, a: CH.a, b: CH.b, intensity: 1.2 });
        this.ctx.fx.ring({ x, y, r0: 10, r1: 240, dur: 0.4, width: 14, a: CH.a, b: CH.b, intensity: 1.6 });
        Post.shockwave({ x, y, speed: 1000, width: 60, strength: 20, life: 0.5 });
        this.ctx.sfx.play('poof', 0.7);
      });
    }
  }

  updateClones(dt, time) {
    const cl = this.clone;
    if (!cl.on) {
      for (let i = 0; i < 4; i++) Post.clone(i, CLONE_X[i] * window.innerWidth, 0, 0);
      return;
    }
    cl.t += dt;
    const W = window.innerWidth;
    if (cl.t > cl.life - 0.6) {
      // dismissed clones pop one by one
      cl.popT = (cl.popT || 0) - dt;
      if (cl.popT <= 0 && cl.n > 0) {
        this.puff(cl.cx + CLONE_X[cl.n - 1] * W, cl.cy, 6, 1, 0.6);
        this.ctx.overlay.smoke(cl.cx + CLONE_X[cl.n - 1] * W, cl.cy, 14, 1.3, { spread: 1.3 });
        this.ctx.sfx.play('poof', 0.6);
        cl.n--;
        cl.popT = 0.14;
      }
      if (cl.n === 0) cl.on = false;
    }
    for (let i = 0; i < 4; i++) {
      Post.clone(i, CLONE_X[i] * W + Math.sin(time * 1.6 + i * 1.7) * 9, Math.sin(time * 2.1 + i) * 4, i < cl.n ? 1 : 0);
    }
    if (cl.n > 0) this.ctx.sfx.loop('hum', 0.25);
  }

  // ---------- Smoke Vanish ----------
  smoke(c) {
    const { overlay, sfx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    overlay.callout('煙遁', 'Smoke Vanish');
    sfx.play('poof', 1.4);
    Post.afterimage(0.9, (c.x < W / 2 ? 1 : -1) * 1300);
    Post.glitchFor(0.6);
    Post.freeze(0.05);
    Post.flashScreen(0.35, [0.9, 1, 0.95]);
    Post.shake(0.5);
    Post.aberrate(12);
    Post.punch(1.4, c.x, c.y);
    this.puff(c.x, c.y, 16, 1.4, 0.8);
    overlay.sfxText('BOOF!', c.x, c.y - Math.min(W, H) * 0.3, 1.2, [80, 255, 180]);
    // a wall of solid smoke swallows the frame while you slip away
    const ov = this.ctx.overlay, sz = Math.min(W, H) / 450;
    ov.smoke(c.x, c.y, 26, 2.2 * sz, { spread: 2.4, dur: 1.4 });
    for (let k = 0; k < 6; k++) {
      this.after(0.05 * k, () => {
        for (let i = 0; i < 6; i++) ov.smoke(rand(-40, W + 40), rand(H * 0.1, H * 1.05), 1, rand(2.2, 3.2) * sz, { spread: 0.6, dur: 1.5 });
      });
    }
    // reappear on the far side with a slash of light
    this.after(0.55, () => {
      const nx = c.x < W / 2 ? W * 0.78 : W * 0.22;
      for (let i = 0; i < 46; i++) {
        this.ctx.streaks.spawn({
          x: rand(0, W), y: rand(0, H), vx: (nx > c.x ? 1 : -1) * rand(2500, 5000), vy: 0,
          life: rand(0.12, 0.25), c: pick(JADE), bright: 2, width: rand(1, 3), stretch: 0.05, fade: 1,
        });
      }
      this.puff(nx, c.y, 12, 1.1, 0.7);
      this.ctx.overlay.smoke(nx, c.y, 14, 1.4, { spread: 1.5 });
      Post.flashScreen(0.2, CH.b);
      Post.glitchFor(0.4);
      Post.shockwave({ x: nx, y: c.y, speed: 1300, width: 70, strength: 26, life: 0.5 });
      this.ctx.fx.ring({ x: nx, y: c.y, r0: 20, r1: 340, dur: 0.45, width: 16, a: CH.a, b: CH.b, intensity: 1.8 });
      sfx.play('step');
    });
    this.after(0.05, () => { this.vanish.on = true; this.vanish.t = 0; });
  }

  // ---------- Kunai Storm ----------
  kunai(c, hands) {
    const { overlay, sfx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    overlay.callout('苦無', 'Kunai Storm');
    sfx.play('kunai');
    Post.shake(0.3);
    Post.bloom(1);
    const origins = [hands.L, hands.R].filter((h) => h.present).map((h) => ({ x: h.cx, y: h.cy }));
    if (!origins.length) origins.push({ x: c.x, y: c.y });
    const volley = (from, count, delay) => this.after(delay, () => {
      sfx.play('kunai');
      for (let i = 0; i < count; i++) {
        const o = pick(from);
        const a = (i / count) * TAU + rand(-0.15, 0.15);
        // targets sit on a loose ring around the middle of the screen
        const tr = base * rand(0.18, 0.46);
        const tx = W / 2 + Math.cos(a) * tr * 1.3, ty = H * 0.48 + Math.sin(a) * tr;
        this.throwKunai(o.x, o.y, tx, ty, i * 0.012);
      }
    });
    volley(origins, 10, 0);
    const edges = [];
    for (let i = 0; i < 6; i++) edges.push({ x: rand(0, W), y: i % 2 ? -30 : H + 30 });
    volley(edges, 10, 0.28);
    // three tagged kunai thunk in last... then all go off at once
    const bombs = [];
    this.after(0.62, () => {
      sfx.play('kunai');
      for (let i = 0; i < 3; i++) {
        const tx = W * (0.25 + i * 0.25) + rand(-30, 30), ty = H * rand(0.3, 0.55);
        const o = pick(origins);
        bombs.push({ x: tx, y: ty });
        this.ctx.overlay.kunai(o.x, o.y, tx, ty, 0.16 + i * 0.03, { tag: true, hold: 1.25, size: 1.5 });
      }
    });
    this.after(1.75, () => {
      for (const b of bombs) this.explode(b.x, b.y);
      overlay.sfxText('BOOM!', W / 2, H * 0.3, 1.5, [255, 150, 40]);
      Post.impact(0.1, [1, 0.8, 0.5]);
      Post.freeze(0.08);
      Post.shake(1);
      Post.flashScreen(0.4, [1, 0.85, 0.6]);
      Post.bloom(2);
      sfx.play('explode', 1.2);
    });
    Post.wantDim(0.3);
  }

  throwKunai(x0, y0, x1, y1, delay) {
    this.after(delay, () => {
      const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
      const sp = rand(2200, 3200), life = d / sp;
      this.ctx.overlay.kunai(x0, y0, x1, y1, life, { hold: rand(1.1, 1.8), size: rand(0.9, 1.25) });
      this.after(life, () => {
        this.ctx.fx.ring({ x: x1, y: y1, r0: 4, r1: 70, dur: 0.28, width: 6, a: CH.a, b: CH.b, intensity: 1.4 });
        this.ctx.fx.glow({ x: x1, y: y1, s0: 20, s1: 110, dur: 0.2, a: CH.a, b: [1, 1, 1], intensity: 2 });
        for (let i = 0; i < 7; i++) this.spark(x1, y1, rand(0, TAU), rand(150, 550), { life: rand(0.15, 0.35), width: 2 });
        Post.shake(0.04);
        Post.shockwave({ x: x1, y: y1, speed: 700, width: 30, strength: 8, life: 0.3 });
        if (Math.random() < 0.35) this.ctx.sfx.play('crack');
      });
    });
  }

  explode(x, y) {
    const { fx } = this.ctx;
    const FIRE = [[1, 0.55, 0.12], [1, 0.8, 0.3], [1, 0.35, 0.05]];
    fx.glow({ x, y, s0: 40, s1: 520, dur: 0.45, a: [1, 0.45, 0.1], b: [1, 0.95, 0.7], intensity: 2.6 });
    fx.ring({ x, y, r0: 20, r1: 420, dur: 0.5, width: 30, a: [1, 0.5, 0.1], b: [1, 0.9, 0.6], noise: 0.15, intensity: 2 });
    Post.shockwave({ x, y, speed: 1400, width: 90, strength: 40, life: 0.7 });
    for (let i = 0; i < 60; i++) {
      const a = rand(0, TAU), s = rand(300, 1500);
      this.ctx.streaks.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 1.8, grav: 500, life: rand(0.3, 0.8), c: pick(FIRE), bright: 2.2, width: rand(2, 4), stretch: 0.04, fade: 1.2 });
    }
    // dark smoke after the fireball
    this.after(0.12, () => this.ctx.overlay.smoke(x, y, 12, 1.5, { spread: 1.6, tint: [70, 66, 62], dur: 1.3 }));
  }

  // ---------- Shadow Binding ----------
  bind(c, hands) {
    const { overlay, sfx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    const b = this.bindS;
    b.on = true; b.t = 0; b.squeezed = false;
    b.x = clamp(c.x, W * 0.2, W * 0.8); b.y = clamp(c.y, H * 0.25, H * 0.75);
    b.tr.forEach((tr, i) => {
      const f = (i + 0.5) / b.tr.length;
      tr.ex = f < 0.5 ? lerp(-40, W * 0.45, f * 2) : lerp(W * 0.55, W + 40, (f - 0.5) * 2);
      tr.ey = H + 30 - (Math.abs(f - 0.5) > 0.35 ? rand(0, H * 0.35) : 0);
      tr.ph = rand(0, TAU); tr.amp = rand(90, 190) * (i % 2 ? 1 : -1); tr.delay = i * 0.03;
      tr.trail.width = 34;
    });
    overlay.callout('影縛', 'Shadow Binding', { big: true, dur: 1.6 });
    sfx.play('whoomp');
    Post.wantDim(0.4);
    Post.freeze(0.06);
    Post.glitchFor(0.4);
  }

  updateBind(dt, time) {
    const b = this.bindS;
    if (!b.on) return;
    b.t += dt;
    const { fx, sfx, overlay } = this.ctx;
    const TRAVEL = 0.6;
    const paths = [];
    const fadeK = clamp((2.2 - b.t) / 0.5, 0, 1);
    b.tr.forEach((tr, i) => {
      const s = clamp((b.t - tr.delay) / TRAVEL, 0, 1);
      const e = easeOutCubic(s);
      const nx = -(tr.ey - b.y), ny = tr.ex - b.x, nl = Math.hypot(nx, ny) || 1;
      const pts = [];
      const N = 34;
      for (let j = 0; j <= N; j++) {
        const f = (j / N) * e;
        const wob = Math.sin(f * 10 + tr.ph + time * 5) * tr.amp * 0.35 * Math.sin(Math.PI * Math.min(1, f / Math.max(e, 0.01)));
        pts.push([lerp(tr.ex, b.x, f) + (nx / nl) * wob, lerp(tr.ey, b.y, f) + (ny / nl) * wob]);
      }
      if (b.squeezed) {
        // the heads coil around the target and pull tight
        const sq = clamp((b.t - TRAVEL - 0.08) / 0.3, 0, 1);
        const R0 = 140 * (1 - sq * 0.75);
        for (let j = 1; j <= 14; j++) {
          const a = tr.ph + j * 0.42 + time * 3 * (i % 2 ? 1 : -1);
          const r = R0 * (1 - j / 20);
          pts.push([b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.8]);
        }
      }
      paths.push({ pts, w: 26, taper: 0.9 });
    });
    this.ctx.overlay.setInk({ paths, col: CH.a, a: fadeK, pool: { x: b.x, y: b.y, r: 160 * clamp(b.t / TRAVEL, 0, 1), flat: 0.8 } });
    if (b.t < TRAVEL) {
      Post.wantDim(0.4 + 0.3 * (b.t / TRAVEL));
      Post.wantZoom(0.04 * (b.t / TRAVEL), b.x, b.y);
    }
    if (!b.squeezed && b.t >= TRAVEL + 0.08) {
      b.squeezed = true;
      const diag = Math.hypot(window.innerWidth, window.innerHeight);
      fx.ring({ x: b.x, y: b.y, r0: diag * 0.4, r1: 10, dur: 0.3, width: 26, a: CH.a, b: CH.b, intensity: 2.2 });
      this.after(0.3, () => {
        Post.impact(0.1, CH.b);
        Post.flashScreen(0.55, CH.b);
        Post.freeze(0.1);
        Post.shake(0.9);
        Post.punch(2, b.x, b.y);
        Post.aberrate(14);
        Post.bloom(2);
        Post.shockwave({ x: b.x, y: b.y, speed: 1500, width: 90, strength: 44, life: 0.8 });
        fx.glow({ x: b.x, y: b.y, s0: 60, s1: diag * 0.7, dur: 0.45, a: CH.a, b: [1, 1, 1], intensity: 3 });
        fx.ring({ x: b.x, y: b.y, r0: 10, r1: diag * 0.6, dur: 0.6, width: 30, a: CH.a, b: CH.b, intensity: 2 });
        overlay.sfxText('影縛!', b.x, b.y - 200, 1.1, [80, 255, 180]);
        for (let i = 0; i < 140; i++) this.spark(b.x, b.y, rand(0, TAU), rand(500, 2000), { life: rand(0.3, 0.7), width: rand(2, 4) });
        sfx.play('collapse');
        sfx.play('explode', 0.7);
      });
    }
    if (b.t > 2.2) b.on = false;
    overlay.letterbox(clamp(1.4 - b.t, 0, 1));
  }

  // ---------- Grand Eclipse ----------
  eclipse(c, hands) {
    const { overlay, sfx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    const e = this.ecl;
    e.on = true; e.t = 0; e.x = W / 2; e.y = H * 0.36; e.r = base * 0.23; e.rays = 0; e.total = false;
    overlay.callout('影蝕', 'Grand Eclipse', { big: true, dur: 2.2 });
    sfx.play('awaken');
    Post.freeze(0.08);
    // the whole squad joins the eclipse
    this.clone.on = true; this.clone.t = 0; this.clone.life = 5.2; this.clone.n = 4; this.clone.popT = 0; this.clone.cx = c.x; this.clone.cy = c.y;
    for (let i = 0; i < 4; i++) this.puff(c.x + CLONE_X[i] * W, c.y, 16, 1);
  }

  updateEclipse(dt, time) {
    const e = this.ecl;
    if (!e.on) {
      if (e.lens) e.lens.strength = 0;
      e.glow.intensity = 0;
      return;
    }
    e.t += dt;
    const { fx, sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    const RISE = 1.2, HOLDT = 3.4, END = 4.4;
    const rise = easeOutCubic(clamp(e.t / RISE, 0, 1));
    const fall = clamp((END - e.t) / (END - HOLDT), 0, 1);
    const vis = rise * (e.t > HOLDT ? fall : 1);
    const R = e.r * vis;
    if (e.lens) {
      e.lens.x = e.x; e.lens.y = e.y; e.lens.radius = Math.max(R * 0.35, 1); e.lens.strength = R > 2 ? 0.5 : 0; e.lens.horizon = R; e.lens.seed = 0;
    }
    const total = e.t > RISE;
    e.glow.set(e.x, e.y, R * (total ? 6 : 4) + 10);
    e.glow.param(2.2, 0, 0, 0);
    e.glow.intensity = (0.3 + (total ? 0.9 : rise * 0.4) + Math.sin(time * 9) * 0.05) * vis;
    e.glow.tick(time);
    Post.wantDim(0.85 * vis);
    Post.wantEdge(0.7 * vis, CH.a);
    if (total) Post.wantAura(1.1 * fall, CH.a, CH.b);
    Post.wantZoom(0.05 * vis, e.x, e.y);
    Post.shake(dt * 0.6 * vis);
    overlay.letterbox(vis);
    sfx.loop('drone', 0.8 * vis);
    sfx.loop('hum', 0.5 * vis);
    if (!e.total && e.t >= RISE) {
      e.total = true;
      Post.impact(0.14, CH.b);
      Post.flashScreen(0.7, CH.b);
      Post.shake(1);
      Post.freeze(0.12);
      Post.punch(2.4, e.x, e.y);
      Post.aberrate(16);
      Post.bloom(2.4);
      Post.glitchFor(0.8);
      Post.shockwave({ x: e.x, y: e.y, speed: 1800, width: 120, strength: 56, life: 1.0 });
      fx.ring({ x: e.x, y: e.y, r0: R, r1: diag * 0.8, dur: 0.9, width: 40, a: CH.a, b: CH.b, noise: 0.12, intensity: 2.4 });
      fx.glow({ x: e.x, y: e.y, s0: R, s1: diag, dur: 0.6, a: CH.a, b: [1, 1, 1], intensity: 3 });
      for (let i = 0; i < 200; i++) this.spark(e.x, e.y, rand(0, TAU), rand(700, 2600), { life: rand(0.4, 0.9), width: rand(2, 4) });
      sfx.play('nova');
    }
    // shadow floods the floor and reaches up the walls
    {
      const paths = [];
      for (let i = 0; i < 10; i++) {
        const x0 = (i + 0.5) / 10 * W, h = H * (0.35 + 0.35 * Math.abs(Math.sin(i * 2.3))) * rise;
        const pts = [];
        for (let j = 0; j <= 16; j++) {
          const f = j / 16;
          pts.push([x0 + Math.sin(f * 6 + time * 2.4 + i) * 30 * f, H + 20 - h * f]);
        }
        paths.push({ pts, w: 34, taper: 0.95 });
      }
      overlay.setInk({ paths, col: CH.a, a: vis, pool: { x: W / 2, y: H * 1.02, r: W * 0.75 * rise, flat: 0.4 } });
    }
    // corona rays spinning off the moon
    if (vis > 0.2) {
      const n = Math.floor((total ? 150 : 50) * vis * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU) + time * 0.6;
        this.spark(e.x + Math.cos(a) * R, e.y + Math.sin(a) * R, a, rand(500, 1300), { life: rand(0.3, 0.7), width: rand(1.5, 3.5), drag: 0.6, stretch: 0.07 });
      }
    }
    if (e.t >= END) { e.on = false; this.clone.life = Math.min(this.clone.life, this.clone.t + 0.6); }
  }
}
