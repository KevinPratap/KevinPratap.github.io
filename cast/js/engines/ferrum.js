// Ferrum: a powered-armor tech hero. Repulsor blasts from the palm, a
// targeting HUD, homing missile volleys, palm thrusters for flight, and a
// suit-up sequence that recolors and boosts everything.
import { CONFIG, CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad } from '../render/objects.js';
import { clamp, rand, pick, TAU, damp, lerp, easeOutCubic } from '../util.js';

const CH = CHARACTERS.ferrum;
const CYAN = [[0.25, 0.85, 1], [0.6, 0.95, 1], [0.9, 1, 1], [0.15, 0.6, 1]];
const GOLD = [[1, 0.7, 0.2], [1, 0.85, 0.4], [1, 0.96, 0.75], [1, 0.45, 0.12]];
const SUIT_TIME = 25;

function toEdge(x, y, dx, dy, pad = 60) {
  const W = window.innerWidth + pad, H = window.innerHeight + pad;
  let t = 1e9;
  if (dx > 0) t = Math.min(t, (W - x) / dx); else if (dx < 0) t = Math.min(t, (-pad - x) / dx);
  if (dy > 0) t = Math.min(t, (H - y) / dy); else if (dy < 0) t = Math.min(t, (-pad - y) / dy);
  if (!isFinite(t) || t > 1e8) t = 0;
  return { x: x + dx * t, y: y + dy * t, len: t };
}

export class Ferrum {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    this.slots = {};
    for (const s of ['L', 'R']) {
      this.slots[s] = {
        c: 0, cool: 0, callout: 0, fistT: 0, x: 0, y: 0, thr: 0,
        glow: new FXQuad(S, 'glow', { a: CH.a, b: CH.b, intensity: 0, param: [3.5, 0, 0, 0] }),
        ring1: new FXQuad(S, 'ring', { a: CH.a, b: CH.b, intensity: 0 }),
        ring2: new FXQuad(S, 'ring', { a: CH.a, b: CH.b, intensity: 0 }),
        jet: new FXQuad(S, 'beam', { a: CH.a, b: CH.b, intensity: 0 }),
      };
    }
    this.beams = [];
    this.missiles = [];
    this.marks = [];
    this.timers = [];
    this.hud = { on: false, k: 0, fist: 0, cool: 0 };
    this.suit = { on: false, t: 0, hold: 0, cool: 0, glow: new FXQuad(S, 'glow', { a: GOLD[0], b: GOLD[2], intensity: 0, param: [3, 0, 0, 0] }), ring: new FXQuad(S, 'ring', { a: GOLD[0], b: GOLD[2], intensity: 0 }), x: 0, y: 0 };
    this.thrust = { k: 0, called: 0, alt: 0 };
    this.holo = { on: false, k: 0, d0: 0, e: 0, yaw: 0.6, roll: 0, t: 0, lost: 0, x: 0, y: 0, S: 0, hold: 0, cool: 0 };
    this.uni = {
      c: 0, on: false, t: 0, x: 0, y: 0, dx: 0, dy: -1, boomT: 0, lost: 0, cool: 0,
      q: new FXQuad(S, 'beam', { a: CH.a, b: CH.b, intensity: 0 }),
      core: new FXQuad(S, 'beam', { a: [1, 1, 1], b: [1, 1, 1], intensity: 0 }),
      glow: new FXQuad(S, 'glow', { a: CH.a, b: CH.b, intensity: 0, param: [3, 0, 0, 0] }),
      ring: new FXQuad(S, 'ring', { a: CH.a, b: CH.b, intensity: 0 }),
    };
    this.power = 0;
  }

  get gold() { return this.suit.on; }
  get pal() { return this.suit.on ? GOLD : CYAN; }
  get cA() { return this.suit.on ? CH.gold : CH.a; }
  get cB() { return this.suit.on ? CH.goldB : CH.b; }
  get pow() { return this.suit.on ? 1.35 : 1; }

  enter() {}

  exit() {
    for (const st of Object.values(this.slots)) {
      st.c = 0; st.glow.intensity = 0; st.ring1.intensity = 0; st.ring2.intensity = 0; st.jet.intensity = 0;
    }
    this.beams.forEach((b) => b.q.dispose());
    this.beams.length = 0;
    this.missiles.length = 0;
    this.marks.length = 0;
    this.timers.length = 0;
    this.hud.on = false; this.hud.k = 0;
    this.suit.on = false; this.suit.glow.intensity = 0; this.suit.ring.intensity = 0;
    this.thrust.k = 0;
    const u = this.uni;
    u.on = false; u.c = 0; u.q.intensity = 0; u.core.intensity = 0; u.glow.intensity = 0; u.ring.intensity = 0;
    this.recolor();
  }

  recolor() {
    const cA = this.cA, cB = this.cB;
    for (const st of Object.values(this.slots)) {
      for (const q of [st.glow, st.ring1, st.ring2, st.jet]) { q.u.uColorA.value.set(...cA); q.u.uColorB.value.set(...cB); }
    }
    if (this.ctx.energy) this.ctx.energy.setColors(cA, cB);
    this.ctx.overlay.setCharacter({ ...CH, a: cA, b: cB });
  }

  after(t, fn) { this.timers.push({ t, fn }); }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: o.drag ?? 1.6, grav: o.grav ?? 0,
      life: o.life ?? rand(0.3, 0.6), c: pick(this.pal), bright: o.bright ?? 2.2,
      width: o.width ?? rand(1.5, 3), stretch: o.stretch ?? 0.04, fade: 1.2, fn: o.fn,
    });
  }

  update(dt, time, hands) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const L = hands.L, R = hands.R;
    const levels = [0.32, 0.32];
    const suitBusy = this.updateSuit(L, R, dt, time, levels);
    const flying = this.updateThrusters(L, R, dt, time, levels);
    const beaming = this.updateUnibeam(L, R, dt, time, levels);
    const holoing = this.updateHolo(L, R, dt, time, levels);
    const busy = suitBusy || flying || beaming || holoing;
    this.power = 0;
    for (const [k, h] of [['L', L], ['R', R]]) {
      const lv = this.updateHand(this.slots[k], h, other(h, L, R), dt, time, busy);
      levels[k === 'L' ? 0 : 1] = Math.max(levels[k === 'L' ? 0 : 1], lv);
    }
    this.updateBeams(dt, time);
    this.updateMissiles(dt, time);
    this.updateHud(L, R, dt, time);
    return levels;
  }

  // ---------- per hand: Repulsor charge/fire, Missiles, HUD toggle ----------
  updateHand(st, h, o, dt, time, busy) {
    const { overlay, sfx, fx } = this.ctx;
    st.cool -= dt; st.callout -= dt;
    if (h.present) {
      st.x = damp(st.x || h.cx, h.cx, 24, dt);
      st.y = damp(st.y || h.cy, h.cy, 24, dt);
    }

    // ---- Repulsor ----
    const down = h.present && h.pts[9].y - h.pts[0].y > h.scale * 0.55;
    const want = h.present && !busy && h.isOpen && h.still && !down && !h.point && !h.two;
    const rate = want ? (1 / 0.9) * this.ctx.voice.boost : -1.2;
    st.c = clamp(st.c + rate * dt, 0, 1);
    const C = st.c;
    if (C > 0.02) {
      const s = h.present ? h.scale : 80;
      st.glow.set(st.x, st.y, s * (2 + C * 3));
      st.glow.intensity = (0.25 + C * 0.9) * (0.9 + Math.random() * 0.2);
      st.glow.tick(time);
      // rings collapse onto the palm as it charges
      const r1 = s * (2.3 - 1.5 * C), r2 = s * (1.3 - 0.6 * C);
      const S1 = r1 / 0.4 + 12, S2 = r2 / 0.4 + 8;
      st.ring1.set(st.x, st.y, S1); st.ring1.param(r1 / (S1 / 2), 3 / (S1 / 2), 0.04, 0);
      st.ring1.intensity = 0.9 + C; st.ring1.tick(time);
      st.ring2.set(st.x, st.y, S2); st.ring2.param(r2 / (S2 / 2), 2 / (S2 / 2), 0.04, 0);
      st.ring2.intensity = 0.7 + C * 1.2; st.ring2.tick(time + 3);
      sfx.loop('charge', C * 0.9);
      this.power = Math.max(this.power, C);
      Post.wantAura(C * 0.3, this.cA, this.cB);
      Post.wantZoom(C * 0.03, st.x, st.y);
      if (Math.random() < dt * 90 * C) {
        const a = rand(0, TAU), d = s * rand(1.6, 2.6);
        this.ctx.streaks.spawn({
          x: st.x + Math.cos(a) * d, y: st.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 5, vy: -Math.sin(a) * d * 5,
          drag: 0, life: 0.2, c: pick(this.pal), bright: 2, width: 2, stretch: 0.06, fade: 0.8,
        });
      }
      if (C > 0.6 && st.callout <= 0) {
        overlay.callout('光線砲', 'Repulsor Blast');
        this.ctx.onMove('repulsor');
        sfx.play('lock');
        st.callout = 3;
        Post.flashScreen(0.08, this.cB);
      }
    } else {
      st.glow.intensity = 0; st.ring1.intensity = 0; st.ring2.intensity = 0;
    }
    if (h.present && C > 0.25 && !busy) {
      if (h.flick) this.fireRepulsor(h, C, false);
      else if (h.thrust) this.fireRepulsor(h, C, true);
    }

    // ---- Missile Volley: two fingers up, then flick ----
    if (h.present && h.two && h.flick && st.cool <= 0 && !busy) {
      st.cool = 1.2;
      this.launch(h);
    }

    // (the HUD now comes up with the suit instead of a fist toggle)
    return 0.32 + C * 1.4;
  }

  // ---------- Repulsor firing ----------
  fireRepulsor(h, C, camera) {
    const { fx, sfx, overlay, scene } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    const st = this.slots[h.slot];
    const x = st.x, y = st.y;
    const pw = (0.6 + C * 0.9) * this.pow * this.ctx.voice.power;
    st.c = 0;
    Post.freeze(0.06);
    Post.shake(0.45 + pw * 0.25);
    Post.aberrate(8 + 5 * pw);
    Post.bloom(1.4 + pw);
    Post.flashScreen(0.2 + 0.1 * pw, this.cB);
    Post.shockwave({ x, y, speed: 1400, width: 70, strength: 22 + 12 * pw, life: 0.55 });
    fx.ring({ x, y, r0: h.scale * 0.6, r1: h.scale * (3 + 2 * pw), dur: 0.35, width: 12, a: this.cA, b: this.cB, intensity: 2.2 });
    fx.glow({ x, y, s0: h.scale * 2, s1: h.scale * 8, dur: 0.22, a: this.cA, b: [1, 1, 1], intensity: 2.8 });
    if (camera) {
      // straight at the lens: a flare and a tunnel of rings
      Post.punch(2.4, x, y);
      Post.impact(0.09, this.cB);
      Post.flashScreen(0.6, this.cB);
      for (let i = 0; i < 4; i++) this.after(i * 0.06, () => fx.ring({ x, y, r0: h.scale, r1: diag * 0.9, dur: 0.5, width: 20, a: this.cA, b: this.cB, noise: 0.06, intensity: 1.8 }));
      for (let i = 0; i < 80; i++) this.spark(x, y, rand(0, TAU), rand(1400, 3400), { life: rand(0.2, 0.45), drag: 0 });
      overlay.speedLines(1, x, y);
    } else {
      const d = h.dir();
      let dx = d.x, dy = d.y;
      if (Math.hypot(dx, dy) < 0.2) { dx = h.pts[9].x - h.pts[0].x; dy = h.pts[9].y - h.pts[0].y; }
      const m = Math.hypot(dx, dy) || 1;
      dx /= m; dy /= m;
      const e = toEdge(x, y, dx, dy, 60);
      const q = new FXQuad(scene, 'beam', { a: this.cA, b: this.cB, intensity: 2.2 });
      this.beams.push({ q, x, y, dx, dy, len: e.len, w: h.scale * (0.55 + 0.6 * pw), t: 0, life: 0.55, ex: e.x, ey: e.y, boltT: 0 });
      Post.punch(-1.2, x, y);
      this.ctx.phys.push(x, y, dx, dy, e.len, 140, 2600 * this.pow);
      for (let i = 1; i <= 4; i++) {
        fx.ring({ x: x + dx * h.scale * i * 1.1, y: y + dy * h.scale * i * 1.1, r0: h.scale * 0.35, r1: h.scale * (1.4 - i * 0.2), dur: 0.3 + i * 0.05, width: 6, a: this.cA, b: this.cB, intensity: 1.8 });
      }
      for (let i = 0; i < 46; i++) this.spark(x, y, Math.atan2(dy, dx) + rand(-0.25, 0.25), rand(1500, 3200), { life: rand(0.15, 0.3), drag: 1, width: rand(1.5, 3) });
    }
    sfx.play('repulsor');
    overlay.callout('光線砲', 'Repulsor Blast', { big: camera || pw > 1.2, dur: 1.1 });
    st.cool = Math.max(st.cool, 0.4);
  }

  updateBeams(dt, time) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const k = b.t / b.life;
      const w = b.w * (k < 0.12 ? 1.5 : 1.5 * Math.pow(1 - (k - 0.12) / 0.88, 1.4));
      b.q.set(b.x + b.dx * b.len / 2, b.y + b.dy * b.len / 2, b.len, Math.max(w, 1), Math.atan2(b.dy, b.dx));
      b.q.param(1, 1, 0, 0);
      b.q.intensity = 2.3 * (1 - k);
      b.q.tick(time);
      Post.wantDim(0.4 * (1 - k));
      b.boltT -= dt;
      if (b.boltT <= 0 && k < 0.7) {
        b.boltT = 0.04;
        // hex-pulse rings running down the beam
        const d = (b.t * 2600) % b.len;
        const px = b.x + b.dx * d, py = b.y + b.dy * d;
        this.ctx.lines.spawn(px - b.dy * w * 0.6, py + b.dx * w * 0.6, px + b.dy * w * 0.6, py - b.dx * w * 0.6, 3, this.pal[1], 2.2, 0.05);
      }
      if (b.t >= b.life * 0.25 && !b.hit) {
        b.hit = true;
        const x = clamp(b.ex, 0, window.innerWidth), y = clamp(b.ey, 0, window.innerHeight);
        this.boom(x, y, 1.1 + b.w / 100, true);
      }
      if (b.t >= b.life) { b.q.dispose(); this.beams.splice(i, 1); }
    }
  }

  boom(x, y, power = 1, beamEnd = false) {
    const { fx, sfx } = this.ctx;
    const base = Math.min(window.innerWidth, window.innerHeight);
    fx.glow({ x, y, s0: base * 0.05, s1: base * 0.5 * power, dur: 0.3, a: this.cA, b: [1, 1, 1], intensity: 2.6 });
    fx.ring({ x, y, r0: 10, r1: base * 0.32 * power, dur: 0.4, width: 12, a: this.cA, b: this.cB, noise: 0.15, intensity: 2 });
    Post.shockwave({ x, y, speed: 1100, width: 60, strength: 18 * power, life: 0.5 });
    Post.shake(beamEnd ? 0.35 : 0.14);
    Post.aberrate(beamEnd ? 8 : 4);
    for (let i = 0; i < 26 * power; i++) this.spark(x, y, rand(0, TAU), rand(300, 1400) * power, { life: rand(0.2, 0.5) });
    const ph = this.ctx.phys;
    ph.blast(x, y, 320 * power, 1100 * power);
    ph.burst(x, y, beamEnd ? 3 : 6, 'rock', { speed: 900 * power, size: 9, up: 350, hot: 0.5 });
    if (!beamEnd) sfx.play('crack');
  }

  // Missile hit: an orange fireball that leaves dark smoke.
  fireball(x, y, power = 1) {
    const { fx, sfx, overlay } = this.ctx;
    const base = Math.min(window.innerWidth, window.innerHeight);
    const FIRE = [[1, 0.55, 0.12], [1, 0.8, 0.3], [1, 0.35, 0.05]];
    fx.glow({ x, y, s0: 30, s1: base * 0.55 * power, dur: 0.4, a: [1, 0.45, 0.1], b: [1, 0.95, 0.7], intensity: 2.4 });
    fx.ring({ x, y, r0: 10, r1: base * 0.35 * power, dur: 0.45, width: 18, a: [1, 0.5, 0.1], b: [1, 0.9, 0.6], noise: 0.15, intensity: 1.8 });
    Post.shockwave({ x, y, speed: 1200, width: 70, strength: 26 * power, life: 0.6 });
    Post.shake(0.3);
    Post.aberrate(6);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU), s = rand(300, 1300);
      this.ctx.streaks.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 1.8, grav: 600, life: rand(0.3, 0.7), c: pick(FIRE), bright: 2.2, width: rand(2, 4), stretch: 0.04, fade: 1.2 });
    }
    this.ctx.phys.blast(x, y, 500 * power, 1800 * power);
    this.ctx.phys.burst(x, y, 10, 'rock', { speed: 1200, size: 11, up: 500, hot: 0.7 });
    this.after(0.1, () => overlay.smoke(x, y, 7, 1.1, { spread: 1.3, tint: [70, 66, 64], dur: 1.2, lobes: 3 }));
    sfx.play('explode', 0.6);
  }

  // ---------- Holo Schematic ----------
  // Pinch with both hands and pull them apart: a 3D reactor unfolds between
  // them. Spread wider and it comes apart layer by layer; bring them
  // together and it snaps back. Tilt your hands to spin it.
  updateHolo(L, R, dt, time, levels) {
    const o = this.holo, { overlay, sfx, fx } = this.ctx;
    o.cool -= dt;
    const both = L.present && R.present && L.pinch && R.pinch;
    if (!o.on) {
      o.hold = both && o.cool <= 0 ? o.hold + dt : 0;
      if (o.hold > 0.22) {
        o.on = true; o.k = 0; o.lost = 0; o.t = 0; o.e = 0; o.hold = 0;
        o.d0 = Math.hypot(L.pinchX - R.pinchX, L.pinchY - R.pinchY);
        overlay.callout('設計図', 'Holo Schematic', { dur: 1.1 });
        sfx.play('holo');
        this.ctx.onMove('unibeam');
        Post.flashScreen(0.15, this.cB);
        fx.ring({ x: (L.pinchX + R.pinchX) / 2, y: (L.pinchY + R.pinchY) / 2, r0: 10, r1: 300, dur: 0.45, width: 10, a: this.cA, b: this.cB, intensity: 1.8 });
      }
      return false;
    }
    o.t += dt;
    if (both) o.lost = 0; else o.lost += dt;
    o.k = o.lost > 0.35 ? Math.max(0, o.k - dt * 5) : Math.min(1, o.k + dt * 5);
    if (o.lost > 0.35 && o.k <= 0) {
      o.on = false; o.cool = 0.6;
      sfx.play('lock');
      return false;
    }
    if (L.present && R.present) {
      const ax = L.pinchX, ay = L.pinchY, bx = R.pinchX, by = R.pinchY;
      const d = Math.hypot(ax - bx, ay - by) || 1;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      o.x = damp(o.x || mx, mx, 14, dt); o.y = damp(o.y || my, my, 14, dt);
      o.S = damp(o.S || d * 0.36, clamp(d * 0.36, 50, Math.min(window.innerWidth, window.innerHeight) * 0.4), 10, dt);
      const ratio = d / Math.max(o.d0, 60);
      o.e = damp(o.e, clamp((ratio - 1) * 1.5, 0, 1.6), 6, dt);
      // one hand higher than the other spins it; the line between them rolls it
      const tilt = (by - ay) / d;
      o.yaw += (0.55 + tilt * 3.2) * dt;
      o.roll = damp(o.roll, Math.atan2(by - ay, bx - ax) * 0.5, 8, dt);
      o.hx = [{ x: ax, y: ay }, { x: bx, y: by }];
      if (Math.random() < dt * 30) this.spark(ax, ay, rand(0, TAU), rand(80, 300), { life: 0.25, width: 1.6 });
      if (Math.random() < dt * 30) this.spark(bx, by, rand(0, TAU), rand(80, 300), { life: 0.25, width: 1.6 });
    }
    overlay.setHolo({ x: o.x, y: o.y, S: o.S, yaw: o.yaw, pitch: 0.5, roll: o.roll, e: o.e, k: o.k, t: o.t, a: this.suit.on ? [1, 0.82, 0.35] : [0.3, 0.9, 1], hands: o.hx || [{ x: o.x - 50, y: o.y }, { x: o.x + 50, y: o.y }] });
    Post.wantDim(0.3 * o.k);
    sfx.loop('hum', 0.4 * o.k);
    levels[0] = levels[1] = 0.2;
    return true;
  }

  // ---------- Unibeam ----------
  // Both palms open side by side and held: the arc reactor in your chest
  // charges and fires a huge beam. It points through your hands, so moving
  // them sweeps it across the room.
  updateUnibeam(L, R, dt, time, levels) {
    const u = this.uni, { fx, sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    u.cool -= dt;
    let pose = false, mx = 0, my = 0, sc = 80;
    if (L.present && R.present && L.isOpen && R.isOpen && !L.point && !R.point) {
      sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      const down = (h) => h.pts[9].y - h.pts[0].y > h.scale * 0.55;
      mx = (L.cx + R.cx) / 2; my = (L.cy + R.cy) / 2;
      pose = d > 1.3 && d < 7.5 && Math.abs(L.cy - R.cy) / sc < 1.8 && !down(L) && !down(R);
    }
    if (!u.on) {
      const still = pose && L.speed < CONFIG.stillSpeed * 2.5 && R.speed < CONFIG.stillSpeed * 2.5;
      u.c = still && u.cool <= 0 ? u.c + dt / 0.85 * this.ctx.voice.boost : Math.max(0, u.c - dt * 2);
      if (u.c > 0.02) {
        u.x = mx; u.y = clamp(my + sc * 2.6, H * 0.5, H * 0.95);
        const c = Math.min(1, u.c);
        u.glow.set(u.x, u.y, sc * (2 + c * 5)); u.glow.intensity = 0.3 + c * 1.1; u.glow.tick(time);
        const r = sc * (3.4 - 2.4 * c), S2 = r / 0.4 + 12;
        u.ring.set(u.x, u.y, S2); u.ring.param(r / (S2 / 2), 4 / (S2 / 2), 0.05, 0); u.ring.intensity = 1 + c; u.ring.tick(time);
        sfx.loop('charge', c);
        Post.wantZoom(c * 0.05, u.x, u.y);
        Post.shake(dt * c);
        if (Math.random() < dt * 120 * c) {
          const a = rand(0, TAU), d = sc * rand(2, 4);
          this.ctx.streaks.spawn({ x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 6, vy: -Math.sin(a) * d * 6, drag: 0, life: 0.16, c: pick(this.pal), bright: 2, width: 2.5, stretch: 0.06, fade: 0.8 });
        }
        levels[0] = levels[1] = 0.2;
        if (u.c >= 1) this.fireUnibeam();
        return u.c > 0.15;
      }
      u.glow.intensity = 0; u.ring.intensity = 0; u.q.intensity = 0; u.core.intensity = 0;
      return false;
    }
    // firing
    u.t += dt;
    const DUR = this.suit.on ? 3.2 : 2.4;
    if (pose) {
      u.lost = 0;
      u.x = damp(u.x, mx, 6, dt); u.y = damp(u.y, clamp(my + sc * 2.6, H * 0.5, H * 0.95), 6, dt);
      let ax = mx - u.x, ay = (my - sc * 0.5) - u.y;
      const m = Math.hypot(ax, ay) || 1;
      u.dx = damp(u.dx, ax / m, 8, dt); u.dy = damp(u.dy, ay / m, 8, dt);
    } else u.lost += dt;
    const n = Math.hypot(u.dx, u.dy) || 1;
    const dx = u.dx / n, dy = u.dy / n;
    const e = toEdge(u.x, u.y, dx, dy, 40);
    const k = u.t < 0.12 ? u.t / 0.12 : u.t > DUR - 0.3 ? Math.max(0, (DUR - u.t) / 0.3) : 1;
    const wBeam = base * (0.13 + 0.02 * Math.sin(time * 40)) * k * this.pow;
    const ang = Math.atan2(dy, dx);
    u.q.set(u.x + dx * e.len / 2, u.y + dy * e.len / 2, e.len, Math.max(wBeam, 1), ang);
    u.q.param(1, 1, 0, 0); u.q.intensity = 2.4 * k; u.q.tick(time);
    u.core.set(u.x + dx * e.len / 2, u.y + dy * e.len / 2, e.len, Math.max(wBeam * 0.35, 1), ang);
    u.core.param(1, 1, 0, 0); u.core.intensity = 2 * k; u.core.tick(time);
    u.glow.set(u.x, u.y, base * 0.5 * k); u.glow.intensity = 1.3 * k; u.glow.tick(time);
    u.ring.intensity = 0;
    Post.wantDim(0.5 * k);
    Post.shake(dt * 2.2 * k);
    Post.aberrate(3 * k);
    overlay.speedLines(0.7 * k, u.x, u.y);
    sfx.loop('roar', 0.9 * k);
    sfx.loop('charge', 0.5 * k);
    // hex pulses racing down the beam
    if (Math.random() < dt * 30) {
      const d = rand(0.1, 0.9) * e.len, px = u.x + dx * d, py = u.y + dy * d, hw = wBeam * 0.7;
      this.ctx.lines.spawn(px - dy * hw, py + dx * hw, px + dy * hw, py - dx * hw, 4, this.pal[1], 2, 0.06);
    }
    // continuous destruction where it lands on screen
    u.boomT -= dt;
    const hx = clamp(e.x, 0, W), hy = clamp(e.y, 0, H);
    if (u.boomT <= 0 && k > 0.5) {
      u.boomT = 0.13;
      this.boom(hx + rand(-40, 40), hy + rand(-40, 40), 1.1, true);
      if (Math.random() < 0.4) overlay.smoke(hx, hy, 3, 1, { spread: 1.2, tint: [60, 64, 70], dur: 1.1, lobes: 3 });
    }
    for (let i = 0; i < 4; i++) this.spark(u.x + dx * rand(0, e.len), u.y + dy * rand(0, e.len), ang + rand(-0.4, 0.4), rand(600, 1600), { life: 0.2, drag: 0.5 });
    levels[0] = levels[1] = 0.25;
    if (u.t >= DUR || u.lost > 0.6) {
      u.on = false; u.c = 0; u.cool = 1.2;
      u.q.intensity = 0; u.core.intensity = 0; u.glow.intensity = 0;
      Post.flashScreen(0.2, this.cB);
      sfx.play('collapse');
    }
    return true;
  }

  fireUnibeam() {
    const u = this.uni, { fx, sfx, overlay } = this.ctx;
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    u.on = true; u.t = 0; u.lost = 0; u.dx = 0; u.dy = -1; u.boomT = 0.1;
    overlay.callout('胸部砲', 'Unibeam', { big: true, dur: 1.6 });
    sfx.play('repulsor'); sfx.play('nova');
    Post.impact(0.1, this.cB);
    Post.freeze(0.08);
    Post.flashScreen(0.35, this.cB);
    Post.punch(2, u.x, u.y);
    Post.shockwave({ x: u.x, y: u.y, speed: 1600, width: 110, strength: 50, life: 0.8 });
    fx.ring({ x: u.x, y: u.y, r0: 20, r1: diag * 0.7, dur: 0.7, width: 30, a: this.cA, b: this.cB, noise: 0.1, intensity: 2 });
    this.ctx.onMove('holo');
  }

  // ---------- Missile Volley ----------
  launch(h) {
    const { overlay, sfx, particles } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    const d = h.dir();
    let ax = d.x, ay = d.y;
    if (Math.hypot(ax, ay) < 0.2) { ax = 0; ay = -1; }
    const am = Math.hypot(ax, ay); ax /= am; ay /= am;
    const N = 7;
    overlay.callout('追尾弾', 'Missile Volley', { big: true, dur: 1.3 });
    sfx.play('missile');
    Post.shake(0.4);
    Post.aberrate(6);
    Post.flashScreen(0.12, this.cB);
    this.ctx.onMove('missile');
    this.after(1.1, () => {
      overlay.sfxText('BOOM!', W / 2, H * 0.3, 1.5, [255, 150, 40]);
      Post.impact(0.08, [1, 0.8, 0.5]);
      Post.freeze(0.06);
      Post.flashScreen(0.3, [1, 0.85, 0.6]);
    });
    for (let i = 0; i < N; i++) {
      // targets land in a spread around the flick direction
      const a = Math.atan2(ay, ax) + (i - (N - 1) / 2) * 0.24 + rand(-0.06, 0.06);
      const dist = diag * rand(0.32, 0.6);
      const tx = clamp(h.cx + Math.cos(a) * dist, W * 0.05, W * 0.95), ty = clamp(h.cy + Math.sin(a) * dist, H * 0.06, H * 0.9);
      // launch sideways off the hand, then curve in
      const la = Math.atan2(ay, ax) + (i - (N - 1) / 2) * 0.55 + rand(-0.1, 0.1) + (Math.random() < 0.5 ? 0.5 : -0.5);
      this.after(i * 0.07, () => {
        this.missiles.push({ x: h.tipX ?? h.cx, y: h.tipY ?? h.cy, a: la, sp: 420, tx, ty, t: 0, life: 2.4 });
        this.ctx.overlay.reticle(tx, ty, 90);
        sfx.play('lock');
        particles.spawn({ x: h.cx, y: h.cy, life: 0.2, c: this.pal[2], bright: 2, size: 60, size1: 10, fade: 1 });
      });
    }
  }

  updateMissiles(dt, time) {
    const { particles, streaks } = this.ctx;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += dt;
      const want = Math.atan2(m.ty - m.y, m.tx - m.x);
      let da = want - m.a;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      // turn rate tightens over time so they always find the target
      const turn = 3.2 + m.t * 6;
      m.a += clamp(da, -turn * dt, turn * dt);
      m.sp = Math.min(2500, m.sp + 3600 * dt);
      const vx = Math.cos(m.a) * m.sp, vy = Math.sin(m.a) * m.sp;
      m.x += vx * dt; m.y += vy * dt;
      // hot exhaust glow, solid smoke trail
      particles.spawn({ x: m.x - Math.cos(m.a) * 30, y: m.y - Math.sin(m.a) * 30, life: 0.12, c: [1, 0.6, 0.2], bright: 1.6, size: 26, size1: 8, fade: 1 });
      m.smk = (m.smk || 0) - dt;
      if (m.smk <= 0) {
        m.smk = 0.045;
        this.ctx.overlay.smoke(m.x - Math.cos(m.a) * 34, m.y - Math.sin(m.a) * 34, 1, 0.35, { spread: 0.15, dur: 0.8, lobes: 2, tint: [225, 228, 232] });
      }
      if (Math.hypot(m.tx - m.x, m.ty - m.y) < 34 || m.t > m.life) {
        this.fireball(m.x, m.y, 1);
        this.missiles.splice(i, 1);
      }
    }
    this.ctx.overlay.setMissiles(this.missiles);
    if (this.missiles.length) this.ctx.sfx.loop('roar', 0.2);
  }

  // ---------- HUD ----------
  toggleHud() {
    const h = this.hud;
    h.on = !h.on;
    const { overlay, sfx, fx } = this.ctx;
    sfx.play('hud');
    Post.flashScreen(0.15, this.cB);
    Post.aberrate(6);
    Post.glitchFor(0.3);
    overlay.callout('戦術', h.on ? 'HUD Online' : 'HUD Offline');
    if (h.on) this.ctx.onMove('hud');
    fx.ring({ x: window.innerWidth / 2, y: window.innerHeight / 2, r0: 10, r1: Math.hypot(window.innerWidth, window.innerHeight) * 0.5, dur: 0.5, width: 8, a: this.cA, b: this.cB, intensity: 1.4 });
  }

  updateHud(L, R, dt, time) {
    const h = this.hud;
    h.cool -= dt;
    h.k = damp(h.k, h.on ? 1 : 0, 6, dt);
    if (h.k < 0.01) return;
    const targets = [];
    for (const hh of [L, R]) {
      if (!hh.present) continue;
      targets.push({ x: hh.cx, y: hh.cy, r: hh.scale * 0.85, lock: hh.still ? clamp(hh.stillTime / 0.9, 0, 1) : 0.15, label: hh.slot === 'L' ? 'HAND-L' : 'HAND-R' });
    }
    for (const m of this.missiles) targets.push({ x: m.tx, y: m.ty, r: 34, lock: clamp(m.t / 0.6, 0, 1), label: 'TGT' });
    const bar = (v) => '▮'.repeat(Math.round(v * 8)).padEnd(8, '▯');
    this.ctx.overlay.setHud({
      k: h.k, gold: this.suit.on, targets,
      power: this.suit.on ? 1 : Math.max(0.35, this.power),
      alt: this.thrust.alt,
      lines: [
        this.suit.on ? 'MK-Ω  ARMORED' : 'MK-Ω  ONLINE',
        `REPULSOR  ${bar(this.power)}`,
        `THRUSTERS ${this.thrust.k > 0.3 ? 'ACTIVE' : 'STANDBY'}`,
        `MISSILES  ${this.missiles.length ? `IN FLIGHT ${this.missiles.length}` : 'READY'}`,
      ],
    });
    Post.wantEdge(0.1 * h.k, this.cA);
    Post.wantDim(0.06 * h.k);
  }

  // ---------- Thrusters ----------
  updateThrusters(L, R, dt, time, levels) {
    const t = this.thrust;
    const { overlay, sfx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    const ok = (h) => h.present && h.isOpen && h.pts[9].y - h.pts[0].y > h.scale * 0.6;
    const on = ok(L) && ok(R);
    t.k = damp(t.k, on ? 1 : 0, on ? 4 : 6, dt);
    if (t.k < 0.004) {
      t.k = 0;
      for (const st of Object.values(this.slots)) st.jet.intensity = 0;
      return false;
    }
    const k = t.k;
    if (k > 0.6 && !t.called) {
      t.called = 1;
      overlay.callout('飛行', 'Thrusters');
      sfx.play('repulsor');
      this.ctx.onMove('thrusters');
      Post.flashScreen(0.2, this.cB);
      Post.shake(0.5);
    }
    if (!on) t.called = k > 0.2 ? t.called : 0;
    t.alt += dt * 60 * k;
    for (const h of [L, R]) {
      if (!h.present) continue;
      const st = this.slots[h.slot];
      const len = H * (0.28 + 0.12 * k);
      st.jet.set(h.cx, h.cy + len / 2, len, Math.max(h.scale * 1.1, 1), Math.PI / 2);
      st.jet.param(0.4, 0.6, 0, 0);
      st.jet.intensity = 1.4 * k;
      st.jet.tick(time);
      const n = Math.floor(120 * k * dt + Math.random());
      for (let i = 0; i < n; i++) {
        this.ctx.streaks.spawn({
          x: h.cx + rand(-h.scale * 0.35, h.scale * 0.35), y: h.cy + h.scale * 0.2, vx: rand(-90, 90), vy: rand(1100, 2000),
          drag: 0.4, life: rand(0.18, 0.4), c: pick(this.pal), bright: 2, width: rand(2, 5), stretch: 0.05, fade: 1,
        });
      }
      if (Math.random() < dt * 40 * k) {
        this.ctx.particles.spawn({ x: h.cx, y: h.cy + h.scale, vx: rand(-60, 60), vy: rand(200, 500), drag: 1, life: rand(0.5, 0.9), c: [0.9, 0.95, 1], bright: 0.25, size: 20, size1: 70, fade: 1.3 });
      }
    }
    // you are rising: the world drifts down, the camera leans in
    Post.wantZoom(0.045 * k, W / 2, H * 0.6);
    Post.shake(dt * 0.7 * k);
    Post.wantAura(0.5 * k, this.cA, this.cB);
    Post.wantEdge(0.2 * k, this.cA);
    overlay.speedLines(0.35 * k, W / 2, H * 0.3);
    sfx.loop('jet', k);
    levels[0] = Math.max(levels[0], 0.9 + k * 0.5);
    levels[1] = Math.max(levels[1], 0.9 + k * 0.5);
    return true;
  }

  // ---------- Suit-Up ----------
  updateSuit(L, R, dt, time, levels) {
    const s = this.suit;
    const { overlay, sfx, fx, streaks } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    s.cool -= dt;
    let hold = false;
    if (L.present && R.present && L.fist && R.fist) {
      const sc = (L.scale + R.scale) / 2;
      if (Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc < CONFIG.touchDist * 1.4) {
        hold = true;
        s.hx = (L.cx + R.cx) / 2; s.hy = (L.cy + R.cy) / 2; s.hs = sc;
      }
    }
    s.hold = hold && s.cool <= 0 ? s.hold + dt * this.ctx.voice.boost : Math.max(0, s.hold - dt * 2);
    if (s.hold > 0.02) {
      const c = clamp(s.hold / 1.0, 0, 1);
      s.glow.set(s.hx, s.hy, s.hs * (3 + c * 5));
      s.glow.intensity = (0.4 + c) * 1.1;
      s.glow.tick(time);
      const r = s.hs * (3.2 - 2 * c), S = r / 0.4 + 12;
      s.ring.set(s.hx, s.hy, S); s.ring.param(r / (S / 2), 3 / (S / 2), 0.05, 0);
      s.ring.intensity = 1 + c; s.ring.tick(time);
      sfx.loop('charge', c);
      Post.wantZoom(c * 0.04, s.hx, s.hy);
      Post.shake(dt * c * 0.8);
      if (Math.random() < dt * 80 * c) this.spark(s.hx + rand(-1, 1) * s.hs * 2, s.hy + rand(-1, 1) * s.hs * 2, rand(0, TAU), rand(200, 600), { life: 0.3 });
      if (s.hold >= 1.0) this.suitUp(s.hx, s.hy);
    } else {
      s.glow.intensity = s.on ? 0 : 0;
      s.ring.intensity = 0;
    }
    if (s.on) {
      s.t += dt;
      // arc reactor glowing on the chest
      const rx = W / 2, ry = H * 0.64;
      s.glow.set(rx, ry, Math.min(W, H) * 0.32);
      s.glow.intensity = 0.55 + Math.sin(time * 5) * 0.06;
      s.glow.tick(time);
      Post.wantAura(0.55 * clamp((SUIT_TIME - s.t) / 2, 0, 1), this.cA, this.cB);
      Post.wantEdge(0.15, this.cA);
      levels[0] = Math.max(levels[0], 0.9);
      levels[1] = Math.max(levels[1], 0.9);
      if (s.t > SUIT_TIME) this.suitDown();
    }
    return s.hold > 0.05;
  }

  suitUp(x, y) {
    const s = this.suit;
    const { overlay, sfx, fx, streaks } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    s.hold = 0; s.cool = 2; s.on = true; s.t = 0;
    if (!this.hud.on) { this.hud.on = true; this.ctx.sfx.play('hud'); }
    this.recolor();
    const cx = W / 2, cy = H * 0.58;
    overlay.callout('装着', 'Suit-Up', { big: true, dur: 1.9 });
    sfx.play('suit');
    // armor plates fly in from all sides and lock onto the body
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * TAU + rand(-0.1, 0.1);
      const sx = cx + Math.cos(a) * diag * 0.7, sy = cy + Math.sin(a) * diag * 0.7;
      const tx = cx + rand(-0.16, 0.16) * W, ty = cy + rand(-0.3, 0.3) * H;
      const d = Math.hypot(tx - sx, ty - sy);
      const sp = rand(2200, 3400);
      this.after(rand(0, 0.55), () => {
        overlay.plate(sx, sy, tx, ty, d / sp * 1.6, i % 3 === 0 ? [205, 160, 50] : [190, 30, 38]);
        streaks.spawn({ x: sx, y: sy, vx: ((tx - sx) / d) * sp, vy: ((ty - sy) / d) * sp, drag: 0, life: d / sp, c: pick(GOLD), bright: 1.4, width: rand(2, 4), stretch: 0.03, fade: 0.3 });
        this.after(d / sp * 1.6, () => {
          fx.ring({ x: tx, y: ty, r0: 4, r1: 60, dur: 0.25, width: 6, a: GOLD[0], b: GOLD[2], intensity: 1.6 });
          for (let k = 0; k < 6; k++) this.spark(tx, ty, rand(0, TAU), rand(150, 500), { life: 0.25, width: 2 });
          Post.shake(0.05);
        });
      });
    }
    this.after(1.15, () => {
      Post.impact(0.12, GOLD[2]);
      Post.flashScreen(0.35, GOLD[2]);
      Post.freeze(0.1);
      Post.shake(1);
      Post.punch(2.2, cx, cy);
      Post.aberrate(14);
      Post.bloom(2.4);
      Post.shockwave({ x: cx, y: cy, speed: 1700, width: 110, strength: 52, life: 0.9 });
      fx.ring({ x: cx, y: cy, r0: 20, r1: diag * 0.8, dur: 0.8, width: 36, a: GOLD[0], b: GOLD[2], noise: 0.1, intensity: 2.4 });
      fx.glow({ x: cx, y: cy, s0: 80, s1: diag * 0.7, dur: 0.45, a: GOLD[0], b: GOLD[2], intensity: 2 });
      overlay.sfxText('ONLINE', cx, cy + Math.min(W, H) * 0.12, 1.2, [255, 200, 60]);
      for (let i = 0; i < 160; i++) this.spark(cx, cy, rand(0, TAU), rand(600, 2400), { life: rand(0.3, 0.8), width: rand(2, 4) });
      this.ctx.phys.blast(cx, cy, 900, 2400);
      this.ctx.phys.burst(cx, cy, 26, 'red', { speed: 1400, size: 15, up: 500, kinds: ['red', 'gold', 'steel'] });
    });
    this.ctx.onMove('suit');
  }

  suitDown() {
    const s = this.suit;
    s.on = false;
    this.recolor();
    this.ctx.sfx.play('collapse');
    this.ctx.overlay.callout('鋼', 'Suit Offline', { dur: 0.9 });
    Post.flashScreen(0.2, CH.b);
    s.glow.intensity = 0;
    s.glow.u.uColorA.value.set(...GOLD[0]);
  }
}

function other(h, L, R) { return h === L ? R : L; }
