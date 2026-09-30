// Kage: a ninja whose jutsu come from the real seals.
//  - Shadow Clone: the cross seal (two fingers up on each hand, crossed).
//    Copies of you burst out of smoke beside you and mirror everything,
//    including your jutsu.
//  - Rasengan: hold one hand over the other. A spiralling sphere forms
//    between your palms; thrust or swing that hand to drive it.
//  - Chidori: grab your own wrist. Lightning screams in that hand; lunge
//    with it to pierce the screen.
//  - Fire Style, Great Fireball: the tiger seal (both hands, index and
//    middle fingers up together). You breathe out a fireball that swallows
//    the room.
import { CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad, bolt } from '../render/objects.js';
import { Seals, Hold } from '../signs.js';
import { clamp, rand, pick, TAU, damp, lerp, easeOutCubic } from '../util.js';

const CH = CHARACTERS.kage;
const CHAKRA = [0.2, 0.62, 1.0], CHAKRA_B = [0.82, 0.95, 1.0];
const VOLT = [[0.7, 0.85, 1], [0.9, 0.96, 1], [0.5, 0.72, 1]];
const MOVE = { clones: 0, rasengan: 1, chidori: 2, fireball: 3 };
const CLONE_S = [0.9, 0.9, 0.7, 0.7];
const SEAL_NAME = { clone: 'CLONE SEAL', tiger: 'TIGER SEAL', stack: 'RASENGAN', grab: 'CHIDORI', clap: '' };

function release(src) {
  const i = Post.persistent.indexOf(src);
  if (i >= 0) Post.persistent.splice(i, 1);
}

export class Kage {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    this.seals = new Seals();
    this.holds = { clone: new Hold(0.25), tiger: new Hold(0.4), stack: new Hold(0.2), grab: new Hold(0.25) };
    this.clone = { on: false, n: 0, t: 0, life: 0, ax: 0, off: [0, 0, 0, 0], cool: 0 };
    const orb = (a, b) => new FXQuad(S, 'rasengan', { a, b, intensity: 0 });
    this.ras = {
      ph: 'none', k: 0, x: 0, y: 0, slot: null, t: 0, vx: 0, vy: 0, R: 0, grow: 0, giant: false,
      orb: orb(CHAKRA, CHAKRA_B), glow: new FXQuad(S, 'glow', { a: CHAKRA, b: CHAKRA_B, intensity: 0, param: [3, 0, 0, 0] }),
      copies: [0, 1, 2, 3].map(() => orb(CHAKRA, CHAKRA_B)), swirl: null,
    };
    this.chi = {
      ph: 'none', k: 0, slot: null, t: 0, x0: 0, y0: 0, path: [], ready: 0,
      ball: new FXQuad(S, 'plasma', { a: CHAKRA, b: CHAKRA_B, intensity: 0 }),
      copies: [0, 1, 2, 3].map(() => new FXQuad(S, 'plasma', { a: CHAKRA, b: CHAKRA_B, intensity: 0 })),
    };
    this.fire = {
      ph: 'none', t: 0, x: 0, y: 0, mx: 0, my: 0, R: 0,
      orbs: [0, 1, 2].map(() => new FXQuad(S, 'fireOrb', { a: [1, 0.4, 0.1], b: [1, 0.85, 0.4], intensity: 0 })),
      heat: null,
    };
    this.timers = [];
  }

  enter() {
    Post.clCol = [0.35, 0.75, 1];
    this.ras.swirl = Post.source('swirl');
    this.fire.heat = Post.source('heat');
  }

  exit() {
    this.clone.on = false;
    for (let i = 0; i < 4; i++) Post.clone(i, 0, 0, 0);
    Post.resetExtras();
    const r = this.ras;
    r.ph = 'none'; r.k = 0; r.orb.intensity = 0; r.glow.intensity = 0; r.copies.forEach((q) => { q.intensity = 0; });
    release(r.swirl); r.swirl = null;
    const c = this.chi;
    c.ph = 'none'; c.k = 0; c.ball.intensity = 0; c.copies.forEach((q) => { q.intensity = 0; });
    const f = this.fire;
    f.ph = 'none'; f.orbs.forEach((q) => { q.intensity = 0; });
    release(f.heat); f.heat = null;
    this.timers.length = 0;
  }

  after(t, fn) { this.timers.push({ t, fn }); }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: o.drag ?? 1.8, grav: o.grav ?? 0,
      life: o.life ?? rand(0.25, 0.55), c: o.c || pick(VOLT), bright: o.bright ?? 2.2,
      width: o.width ?? rand(1.5, 3), stretch: o.stretch ?? 0.04, fade: 1.2,
    });
  }

  // The tracker can swap hand slots when hands overlap, so jutsu held in a
  // hand follow whichever hand is nearest to them rather than a slot.
  nearest(hands, x, y) {
    let best = null, bd = Infinity;
    for (const h of [hands.L, hands.R]) {
      if (!h.present) continue;
      const d = Math.hypot(h.cx - x, h.cy - y) / h.scale;
      if (d < bd && d < 4) { bd = d; best = h; }
    }
    return best;
  }

  get body() { const I = this.ctx.phys.body?.info; return I && I.ok ? I : null; }

  // ---------- clone formation ----------
  // Screen transform for clone i: an effect at (x, y) on you shows up at
  // the matching spot on that clone.
  cloneXf(i, x, y) {
    const H = window.innerHeight, A = this.clone.ax, s = CLONE_S[i];
    return { x: A + this.clone.off[i] + (x - A) * s, y: H + (y - H) * s, s };
  }

  layout() {
    // spread the clones clear of your own silhouette so they actually show
    const W = window.innerWidth, I = this.body;
    const ax = I ? I.cx : W / 2;
    const bw = I ? Math.max(I.w, W * 0.28) : W * 0.34;
    const near = Math.max(W * 0.27, bw * 0.95), far = near * 1.7;
    const want = [-near, near, -far, far];
    this.clone.ax = ax;
    Post.clAnchor = ax;
    for (let i = 0; i < 4; i++) {
      let cx = ax + want[i];
      // off-screen: flip to the other side, pushed further out
      if (cx < W * 0.08 || cx > W * 0.92) cx = ax - want[i] * (i < 2 ? 1.7 : 0.6);
      this.clone.off[i] = clamp(cx, W * 0.1, W * 0.9) - ax;
    }
  }

  castClones() {
    const { overlay, sfx } = this.ctx;
    const cl = this.clone;
    if (cl.on) {
      // the seal again dismisses them
      cl.life = Math.min(cl.life, cl.t + 0.01);
      return;
    }
    this.layout();
    cl.on = true; cl.t = 0; cl.life = 16; cl.n = 0;
    overlay.callout('影分身の術', 'Shadow Clone Jutsu', { big: true, dur: 1.6 });
    sfx.play('seal', 3);
    const H = window.innerHeight;
    for (let i = 0; i < 4; i++) {
      this.after(0.1 + i * 0.13, () => {
        if (!cl.on) return;
        cl.n = i + 1;
        const p = this.cloneXf(i, cl.ax, H * 0.55);
        overlay.smoke(p.x, p.y, 14, 1.2 * CLONE_S[i], { spread: 1.4 });
        overlay.sfxText('POOF!', p.x, p.y - H * 0.18 * CLONE_S[i], 0.9 * CLONE_S[i], [255, 255, 255]);
        sfx.play('poof');
        Post.shake(0.1);
      });
    }
    this.ctx.onMove(MOVE.clones);
  }

  updateClones(dt, time) {
    const cl = this.clone, H = window.innerHeight;
    cl.cool -= dt;
    if (!cl.on) { for (let i = 0; i < 4; i++) Post.clone(i, cl.off[i], 0, 0, CLONE_S[i]); return; }
    cl.t += dt;
    if (cl.t > cl.life) {
      // they pop one at a time
      if (cl.n > 0) {
        const i = cl.n - 1;
        const p = this.cloneXf(i, cl.ax, H * 0.55);
        this.ctx.overlay.smoke(p.x, p.y, 10, 1.1 * CLONE_S[i], { spread: 1.2 });
        this.ctx.sfx.play('poof');
        cl.n--;
        cl.t = cl.life - 0.1;
      } else cl.on = false;
    }
    for (let i = 0; i < 4; i++) Post.clone(i, cl.off[i] + Math.sin(time * 1.4 + i * 1.9) * 6, 0, i < cl.n ? 1 : 0, CLONE_S[i]);
  }

  // ---------- Rasengan ----------
  updateRasengan(dt, time, hands, seal) {
    const r = this.ras;
    const { sfx, overlay, particles, fx, phys } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    const cn = this.clone.on ? this.clone.n : 0;
    r.t += dt;
    if (seal && seal.sign === 'stack' && (r.ph === 'none' || r.ph === 'form')) {
      const top = seal.top, bot = seal.bot;
      if (r.ph === 'none') { r.ph = 'form'; r.k = 0; r.t = 0; sfx.play('rasengan'); r.giant = cn >= 2; }
      r.slot = bot.slot;
      // the swirling hand spins it up faster
      const spin = clamp(top.speed / 3, 0, 1);
      r.k = Math.min(1, r.k + dt * (0.75 + spin * 0.8));
      r.x = lerp(bot.cx, top.cx, 0.4); r.y = lerp(bot.cy, top.cy, 0.4);
      r.R = seal.sc * (0.35 + r.k * 0.35) * (r.giant ? 1.5 : 1);
      // chakra being gathered in from all around
      if (Math.random() < 0.8) {
        const a = rand(0, TAU), d = r.R * rand(2.2, 4);
        particles.spawn({ x: r.x + Math.cos(a) * d, y: r.y + Math.sin(a) * d, vx: -Math.cos(a + 0.9) * d * 3, vy: -Math.sin(a + 0.9) * d * 3, drag: 3, life: 0.35, c: CHAKRA_B, bright: 1.2, size: 5, size1: 2, fade: 1 });
      }
      overlay.chip(r.x, r.y + r.R * 1.9, r.k < 1 ? 'RASENGAN' : 'RASENGAN — STRIKE!', r.k);
      if (r.k >= 1 && !r.readyCalled) {
        r.readyCalled = true;
        overlay.callout(r.giant ? '大玉螺旋丸' : '螺旋丸', r.giant ? 'Giant Rasengan' : 'Rasengan', { big: true, dur: 1.4 });
        sfx.play('ready');
        this.ctx.onMove(MOVE.rasengan);
      }
    } else if (r.ph === 'form') {
      // seal broken: keep it in the lower hand if it's formed enough
      if (r.k >= 0.4) { r.ph = 'held'; r.t = 0; if (!r.readyCalled) { r.readyCalled = true; overlay.callout('螺旋丸', 'Rasengan', { big: true, dur: 1.2 }); this.ctx.onMove(MOVE.rasengan); } }
      else r.ph = 'fade';
    }
    if (r.ph === 'held') {
      const h = this.nearest(hands, r.x, r.y) || hands[r.slot];
      if (h.present) r.slot = h.slot;
      if (!h.present) { r.lost = (r.lost || 0) + dt; if (r.lost > 0.6) r.ph = 'fade'; }
      else {
        r.lost = 0;
        r.x = damp(r.x, h.cx - h.ux * h.scale * 0.15, 30, dt); r.y = damp(r.y, h.cy - h.uy * h.scale * 0.15 - h.scale * 0.2, 30, dt);
        overlay.chip(h.cx, h.cy + h.scale * 1.9, 'THRUST TO STRIKE', 1);
        if (h.thrust || h.flick || h.speed > 7.5) {
          r.ph = 'drive'; r.t = 0;
          const v = h.dir();
          r.vx = h.thrust ? (W / 2 - r.x) * 1.2 : v.x * 1700; r.vy = h.thrust ? (H / 2 - r.y) * 1.2 : v.y * 1700;
          r.thrust = h.thrust;
          sfx.play('throw'); sfx.play('rasengan');
          overlay.speedLines(1, r.x, r.y);
          Post.punch(1, r.x, r.y);
        }
      }
      if (r.t > 7) r.ph = 'fade';
    }
    if (r.ph === 'drive') {
      // it grinds forward, swelling, tearing up everything it touches
      r.x += r.vx * dt; r.y += r.vy * dt; r.vx *= Math.exp(-dt * 2.5); r.vy *= Math.exp(-dt * 2.5);
      r.R = Math.min(r.R * Math.exp(dt * (r.thrust ? 2.2 : 1.1)), base * 0.3);
      Post.shake(dt * 2); Post.aberrate(6);
      phys.blast(r.x, r.y, r.R * 2.5, 900 * dt * 60);
      for (let i = 0; i < 6; i++) this.spark(r.x + rand(-r.R, r.R) * 0.8, r.y + rand(-r.R, r.R) * 0.8, rand(0, TAU), rand(400, 1200), { c: pick([CHAKRA_B, [1, 1, 1]]) });
      if (Math.random() < 0.3) phys.burst(r.x, r.y, 2, 'rock', { speed: 900, size: 10 });
      if (r.t > 0.4 || r.x < 0 || r.x > W || r.y < 0 || r.y > H) this.rasenBoom(r);
    }
    if (r.ph === 'boom') {
      const k = clamp(r.t / 0.9, 0, 1);
      r.R = lerp(r.R0, r.R1, easeOutCubic(k));
      if (k >= 1) r.ph = 'fade';
    }
    if (r.ph === 'fade') { r.k = Math.max(0, r.k - dt * 3); if (r.k <= 0) { r.ph = 'none'; r.readyCalled = false; } }

    // draw
    const on = r.ph === 'form' || r.ph === 'held' || r.ph === 'drive' || r.ph === 'boom' || (r.ph === 'fade' && r.k > 0);
    const show = on ? (r.ph === 'fade' ? r.k : r.ph === 'boom' ? 1 - clamp(r.t / 0.9, 0, 1) * 0.9 : Math.min(1, 0.4 + r.k)) : 0;
    // the quad is 2 / 0.34 sphere radii wide; the glow hugs the ball
    const size = r.R / 0.34;
    r.orb.set(r.x, r.y, size * 2); r.orb.param(0.4 + r.k * 0.6, r.ph === 'drive' || r.ph === 'boom' ? 1 : 0, 0, 0); r.orb.intensity = show * 1.0; r.orb.tick(time);
    r.glow.set(r.x, r.y, r.R * 5); r.glow.intensity = show * 0.45; r.glow.tick(time);
    if (r.swirl) { r.swirl.x = r.x; r.swirl.y = r.y; r.swirl.radius = r.R * 3.2; r.swirl.strength = show * (r.ph === 'drive' || r.ph === 'boom' ? 2.2 : 0.9); }
    for (let i = 0; i < 4; i++) {
      const q = r.copies[i];
      if (i < cn && on && r.ph !== 'boom') {
        const p = this.cloneXf(i, r.x, r.y);
        q.set(p.x, p.y, size * 2 * p.s); q.param(0.4 + r.k * 0.6, 0, 0, 0); q.intensity = show * 0.6; q.tick(time + i);
      } else q.intensity = 0;
    }
    if (on) sfx.loop('spin', clamp(0.3 + r.k * 0.7, 0, 1) * show);
    return on ? 0.6 + r.k * 0.5 : 0;
  }

  rasenBoom(r) {
    const { fx, sfx, overlay, phys } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H), base = Math.min(W, H);
    r.ph = 'boom'; r.t = 0;
    r.x = clamp(r.x, 0, W); r.y = clamp(r.y, 0, H);
    r.R0 = r.R; r.R1 = Math.min(base * 0.45, r.R * (r.giant ? 3.2 : 2.6));
    const p = this.ctx.voice.power * (r.giant ? 1.4 : 1);
    Post.freeze(0.12); Post.impact(0.12, CHAKRA_B); Post.flashScreen(0.6, CHAKRA_B);
    Post.shake(0.9); Post.punch(2 * p, r.x, r.y); Post.aberrate(16); Post.bloom(2.5);
    Post.shockwave({ x: r.x, y: r.y, speed: 1500, width: 120, strength: 46 * p, life: 1.0 });
    Post.shockwave({ x: r.x, y: r.y, speed: 800, width: 70, strength: 26 * p, life: 1.1 });
    fx.ring({ x: r.x, y: r.y, r0: r.R, r1: diag * 0.55 * p, dur: 0.8, width: 60, a: CHAKRA, b: CHAKRA_B, noise: 0.3, intensity: 2 });
    fx.glow({ x: r.x, y: r.y, s0: r.R, s1: diag * 0.7, dur: 0.7, a: CHAKRA, b: [1, 1, 1], intensity: 4 });
    for (let i = 0; i < 160 * p; i++) this.spark(r.x, r.y, rand(0, TAU), rand(600, 2400), { c: pick([CHAKRA_B, [1, 1, 1], CHAKRA]), life: rand(0.4, 0.9) });
    phys.blast(r.x, r.y, diag * 0.6, 3400 * p);
    phys.burst(r.x, r.y, 26, 'rock', { speed: 1500, size: 14, up: 500, kinds: ['rock', 'wood', 'glass'] });
    overlay.crack(r.x, r.y, 1.2 * p);
    overlay.sfxText('DOOOM!', r.x, r.y - r.R * 1.6, 1.5, [200, 230, 255]);
    sfx.play('nova');
  }

  // ---------- Chidori ----------
  updateChidori(dt, time, hands, seal) {
    const c = this.chi;
    const { sfx, overlay, lines, particles, fx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    const cn = this.clone.on ? this.clone.n : 0;
    c.t += dt;
    if (seal && seal.sign === 'grab' && c.ph === 'charge' && c.k > 0.5) {
      const hh = seal.held;
      if (hh.thrust || hh.flick || hh.speed > 7) { c.ph = 'ready'; c.ready = 5; overlay.callout('千鳥', 'Chidori', { big: true, dur: 1.2 }); this.ctx.onMove(MOVE.chidori); }
    }
    if (seal && seal.sign === 'grab' && (c.ph === 'none' || c.ph === 'charge' || (c.ph === 'ready' && seal.held.speed < 4))) {
      if (c.ph === 'none') { c.ph = 'charge'; c.k = 0; sfx.play('chidori'); }
      c.slot = seal.held.slot;
      c.k = Math.min(1, c.k + dt / 0.9);
      if (c.k >= 1 && c.ph === 'charge') {
        c.ph = 'ready'; c.ready = 5;
        overlay.callout('千鳥', 'Chidori', { big: true, dur: 1.4 });
        this.ctx.onMove(MOVE.chidori);
      }
    } else if (c.ph === 'charge') {
      c.ph = c.k > 0.5 ? 'ready' : 'none';
      c.ready = 5;
      if (c.ph === 'ready') { overlay.callout('千鳥', 'Chidori', { big: true, dur: 1.2 }); this.ctx.onMove(MOVE.chidori); }
    }
    if (seal && seal.sign === 'grab') { c.x = seal.held.cx; c.y = seal.held.cy; }
    let h = c.slot ? hands[c.slot] : null;
    if (c.ph !== 'none' && c.x !== undefined) {
      const n = this.nearest(hands, c.x, c.y);
      if (n) { h = n; c.slot = n.slot; }
    }
    if (h && h.present && c.ph !== 'dash') { c.x = h.cx; c.y = h.cy; }
    if (c.ph === 'ready' && h) {
      c.ready -= dt;
      if (h.present) overlay.chip(h.cx, h.cy + h.scale * 1.9, 'LUNGE!', 1);
      if (c.ready <= 0) c.ph = 'none';
      else if (h.present && (h.thrust || h.flick || h.speed > 7)) {
        c.ph = 'dash'; c.t = 0; c.x0 = h.cx; c.y0 = h.cy; c.path = [[h.cx, h.cy]];
        sfx.play('thunder');
        overlay.speedLines(1, h.cx, h.cy);
        Post.afterimage(0.6, 1400);
      }
    }
    if (c.ph === 'dash' && h) {
      if (h.present) c.path.push([h.cx, h.cy]);
      // lightning spear along the lunge
      for (let i = 1; i < c.path.length; i++) {
        const [ax, ay] = c.path[i - 1], [bx, by] = c.path[i];
        lines.spawn(ax, ay, bx, by, base * 0.05, CHAKRA, 0.9, 0.35);
        lines.spawn(ax, ay, bx, by, base * 0.016, [1, 1, 1], 2.2, 0.35);
      }
      if (c.t > 0.22) {
        const [ex, ey] = c.path[c.path.length - 1];
        // punch through: the screen splits where the Chidori lands
        Post.freeze(0.14); Post.impact(0.14, CHAKRA_B); Post.flashScreen(0.7, [0.8, 0.9, 1]);
        Post.shake(0.8); Post.punch(1.8, ex, ey); Post.aberrate(18);
        Post.shockwave({ x: ex, y: ey, speed: 1400, width: 90, strength: 36, life: 0.8 });
        Post.tear({ x0: c.x0, y0: c.y0, x1: ex + (ex - c.x0) * 0.6, y1: ey + (ey - c.y0) * 0.6, strength: 30, life: 1.2, width: 14 });
        for (let i = 0; i < 14; i++) bolt(lines, ex, ey, ex + rand(-1, 1) * base * 0.6, ey + rand(-1, 1) * base * 0.6, { c: pick(VOLT), width: rand(3, 7), life: 0.18, branch: 0.7 });
        fx.glow({ x: ex, y: ey, s0: base * 0.1, s1: base * 1.1, dur: 0.5, a: CHAKRA, b: [1, 1, 1], intensity: 4 });
        this.ctx.overlay.crack(ex, ey, 1.3);
        this.ctx.phys.blast(ex, ey, base * 0.8, 2800);
        this.ctx.phys.burst(ex, ey, 16, 'glass', { speed: 1300, size: 12, kinds: ['glass', 'rock'] });
        overlay.sfxText('CHIDORI!', ex, ey - base * 0.12, 1.3, [210, 235, 255]);
        sfx.play('nova');
        c.ph = 'after'; c.t = 0;
      }
    }
    if (c.ph === 'after' && c.t > 0.8) c.ph = 'none';

    // crackling hand
    const live = (c.ph === 'charge' || c.ph === 'ready' || c.ph === 'dash') && h && h.present;
    const k = live ? (c.ph === 'charge' ? 0.3 + c.k * 0.7 : 1) : 0;
    c.ball.intensity = damp(c.ball.intensity, k * 0.75, 12, dt);
    if (h && h.present) { c.ball.set(h.cx, h.cy, h.scale * 2.6); c.ball.param(k * 0.5, 0, 0, 0); }
    c.ball.tick(time);
    if (live) {
      const sc = h.scale;
      const n = 3 + ((k * 6) | 0);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = sc * rand(1.2, 3.2) * (0.5 + k);
        bolt(lines, h.cx, h.cy, h.cx + Math.cos(a) * d, h.cy + Math.sin(a) * d, { c: pick(VOLT), width: rand(1.5, 3.5), life: 0.05, jag: 0.35, depth: 4, branch: 0.4 });
      }
      // arcs rake the floor under the hand
      if (Math.random() < 0.25 * k) bolt(lines, h.cx, h.cy, h.cx + rand(-1, 1) * sc * 3, H * 0.99, { c: pick(VOLT), width: 2.5, life: 0.06, jag: 0.3 });
      for (let i = 0; i < 3; i++) this.spark(h.cx, h.cy, rand(0, TAU), rand(200, 700) * k, { life: 0.2 });
      sfx.loop('chirp', 0.5 + k * 0.5); sfx.loop('buzz', 0.4 * k);
      Post.wantEdge(0.12 * k, CHAKRA);
      // the clones hold Chidori too
      for (let i = 0; i < cn; i++) {
        const p = this.cloneXf(i, h.cx, h.cy);
        if (Math.random() < 0.6) bolt(lines, p.x, p.y, p.x + rand(-1, 1) * sc * 2 * p.s, p.y + rand(-1, 1) * sc * 2 * p.s, { c: pick(VOLT), width: 2, life: 0.05, depth: 4 });
      }
    }
    for (let i = 0; i < 4; i++) {
      const q = c.copies[i];
      if (live && i < cn) { const p = this.cloneXf(i, h.cx, h.cy); q.set(p.x, p.y, h.scale * 2.6 * p.s); q.param(k * 0.5, 0, 0, 0); q.intensity = k * 0.6; q.tick(time + i); }
      else q.intensity = 0;
    }
    return live ? 0.6 + k * 0.6 : 0;
  }

  // ---------- Great Fireball ----------
  mouth(seal) {
    const I = this.body;
    const H = window.innerHeight;
    if (I) return { x: I.hx, y: I.hy + H * 0.06 };
    return { x: seal ? seal.x : window.innerWidth / 2, y: (seal ? seal.y : H * 0.5) - (seal ? seal.sc * 2.2 : 0) };
  }

  startFireball(seal) {
    const f = this.fire;
    const m = this.mouth(seal);
    f.ph = 'inhale'; f.t = 0; f.mx = m.x; f.my = m.y; f.x = m.x; f.y = m.y; f.R = 0;
    this.ctx.overlay.callout('火遁・豪火球の術', 'Fire Style: Great Fireball', { big: true, dur: 1.8 });
    this.ctx.sfx.play('charge');
    this.ctx.onMove(MOVE.fireball);
  }

  updateFireball(dt, time) {
    const f = this.fire;
    const { sfx, particles, phys, overlay, fx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H), diag = Math.hypot(W, H);
    f.t += dt;
    const cn = this.clone.on ? this.clone.n : 0;
    if (f.ph === 'inhale') {
      // air and embers get sucked into your mouth
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU), d = base * rand(0.2, 0.4);
        particles.spawn({ x: f.mx + Math.cos(a) * d, y: f.my + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.6, vy: -Math.sin(a) * d * 2.6, drag: 2, life: 0.35, c: [1, 0.6, 0.2], bright: 1.3, size: 4, size1: 1, fade: 1 });
      }
      sfx.loop('charge', f.t / 0.55);
      if (f.t > 0.55) {
        f.ph = 'blow'; f.t = 0;
        sfx.play('fireball');
        Post.flashScreen(0.2, [1, 0.6, 0.2]); Post.punch(1.2, f.mx, f.my);
      }
    }
    if (f.ph === 'blow') {
      // a roiling sphere pours out of your mouth and swells toward the lens
      const k = clamp(f.t / 1.6, 0, 1);
      const tx = W / 2 + (f.mx - W / 2) * 0.35, ty = H * 0.46;
      f.x = lerp(f.mx, tx, easeOutCubic(k)); f.y = lerp(f.my, ty, easeOutCubic(k));
      f.R = base * (0.05 + easeOutCubic(k) * 0.3) * this.ctx.voice.power;
      sfx.loop('roar', 1);
      Post.shake(dt * 1.6); Post.wantEdge(0.25, [1, 0.5, 0.15]);
      for (let i = 0; i < 6; i++) {
        const a = rand(0, TAU), s = rand(200, 800);
        particles.spawn({ x: f.x + Math.cos(a) * f.R * 0.8, y: f.y + Math.sin(a) * f.R * 0.8, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 200, drag: 1.4, life: rand(0.4, 0.9), c: pick([[1, 0.4, 0.08], [1, 0.62, 0.22]]), bright: 0.7, size: base * 0.03, size1: base * 0.08, fade: 1.2, flicker: 0.3 });
      }
      // stream between mouth and fireball
      for (let i = 0; i < 3; i++) {
        const t = Math.random();
        particles.spawn({ x: lerp(f.mx, f.x, t) + rand(-8, 8), y: lerp(f.my, f.y, t) + rand(-8, 8), vx: (f.x - f.mx) * 1.5, vy: (f.y - f.my) * 1.5, drag: 1, life: 0.25, c: [1, 0.7, 0.3], bright: 0.9, size: base * 0.03 * (0.4 + t), size1: base * 0.05, fade: 1 });
      }
      if (Math.random() < 0.4) phys.blast(f.x, f.y, f.R * 2.2, 700);
      if (f.t > 1.6) {
        f.ph = 'fade'; f.t = 0;
        Post.flashScreen(0.3, [1, 0.6, 0.25]); Post.shake(0.6);
        Post.shockwave({ x: f.x, y: f.y, speed: 1100, width: 110, strength: 34, life: 1.0 });
        phys.blast(f.x, f.y, diag * 0.7, 2600);
        phys.burst(f.x, f.y, 18, 'wood', { speed: 1200, size: 12, hot: 2, kinds: ['wood', 'rock'] });
        for (let i = 0; i < 8; i++) overlay.smoke(f.x + rand(-1, 1) * f.R, f.y + rand(-1, 1) * f.R, 4, 1.6, { spread: 2 });
        overlay.sfxText('FWOOOM!', f.x, f.y - f.R * 0.9, 1.7, [255, 190, 90]);
        sfx.play('explode', 1.4);
      }
    }
    if (f.ph === 'fade' && f.t > 0.8) f.ph = 'none';
    const on = f.ph === 'blow' || f.ph === 'fade';
    const k = f.ph === 'blow' ? 1 : f.ph === 'fade' ? 1 - f.t / 0.8 : 0;
    f.orbs.forEach((q, i) => {
      const j = [[0, 0, 1], [0.2, -0.15, 0.75], [-0.22, 0.12, 0.8]][i];
      q.set(f.x + j[0] * f.R, f.y + j[1] * f.R, f.R * 2.6 * j[2] * (f.ph === 'fade' ? 1 + (1 - k) * 0.6 : 1));
      q.param(0.15, 0, 0, 0);
      q.intensity = on ? k * (i === 0 ? 0.85 : 0.55) : 0;
      q.tick(time + i * 3.1);
    });
    if (f.heat) { f.heat.x = f.x; f.heat.y = f.y; f.heat.radius = f.R * 2.2; f.heat.strength = on ? 4.5 * k : 0; }
    // clones breathe fire too
    if (on && cn && Math.random() < 0.6) {
      for (let i = 0; i < cn; i++) {
        const p = this.cloneXf(i, f.mx, f.my);
        const a = rand(-0.5, 0.5) + Math.atan2(H * 0.46 - p.y, (W / 2 - p.x) * 0.3), s = rand(400, 900);
        particles.spawn({ x: p.x, y: p.y, vx: Math.cos(a) * s * 0.3, vy: Math.sin(a) * s, drag: 1.2, life: 0.6, c: [1, 0.5, 0.15], bright: 1.3, size: base * 0.03 * p.s, size1: base * 0.1 * p.s, fade: 1.2 });
      }
    }
    return on ? 1 : 0;
  }

  // ---------- frame ----------
  update(dt, time, hands) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const L = hands.L, R = hands.R;
    this.lastHands = hands;
    const seal = this.seals.read(L, R, time);
    const sign = seal ? seal.sign : null;
    for (const k of Object.keys(this.holds)) this.holds[k].update(sign === k ? k : null, dt);
    const { overlay } = this.ctx;

    // live readout of the seal you're forming
    if (seal && SEAL_NAME[sign] && sign !== 'stack' && sign !== 'grab') {
      const hd = this.holds[sign];
      overlay.chip(seal.x, seal.y + seal.sc * 2.2, SEAL_NAME[sign], hd ? hd.p : 0);
    }
    if (this.holds.clone.ready) { this.castClones(); Post.bloom(0.6); }
    if (this.holds.tiger.ready && this.fire.ph === 'none') this.startFireball(seal);

    this.updateClones(dt, time);
    const lr = this.updateRasengan(dt, time, hands, seal);
    const lc = this.updateChidori(dt, time, hands, seal);
    const lf = this.updateFireball(dt, time);

    // wisps of chakra off the fingertips
    for (const h of [L, R]) {
      if (!h.present || Math.random() > 0.35) continue;
      const p = h.pts[[4, 8, 12, 16, 20][(Math.random() * 5) | 0]];
      this.ctx.particles.spawn({ x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-80, -20), drag: 1.4, life: rand(0.4, 0.8), c: CHAKRA, bright: 0.5, size: rand(4, 8), size1: 12, fade: 1.2, flicker: 0.2 });
    }
    const base = 0.3 + (this.clone.on ? 0.2 : 0);
    const lvL = Math.max(base, lf, this.ras.slot === 'L' ? lr : 0, this.chi.slot === 'L' ? lc : 0);
    const lvR = Math.max(base, lf, this.ras.slot === 'R' ? lr : 0, this.chi.slot === 'R' ? lc : 0);
    return [lvL, lvR];
  }

  dbg() {
    const H = this.lastHands;
    return { spd: H ? [H.L.present ? H.L.speed.toFixed(1) : '-', H.R.present ? H.R.speed.toFixed(1) : '-'].join('/') : '', slot: this.chi.slot, seal: this.seals.info ? this.seals.info.sign : null, clones: this.clone.on ? this.clone.n : 0, ras: this.ras.ph + ':' + this.ras.k.toFixed(2), chi: this.chi.ph + ':' + this.chi.k.toFixed(2), fire: this.fire.ph };
  }
}
