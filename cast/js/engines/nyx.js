// Nyx: Limitless. Space itself, bent around your fingertips.
//  - Blue (蒼): point and hold. A point of infinite attraction forms at your
//    fingertip and drags the room into it. Flick to launch it.
//  - Red (赫): pinch thumb and index and hold to charge, then snap the
//    fingers open. A repulsion shot that blows everything apart.
//  - Hollow Purple (虚式「茈」): Blue in one hand, Red in the other; bring
//    them together. They fuse into imaginary mass. Thrust or fling to fire:
//    it erases a trench straight through the world.
//  - Domain Expansion, Infinite Void: cross your index and middle fingers
//    and hold them up. Everything behind you becomes an endless void.
import { CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad } from '../render/objects.js';
import { pose, Hold } from '../signs.js';
import { clamp, rand, pick, TAU, damp, lerp, easeOutCubic } from '../util.js';

const CH = CHARACTERS.nyx;
const BLUE = [0.12, 0.38, 1.0], BLUE_B = [0.5, 0.75, 1.0];
const RED = [1.0, 0.12, 0.08], RED_B = [1.0, 0.8, 0.72];
const PURP = [0.6, 0.12, 1.0], PURP_B = [0.82, 0.55, 1.0];
const MOVE = { blue: 0, red: 1, purple: 2, domain: 3 };

function release(src) {
  const i = Post.persistent.indexOf(src);
  if (i >= 0) Post.persistent.splice(i, 1);
}

export class Nyx {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    const orb = (a, b) => new FXQuad(S, 'kiOrb', { a, b, intensity: 0 });
    const glow = (a, b) => new FXQuad(S, 'glow', { a, b, intensity: 0, param: [3, 0, 0, 0] });
    this.blue = { on: false, k: 0, x: 0, y: 0, slot: null, hold: new Hold(0.3), orb: orb(BLUE, BLUE_B), glow: glow(BLUE, BLUE_B), well: null, lens: null, swirl: null, fly: null, off: 0 };
    this.red = { on: false, k: 0, x: 0, y: 0, slot: null, hold: new Hold(0.3), orb: orb(RED, RED_B), glow: glow(RED, RED_B), shot: null, off: 0 };
    this.purp = { ph: 'none', t: 0, x: 0, y: 0, R: 0, vx: 0, vy: 0, orb: orb(PURP, PURP_B), glow: glow(PURP, PURP_B), lens: null, bx: 0, by: 0, rx: 0, ry: 0 };
    this.dom = { ph: 'none', t: 0, hold: new Hold(0.55), x: 0, y: 0 };
    this.trench = [];
    this.painter = (g, dt) => this.paint(g, dt);
  }

  enter() {
    const b = this.blue;
    b.lens = Post.source('lens'); b.swirl = Post.source('swirl');
    this.purp.lens = Post.source('lens');
    this.ctx.overlay.painters.add(this.painter);
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    for (let i = 0; i < 10; i++) {
      const s = this.ctx.phys.shard(rand(0.05, 0.95) * W, rand(-0.4, -0.05) * H, 0, rand(0, 200), pick(['rock', 'rock', 'steel', 'glass']), base * rand(0.018, 0.034), { life: 1e9 });
      s.prop = true;
    }
  }

  exit() {
    const b = this.blue, r = this.red, p = this.purp;
    for (const o of [b, r, p]) { o.orb.intensity = 0; o.glow.intensity = 0; }
    b.on = false; r.on = false; p.ph = 'none'; b.fly = null; r.shot = null;
    if (b.well) { this.ctx.phys.dropWell(b.well); b.well = null; }
    release(b.lens); release(b.swirl); release(p.lens); b.lens = b.swirl = p.lens = null;
    this.dom.ph = 'none';
    this.trench.length = 0;
    this.ctx.overlay.painters.delete(this.painter);
    this.ctx.phys.gscale = 1;
  }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: o.drag ?? 2, grav: 0,
      life: o.life ?? rand(0.25, 0.5), c: o.c || BLUE_B, bright: o.bright ?? 2.2,
      width: o.width ?? rand(1.4, 2.6), stretch: o.stretch ?? 0.04, fade: 1.2,
    });
  }

  get base() { return Math.min(window.innerWidth, window.innerHeight); }

  // ---------- Blue ----------
  updateBlue(dt, time, hands, poses) {
    const b = this.blue, { phys, sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = this.base;
    if (!b.on && !b.fly) {
      let slot = null;
      for (const s of ['L', 'R']) if (poses[s] === 'point' && !(this.red.on && this.red.slot === s)) slot = slot || s;
      b.hold.update(slot, dt);
      if (slot) { const h = hands[slot]; overlay.chip(h.cx, h.cy + h.scale * 1.8, 'BLUE', b.hold.p, BLUE_B); }
      if (b.hold.ready) {
        b.on = true; b.slot = slot; b.k = 0; b.off = 0;
        const h = hands[slot];
        b.x = h.tipX; b.y = h.tipY;
        sfx.play('blue');
        overlay.callout('蒼', 'Blue', { big: true, dur: 1.2 });
        this.ctx.onMove(MOVE.blue);
      }
    }
    if (b.on) {
      const h = hands[b.slot];
      b.k = Math.min(1, b.k + dt / 0.7);
      if (h.present) {
        const tx = h.tipX + h.pdx * h.scale * 0.45, ty = h.tipY + h.pdy * h.scale * 0.45;
        b.x = damp(b.x, tx, 22, dt); b.y = damp(b.y, ty, 22, dt);
      }
      b.off = h.present && poses[b.slot] !== 'point' ? b.off + dt : 0;
      if (h.present && h.flick && b.k > 0.4) {
        const v = h.dir();
        b.fly = { vx: v.x * 1500, vy: v.y * 1500, t: 0 };
        b.on = false;
        sfx.play('throw');
      } else if (b.off > 0.2 || (!h.present && (b.lost = (b.lost || 0) + dt) > 0.5)) {
        b.on = false;
        if (!this.purp.eating) this.implode(b.x, b.y, b.k);
      }
      if (h.present) b.lost = 0;
    }
    if (b.fly) {
      b.fly.t += dt;
      b.x += b.fly.vx * dt; b.y += b.fly.vy * dt;
      b.fly.vx *= Math.exp(-dt * 1.4); b.fly.vy *= Math.exp(-dt * 1.4);
      if (b.fly.t > 1.4 || b.x < 0 || b.x > W || b.y < 0 || b.y > H) { this.implode(clamp(b.x, 0, W), clamp(b.y, 0, H), 1.3); b.fly = null; }
    }
    const live = b.on || !!b.fly;
    const k = live ? b.k : 0;
    // gravity: rubble and motes spiral in and are crushed
    if (live) {
      if (!b.well) b.well = phys.well(b.x, b.y, 0, 12);
      b.well.x = b.x; b.well.y = b.y; b.well.GM = 9e6 * k; b.well.rs = base * 0.02;
      if (Math.random() < 0.9 * k) {
        const a = rand(0, TAU), d = base * rand(0.3, 0.7);
        phys.orbiter(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, -Math.sin(a) * 260, Math.cos(a) * 260, { hue: 0.6, life: 3 });
      }
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU), d = base * rand(0.12, 0.3) * k;
        this.ctx.particles.spawn({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, vx: -Math.cos(a + 0.6) * d * 4, vy: -Math.sin(a + 0.6) * d * 4, drag: 3, life: 0.28, c: BLUE_B, bright: 1.4, size: 4, size1: 1, fade: 1 });
      }
      sfx.loop('vortex', 0.4 + k * 0.5); sfx.loop('drone', 0.3 * k);
    } else if (b.well) { phys.dropWell(b.well); b.well = null; }
    const R = base * (0.035 + 0.03 * k);
    b.orb.set(b.x, b.y, R / 0.42 * 2); b.orb.param(0.5, 0.6, 0, 0); b.orb.intensity = damp(b.orb.intensity, live ? 1.0 : 0, 14, dt); b.orb.tick(time);
    b.glow.set(b.x, b.y, R * 5.5); b.glow.intensity = damp(b.glow.intensity, live ? 0.55 * k : 0, 10, dt); b.glow.tick(time);
    if (b.lens) { b.lens.x = b.x; b.lens.y = b.y; b.lens.radius = R * 3.2; b.lens.strength = live ? 0.45 * k : 0; b.lens.horizon = 0; b.lens.seed = 0; }
    if (b.swirl) { b.swirl.x = b.x; b.swirl.y = b.y; b.swirl.radius = R * 7; b.swirl.strength = live ? 1.2 * k : 0; }
    return live ? 0.5 + k * 0.5 : 0;
  }

  implode(x, y, power = 1) {
    const { fx, sfx, phys } = this.ctx;
    const base = this.base;
    Post.shockwave({ x, y, speed: -900, width: 60, strength: 20 * power, life: 0.5, r: base * 0.5 });
    Post.punch(-1 * power, x, y); Post.shake(0.3 * power); Post.aberrate(8);
    fx.glow({ x, y, s0: base * 0.3, s1: base * 0.02, dur: 0.3, a: BLUE, b: [1, 1, 1], intensity: 3 });
    fx.ring({ x, y, r0: base * 0.35 * power, r1: 4, dur: 0.35, width: 20, a: BLUE, b: BLUE_B, intensity: 1.6 });
    setTimeout(() => { phys.blast(x, y, base * 0.45 * power, 1500 * power); Post.flashScreen(0.2, BLUE_B); }, 280);
    sfx.play('singularity');
  }

  // ---------- Red ----------
  updateRed(dt, time, hands, poses) {
    const r = this.red, { sfx, overlay } = this.ctx;
    const base = this.base;
    if (!r.on && !r.shot) {
      let slot = null;
      for (const s of ['L', 'R']) if (poses[s] === 'pinch' && !(this.blue.on && this.blue.slot === s)) slot = slot || s;
      r.hold.update(slot, dt);
      if (slot) { const h = hands[slot]; overlay.chip(h.cx, h.cy + h.scale * 1.8, 'RED', r.hold.p, RED_B); }
      if (r.hold.ready) {
        r.on = true; r.slot = slot; r.k = 0; r.off = 0;
        const h = hands[slot]; r.x = h.pinchX; r.y = h.pinchY;
        sfx.play('charge');
      }
    }
    if (r.on) {
      const h = hands[r.slot];
      r.k = Math.min(1, r.k + dt / 0.7);
      if (h.present) { r.x = damp(r.x, h.pinchX, 24, dt); r.y = damp(r.y, h.pinchY, 24, dt); r.dx = h.pdx; r.dy = h.pdy; }
      sfx.loop('charge', 0.3 + r.k * 0.6);
      for (let i = 0; i < 2; i++) this.spark(r.x, r.y, rand(0, TAU), rand(150, 500) * r.k, { c: pick([RED, RED_B]), life: 0.18 });
      // release: snap the pinch open
      const open = h.present && poses[r.slot] !== 'pinch';
      r.off = open ? r.off + dt : 0;
      if (r.off > 0.06) {
        r.on = false;
        if (r.k >= 0.35 && !this.purp.eating) this.fireRed(h);
      }
      if (!h.present) { r.lost = (r.lost || 0) + dt; if (r.lost > 0.5) r.on = false; } else r.lost = 0;
    }
    if (r.shot) {
      const s = r.shot;
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      this.ctx.lines.spawn(s.x - s.vx * 0.04, s.y - s.vy * 0.04, s.x, s.y, base * 0.05, RED, 1.2, 0.08);
      this.ctx.lines.spawn(s.x - s.vx * 0.03, s.y - s.vy * 0.03, s.x, s.y, base * 0.015, [1, 1, 1], 2, 0.08);
      r.x = s.x; r.y = s.y;
      const W = window.innerWidth, H = window.innerHeight;
      if (s.t > 0.38 || s.x < 0 || s.x > W || s.y < 0 || s.y > H) { this.redBoom(clamp(s.x, 0, W), clamp(s.y, 0, H)); r.shot = null; }
    }
    const live = r.on || !!r.shot;
    const R = base * (0.025 + 0.03 * (live ? r.k : 0));
    r.orb.set(r.x, r.y, R / 0.42 * 2); r.orb.param(0.6, 1, 0, 0); r.orb.intensity = damp(r.orb.intensity, live ? 1.1 : 0, 16, dt); r.orb.tick(time);
    r.glow.set(r.x, r.y, R * 5.5); r.glow.intensity = damp(r.glow.intensity, live ? 0.55 : 0, 12, dt); r.glow.tick(time);
    return live ? 0.5 + r.k * 0.5 : 0;
  }

  fireRed(h) {
    const r = this.red;
    // fire the way the pinching finger points, or the way the hand moves
    let dx = r.dx || 0, dy = r.dy || -1;
    if (h.present && h.speed > 2.5) { const v = h.dir(); dx = v.x; dy = v.y; }
    r.shot = { x: r.x, y: r.y, vx: dx * 2300, vy: dy * 2300, t: 0 };
    this.ctx.sfx.play('snap');
    this.ctx.overlay.callout('赫', 'Red', { big: true, dur: 1.1 });
    Post.punch(0.8, r.x, r.y);
    this.ctx.onMove(MOVE.red);
  }

  redBoom(x, y) {
    const { fx, sfx, phys, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H), base = this.base;
    const p = this.ctx.voice.power * (0.6 + this.red.k * 0.6);
    Post.freeze(0.08); Post.impact(0.1, RED_B); Post.flashScreen(0.55, [1, 0.35, 0.3]);
    Post.shake(0.8); Post.punch(1.8 * p, x, y); Post.aberrate(16);
    Post.shockwave({ x, y, speed: 1800, width: 140, strength: 50 * p, life: 0.9 });
    Post.shockwave({ x, y, speed: 900, width: 80, strength: 28 * p, life: 0.9 });
    fx.glow({ x, y, s0: base * 0.1, s1: diag * 0.9, dur: 0.55, a: RED, b: [1, 0.9, 0.85], intensity: 4 });
    fx.ring({ x, y, r0: 20, r1: diag * 0.6, dur: 0.6, width: 50, a: RED, b: RED_B, noise: 0.25, intensity: 2 });
    for (let i = 0; i < 120; i++) this.spark(x, y, rand(0, TAU), rand(700, 2600), { c: pick([RED, RED_B, [1, 1, 1]]), life: rand(0.4, 0.8) });
    phys.blast(x, y, diag, 4200 * p);
    phys.burst(x, y, 18, 'rock', { speed: 1700, size: 12, kinds: ['rock', 'glass', 'steel'] });
    overlay.crack(x, y, 1.1 * p);
    overlay.sfxText('BWOOM!', x, y - base * 0.1, 1.5, [255, 170, 160]);
    sfx.play('red');
  }

  // ---------- Hollow Purple ----------
  updatePurple(dt, time, hands) {
    const P = this.purp, b = this.blue, r = this.red, { sfx, overlay, fx, phys } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = this.base, diag = Math.hypot(W, H);
    P.t += dt;
    if (P.ph === 'none' && b.on && r.on && b.slot !== r.slot && b.k > 0.5 && r.k > 0.4) {
      const hs = (hands.L.scale + hands.R.scale) / 2;
      const d = Math.hypot(b.x - r.x, b.y - r.y) / hs;
      overlay.chip((b.x + r.x) / 2, (b.y + r.y) / 2 + hs * 1.6, 'BRING THEM TOGETHER', clamp(1 - (d - 1.8) / 4, 0, 1), PURP_B);
      if (d < 1.8) {
        P.ph = 'merge'; P.t = 0; P.bx = b.x; P.by = b.y; P.rx = r.x; P.ry = r.y;
        P.eating = true; this.purp.eating = true;
        b.on = false; r.on = false;
        sfx.play('purple');
        overlay.callout('虚式', 'Imaginary Technique', { dur: 0.9 });
      }
    }
    if (P.ph === 'merge') {
      // the two spiral into each other, then flash into purple
      const k = clamp(P.t / 0.7, 0, 1), a = k * TAU * 1.5;
      const cx = (P.bx + P.rx) / 2, cy = (P.by + P.ry) / 2, rad = Math.hypot(P.bx - P.rx, P.by - P.ry) / 2 * (1 - k);
      b.x = cx + Math.cos(a) * rad; b.y = cy + Math.sin(a) * rad;
      r.x = cx - Math.cos(a) * rad; r.y = cy - Math.sin(a) * rad;
      b.orb.intensity = 1.4; r.orb.intensity = 1.6;
      for (let i = 0; i < 3; i++) this.spark(cx, cy, rand(0, TAU), rand(300, 1000) * k, { c: pick([PURP_B, RED_B, BLUE_B]) });
      Post.shake(dt * 1.5 * k); Post.wantDim(0.5 * k);
      P.x = cx; P.y = cy;
      if (k >= 1) {
        P.ph = 'held'; P.t = 0; P.R = base * 0.08;
        b.orb.intensity = 0; r.orb.intensity = 0; b.glow.intensity = 0; r.glow.intensity = 0;
        Post.flashScreen(0.8, PURP_B); Post.freeze(0.12); Post.impact(0.12, PURP_B); Post.punch(1.2, cx, cy);
        overlay.callout('茈', 'Hollow Purple', { big: true, dur: 1.8 });
        this.ctx.onMove(MOVE.purple);
      }
    }
    if (P.ph === 'held') {
      const L = hands.L, R = hands.R;
      const hs = [L, R].filter((h) => h.present);
      if (hs.length) {
        const mx = hs.reduce((a, h) => a + h.cx, 0) / hs.length, my = hs.reduce((a, h) => a + h.cy, 0) / hs.length;
        P.x = damp(P.x, mx, 10, dt); P.y = damp(P.y, my, 10, dt);
      }
      P.R = base * (0.08 + Math.min(0.05, P.t * 0.03));
      Post.wantDim(0.45); sfx.loop('drone', 0.8); sfx.loop('beam', 0.3);
      const go = hs.find((h) => h.flick || h.thrust);
      const apart = L.present && R.present && Math.hypot(L.cx - R.cx, L.cy - R.cy) / ((L.scale + R.scale) / 2) > 4.5;
      if (go || apart || P.t > 6) {
        let dx, dy;
        if (go && go.flick) { const v = go.dir(); dx = v.x; dy = v.y; }
        else { dx = P.x < W / 2 ? 1 : -1; dy = -0.08; }
        const m = Math.hypot(dx, dy) || 1;
        P.vx = (dx / m) * 1300; P.vy = (dy / m) * 1300;
        P.ph = 'fly'; P.t = 0; P.lx = P.x; P.ly = P.y;
        sfx.play('purple');
        Post.punch(2, P.x, P.y); Post.shake(0.8);
      }
    }
    if (P.ph === 'fly') {
      P.x += P.vx * dt; P.y += P.vy * dt;
      P.R = Math.min(base * 0.22, P.R + dt * base * 0.25);
      // erase everything in its path
      this.trench.push({ x0: P.lx, y0: P.ly, x1: P.x, y1: P.y, w: P.R * 1.7, t: 0 });
      P.lx = P.x; P.ly = P.y;
      for (const s of phys.shards) {
        if (Math.hypot(s.x - P.x, s.y - P.y) < P.R * 1.2 && s.age < s.life) {
          s.age = s.life + 0.99;
          for (let i = 0; i < 4; i++) this.spark(s.x, s.y, rand(0, TAU), rand(200, 900), { c: PURP_B });
        }
      }
      phys.blast(P.x, P.y, P.R * 3, 1200 * dt * 60);
      Post.shake(dt * 2.5); Post.aberrate(10); Post.wantDim(0.35);
      sfx.loop('beam', 1); sfx.loop('drone', 1);
      if (Math.random() < 0.5) Post.shockwave({ x: P.x, y: P.y, speed: 500, width: 50, strength: 20, life: 0.4, r: P.R });
      const off = P.x < -P.R * 2 || P.x > W + P.R * 2 || P.y < -P.R * 2 || P.y > H + P.R * 2;
      if (off || P.t > 2.5) {
        P.ph = 'fade'; P.t = 0;
        Post.flashScreen(0.45, PURP_B);
        overlay.sfxText('...', W / 2, H * 0.3, 1.2, [230, 210, 255]);
      }
    }
    if (P.ph === 'fade' && P.t > 0.5) { P.ph = 'none'; this.purp.eating = false; }
    const live = P.ph === 'held' || P.ph === 'fly';
    P.orb.set(P.x, P.y, P.R / 0.42 * 2); P.orb.param(1, 1, 0, 0); P.orb.intensity = damp(P.orb.intensity, live ? 1.0 : 0, 12, dt); P.orb.tick(time);
    P.glow.set(P.x, P.y, P.R * 4.5); P.glow.intensity = damp(P.glow.intensity, live ? 0.45 : 0, 10, dt); P.glow.tick(time);
    if (P.lens) { P.lens.x = P.x; P.lens.y = P.y; P.lens.radius = P.R * 2.4; P.lens.strength = live ? 0.5 : 0; P.lens.horizon = 0; }
    // the trench fades slowly
    for (let i = this.trench.length - 1; i >= 0; i--) { this.trench[i].t += dt; if (this.trench[i].t > 2.6) this.trench.splice(i, 1); }
    return live || P.ph === 'merge' ? 1 : 0;
  }

  // ---------- Domain Expansion ----------
  updateDomain(dt, time, hands, poses) {
    const D = this.dom, { overlay, sfx, phys } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    let slot = null;
    for (const s of ['L', 'R']) if (poses[s] === 'together') slot = slot || s;
    D.hold.update(D.ph === 'none' ? slot : null, dt);
    if (slot && D.ph === 'none') { const h = hands[slot]; overlay.chip(h.cx, h.cy + h.scale * 1.8, 'DOMAIN EXPANSION', D.hold.p, PURP_B); }
    if (D.ph === 'none' && D.hold.ready) {
      D.ph = 'open'; D.t = 0;
      overlay.callout('領域展開', 'Domain Expansion', { big: true, dur: 1.3 });
      sfx.play('seal', 4);
      Post.wantDim(1);
      this.ctx.onMove(MOVE.domain);
    }
    D.t += dt;
    const I = this.ctx.phys.body?.info;
    const cx = I && I.ok ? I.hx : W / 2, cy = I && I.ok ? I.hy : H * 0.4;
    if (D.ph === 'open') {
      Post.wantDim(clamp(D.t / 0.9, 0, 1));
      if (D.t > 1.0) {
        D.ph = 'on'; D.t = 0;
        overlay.callout('無量空処', 'Infinite Void', { big: true, dur: 2.2 });
        sfx.play('domain');
        Post.flashScreen(1, [0.9, 0.93, 1]); Post.freeze(0.15); Post.impact(0.15, [1, 1, 1]);
        Post.shockwave({ x: cx, y: cy, speed: 1200, width: 140, strength: 40, life: 1.2 });
      }
    }
    if (D.ph === 'on') {
      Post.wantVoid(1, cx, cy);
      // the world hangs weightless inside the domain
      phys.gscale = 0.06;
      for (const s of phys.shards) { s.vx *= Math.exp(-dt * 1.5); s.vy *= Math.exp(-dt * 1.5); s.life = Math.max(s.life, s.age + 1); }
      if (Math.random() < 0.3) {
        // information flooding in: streaks rushing past toward you
        const a = rand(0, TAU), d = Math.hypot(W, H) * 0.7;
        this.ctx.streaks.spawn({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * 2200, vy: -Math.sin(a) * 2200, drag: 0, grav: 0, life: 0.3, c: pick([BLUE_B, PURP_B, [1, 1, 1]]), bright: 1.6, width: 1.5, stretch: 0.06, fade: 1 });
      }
      sfx.loop('hum', 0.8);
      if (D.t > 9) { D.ph = 'close'; D.t = 0; sfx.play('whoomp'); }
    }
    if (D.ph === 'close') {
      Post.wantVoid(1 - D.t / 0.8, cx, cy);
      if (D.t > 0.8) { D.ph = 'none'; phys.gscale = 1; }
    }
    return D.ph === 'on' ? 0.7 : 0;
  }

  update(dt, time, hands) {
    const poses = { L: pose(hands.L), R: pose(hands.R) };
    const lb = this.updateBlue(dt, time, hands, poses);
    const lr = this.updateRed(dt, time, hands, poses);
    const lp = this.updatePurple(dt, time, hands);
    const ld = this.updateDomain(dt, time, hands, poses);
    const lv = (s) => Math.max(0.25, lp, ld, this.blue.slot === s ? lb : 0, this.red.slot === s ? lr : 0);
    return [lv('L'), lv('R')];
  }

  // erased trench: a hole cut through the picture with a violet rim
  paint(g) {
    if (!this.trench.length) return;
    g.save();
    g.lineCap = 'round';
    for (const s of this.trench) {
      const a = Math.max(0, 1 - s.t / 2.6);
      g.strokeStyle = `rgba(0,0,0,${0.92 * a})`;
      g.lineWidth = s.w;
      g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke();
    }
    g.globalCompositeOperation = 'lighter';
    for (const s of this.trench) {
      const a = Math.max(0, 1 - s.t / 2.6);
      g.strokeStyle = `rgba(170,90,255,${0.35 * a})`;
      g.lineWidth = s.w * 1.12;
      g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke();
      g.strokeStyle = `rgba(0,0,0,0)`;
    }
    g.restore();
    // re-darken the core so the rim reads as an edge
    g.save();
    g.lineCap = 'round';
    for (const s of this.trench) {
      const a = Math.max(0, 1 - s.t / 2.6);
      g.strokeStyle = `rgba(4,0,10,${0.95 * a})`;
      g.lineWidth = s.w * 0.9;
      g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke();
    }
    g.restore();
  }

  dbg() { return { blue: this.blue.on ? this.blue.k.toFixed(1) : (this.blue.fly ? 'fly' : '-'), red: this.red.on ? this.red.k.toFixed(1) : (this.red.shot ? 'shot' : '-'), purp: this.purp.ph, dom: this.dom.ph }; }
}
