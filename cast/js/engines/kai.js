// Kai: a ki fighter. Energy is gathered, compressed and released: charged
// beams, a sphere fed from the whole screen, rapid blasts, and a power-up
// that pushes every other move further.
import { CONFIG, CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad, Trail, bolt } from '../render/objects.js';
import { clamp, rand, pick, lerp, TAU, damp, easeInCubic, easeOutCubic } from '../util.js';

const CH = CHARACTERS.kai;
const BLUE = [[0.3, 0.65, 1], [0.5, 0.8, 1], [0.8, 0.93, 1], [0.2, 0.5, 1]];
const GOLD = [[1, 0.72, 0.15], [1, 0.84, 0.35], [1, 0.95, 0.7], [1, 0.6, 0.1]];
const AWAKE_TIME = 20;

function toEdge(x, y, dx, dy, pad = 60) {
  const W = window.innerWidth + pad, H = window.innerHeight + pad;
  let t = 1e9;
  if (dx > 0) t = Math.min(t, (W - x) / dx); else if (dx < 0) t = Math.min(t, (-pad - x) / dx);
  if (dy > 0) t = Math.min(t, (H - y) / dy); else if (dy < 0) t = Math.min(t, (-pad - y) / dy);
  if (!isFinite(t) || t > 1e8) t = 0;
  return { x: x + dx * t, y: y + dy * t, len: t };
}

export class Kai {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    this.slots = {};
    for (const s of ['L', 'R']) {
      this.slots[s] = {
        cool: 0, stepCool: 0,
        aura: new FXQuad(S, 'aura', { a: CH.gold, b: CH.goldB, intensity: 0, param: [1, 0, 0, 0] }),
      };
    }
    this.wave = {
      t: 0, level: 0, phase: 'idle', fireT: 0, dur: 0, x: 0, y: 0, dx: 1, dy: 0, sc: 80, w: 0, mode: 'lateral', lost: 0,
      orb: new FXQuad(S, 'kiOrb', { a: CH.a, b: CH.b, intensity: 0 }),
      beam: new FXQuad(S, 'beam', { a: CH.a, b: CH.b, intensity: 0 }),
      beam2: new FXQuad(S, 'beam', { a: CH.a, b: CH.b, intensity: 0 }),
      ringT: 0, calloutDone: false,
    };
    this.sphere = {
      t: 0, on: false, level: 0, x: 0, y: 0, r: 0, lost: 0, thrown: null,
      orb: new FXQuad(S, 'kiOrb', { a: CH.a, b: CH.b, intensity: 0, param: [0, 1, 0, 0] }),
    };
    this.aw = { t: 0, awake: 0, charging: 0, boltT: 0 };
    this.shots = [];
    this.bullets = [];
    this.timers = [];
    this.barrageCool = 0;
    this.lines = { t: 0, x: 0, y: 0 };
  }

  get awake() { return this.aw.awake > 0; }
  get pal() { return this.awake ? GOLD : BLUE; }
  get cA() { return this.awake ? CH.gold : CH.a; }
  get cB() { return this.awake ? CH.goldB : CH.b; }
  get pow() { return this.awake ? 1.4 : 1; }

  enter() {}

  exit() {
    for (const st of Object.values(this.slots)) st.aura.intensity = 0;
    const w = this.wave;
    w.phase = 'idle'; w.t = 0; w.level = 0;
    w.orb.intensity = 0; w.beam.intensity = 0; w.beam2.intensity = 0;
    const s = this.sphere;
    s.t = 0; s.on = false; s.level = 0; s.thrown = null; s.orb.intensity = 0;
    this.aw.t = 0; this.aw.awake = 0; this.aw.charging = 0;
    if (this.disc) { this.disc.ph = 0; this.disc.k = 0; }
    this.ctx.overlay.setCharacter(CH);
    this.bullets.forEach((b) => { b.q.dispose(); b.trail.dispose(); });
    this.bullets.length = 0;
    this.timers.length = 0;
    this.shots.length = 0;
  }

  after(t, fn) { this.timers.push({ t, fn }); }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, grav: o.grav ?? 0, drag: o.drag ?? 2,
      life: o.life ?? rand(0.25, 0.55), c: pick(this.pal), bright: o.bright ?? 2.2,
      width: o.width ?? rand(1.5, 3), stretch: o.stretch ?? 0.03, fade: 1.2, fn: o.fn,
    });
  }

  mote(x, y, o = {}) {
    return this.ctx.particles.spawn({
      x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, grav: o.grav ?? 0, drag: o.drag ?? 0,
      life: o.life ?? 0.6, c: pick(this.pal), bright: o.bright ?? 1.2, size: o.size ?? 6, size1: o.size1 ?? 2,
      fade: 0.8, flicker: 0.2, fn: o.fn,
    });
  }

  // Particle homing into a moving target; dies on arrival.
  homing(target, kill) {
    return (p) => {
      const dx = target.x - p.x, dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const v = 500 + 140000 / Math.max(d, 40);
      p.vx = (dx / d) * v - (dy / d) * v * 0.18;
      p.vy = (dy / d) * v + (dx / d) * v * 0.18;
      if (d < kill()) p.life = 0;
    };
  }

  update(dt, time, hands) {
    this.now = time;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const levels = [0.35, 0.35];
    const busyWave = this.updateWave(hands, dt, time, levels);
    const busySphere = this.updateSphere(hands, dt, time, levels);
    const busyAw = this.updateAwaken(hands, dt, time, levels);
    const busy = busyWave || busySphere || busyAw;
    this.updateDisc(hands, dt, time, levels);
    this.updateHand(this.slots.L, hands.L, dt, time, busy, levels, 0);
    this.updateHand(this.slots.R, hands.R, dt, time, busy, levels, 1);
    this.updateBullets(dt, time);
    if (this.lines.t > 0) {
      this.lines.t -= dt;
      this.ctx.overlay.speedLines(Math.min(1, this.lines.t * 3), this.lines.x, this.lines.y);
    }
    return levels;
  }

  // ---------- Destructo Disc ----------
  // Point a finger and hold: a razor disc spins up over the tip. Flick to
  // throw it. It slices whatever it crosses and bursts at the edge.
  updateDisc(hands, dt, time, levels) {
    const D = this.disc || (this.disc = { ph: 0, k: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0, cool: 0, spin: 0, cutT: 0, x0: 0, y0: 0 });
    const { phys, overlay, sfx, fx, lines } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    D.cool -= dt;
    D.spin += dt * (D.ph === 2 ? 40 : 14 + D.k * 20);
    // Krillin's sign: one open palm raised straight up, above your head
    const I = phys.body?.info;
    const headY = I && I.ok ? I.top + H * 0.05 : H * 0.34;
    const raised = (q) => q.present && q.open > 0.55 && q.uy < -0.55 && q.cy < headY;
    const up = [hands.L, hands.R].filter(raised);
    const h = up.length === 1 ? up[0] : null;
    D.hold = h && h.still ? (D.hold || 0) + dt : 0;
    if (h && D.ph === 0 && D.cool <= 0) overlay.chip(h.cx, h.cy + h.scale * 1.8, 'DESTRUCTO DISC', clamp(D.hold / 0.35, 0, 1));
    const drawDisc = (x, y, R, ang, k) => {
      const N = 22, tilt = 0.28;
      for (const [rr, w, ii] of [[1, 3.2, 2.4 * k], [0.72, 2, 1.6 * k]]) {
        let px, py;
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * TAU + D.spin * 0.05;
          const ex = Math.cos(a) * R * rr, ey = Math.sin(a) * R * rr * tilt;
          const qx = x + ex * Math.cos(ang) - ey * Math.sin(ang), qy = y + ex * Math.sin(ang) + ey * Math.cos(ang);
          if (i) lines.spawn(px, py, qx, qy, w * 1.6, this.pal[0], ii * 1.5, 0.09);
          px = qx; py = qy;
        }
      }
      fx.glow({ x, y, s0: R * 0.8, s1: R * 1.5, dur: 0.09, a: CH.a, b: CH.b, intensity: 1.6 * k });
    };
    if (D.ph === 0) {
      if (h && D.cool <= 0 && D.hold > 0.35 && !this.wave.level) { D.ph = 1; D.hand = h; }
    }
    if (D.ph === 1) {
      const h = D.hand;
      if (!h || !h.present) { D.ph = 0; D.k = 0; return; }
      D.k = Math.min(1, D.k + dt / 0.8);
      if (h.uy < -0.3) { D.x = h.pts[12].x; D.y = h.pts[12].y - h.scale * 0.9; }
      const R = h.scale * (0.7 + D.k * 1.5);
      drawDisc(D.x, D.y, R, -0.15 + Math.sin(time * 2) * 0.05, D.k);
      if (D.k < 1 && Math.random() < 0.6) this.spark(D.x + rand(-R, R) * 1.6, D.y + rand(-R, R) * 1.6, 0, 0, { life: 0.15 });
      sfx.loop('charge', D.k * 0.6);
      Post.wantAura(D.k * 0.35, CH.a, CH.b);
      Post.wantDim(D.k * 0.3);
      levels[0] = Math.max(levels[0], 0.8 + D.k); levels[1] = Math.max(levels[1], 0.8 + D.k);
      if (D.k >= 1 && !D.ready) { D.ready = true; overlay.callout('気円斬', 'Destructo Disc'); sfx.play('ready'); Post.bloom(1.2); }
      if (D.k > 0.6 && (h.flick || h.thrust || h.speed > CONFIG.stillSpeed * 6)) {
        let dx = h.vx, dy = h.vy, m = Math.hypot(dx, dy);
        if (m < 60) { dx = h.pdx; dy = h.pdy; m = 1; }
        D.vx = (dx / m) * 2100; D.vy = (dy / m) * 2100;
        D.ph = 2; D.t = 0; D.ready = false; D.R = R; D.x0 = D.x; D.y0 = D.y; D.cutT = 0;
        Post.freeze(0.07); Post.shake(0.7); Post.aberrate(10); Post.bloom(1.8); Post.flashScreen(0.25, [1, 1, 1]);
        sfx.play('beam', 1); this.ctx.onMove(5);
        this.lines = { t: 0.4, x: D.x, y: D.y };
      }
      return;
    }
    if (D.ph === 2) {
      D.t += dt;
      D.x += D.vx * dt; D.y += D.vy * dt;
      const ang = Math.atan2(D.vy, D.vx);
      drawDisc(D.x, D.y, D.R, ang, 1.4);
      // the cut it leaves: a hairline that lingers
      lines.spawn(D.x0, D.y0, D.x, D.y, 2.2, CH.b, 1.6, 0.25);
      D.cutT -= dt;
      if (D.cutT <= 0) {
        D.cutT = 0.03;
        const nx = -Math.sin(ang), ny = Math.cos(ang), sg = Math.random() < 0.5 ? -1 : 1;
        phys.shard(D.x, D.y, nx * sg * rand(300, 800) + D.vx * 0.15, ny * sg * rand(300, 800) + D.vy * 0.15, pick(['glass', 'steel', 'rock']), rand(8, 18), {});
        for (let i = 0; i < 2; i++) this.spark(D.x, D.y, ang + Math.PI + rand(-0.6, 0.6), rand(300, 900), { life: 0.2 });
        phys.push(D.x, D.y, D.vx / 2100, D.vy / 2100, 120, D.R * 1.2, 900);
      }
      Post.shake(dt * 0.6);
      sfx.loop('beam', 0.4);
      const off = D.x < -60 || D.x > W + 60 || D.y < -60 || D.y > H + 60;
      if (off || D.t > 1.8) {
        const ex = clamp(D.x, 20, W - 20), ey = clamp(D.y, 20, H - 20);
        this.boom(ex, ey, 1.1);
        phys.blast(ex, ey, base * 0.5, 2200);
        phys.burst(ex, ey, 14, 'glass', { speed: 1100, size: 12, up: 400, kinds: ['glass', 'steel', 'rock'] });
        overlay.sfxText('ZUBAAN!', ex, ey, 1.2, [150, 220, 255]);
        D.ph = 0; D.k = 0; D.cool = 1.2;
      }
    }
  }

  // ---------- Ki Barrage + Instant Step + aura ----------
  updateHand(st, h, dt, time, busy, levels, idx) {
    const { sfx, overlay } = this.ctx;
    st.cool -= dt;
    st.stepCool -= dt;
    this.barrageCool -= dt / 2;
    if (!h.present) { st.aura.intensity = 0; return; }

    if (!busy && h.isOpen && (h.flick || h.thrust) && st.cool <= 0) {
      const toCam = h.thrust && !h.flick;
      this.blast(h, toCam);
      st.cool = 0.12;
    }

    // two fingers to the forehead: Instant Transmission
    const I = this.ctx.phys.body?.info;
    const nearHead = !I || !I.ok || Math.hypot(h.tipX - I.hx, h.tipY - I.hy) < h.scale * 2.4;
    if (!busy && h.two && nearHead && h.twoTime > 0.3 && h.still && st.stepCool <= 0) {
      this.instantStep(h);
      st.stepCool = 1.4;
    }

    // Awakened aura wraps each hand in rising golden flame.
    const awk = this.awake ? Math.min(1, this.aw.awake / 1.5) : 0;
    const charging = this.aw.charging;
    const idle = 0.28;
    const a = Math.max(awk * 0.8, charging, idle);
    const gold = awk > 0 || charging > 0.05;
    st.aura.u.uColorA.value.set(...(gold ? CH.gold : CH.a));
    st.aura.u.uColorB.value.set(...(gold ? CH.goldB : CH.b));
    if (a > 0.01) {
      const s = h.scale * (2.6 + charging * 1.0);
      st.aura.set(h.cx, h.cy - s * 0.18, s * 0.9, s * 1.25);
      st.aura.param(1, 0.4 + charging * 0.6, 0, 0);
      st.aura.intensity = a * 0.75;
      st.aura.tick(time);
      if (Math.random() < a * 0.9) {
        this.mote(h.cx + rand(-1, 1) * h.scale * 1.2, h.cy + rand(-0.3, 1) * h.scale, {
          vy: rand(-420, -200), vx: rand(-30, 30), life: rand(0.35, 0.7), size: rand(5, 11), size1: 1, bright: 1.3,
        });
      }
      if (Math.random() < dt * (awk * 5 + charging * 14)) {
        const p = h.pts[(Math.random() * 21) | 0];
        const ang = rand(0, TAU), L = h.scale * rand(0.8, 2);
        bolt(this.ctx.lines, p.x, p.y, p.x + Math.cos(ang) * L, p.y + Math.sin(ang) * L, { c: CH.goldB, width: 2, depth: 4, branch: 0.2, life: 0.06 });
      }
      if (gold) levels[idx] = Math.max(levels[idx], 0.6 + a);
    } else {
      st.aura.intensity = 0;
    }
  }

  blast(h, toCam) {
    const { sfx, scene, fx, overlay } = this.ctx;
    const x = lerp(h.cx, h.pts[9].x, 0.4), y = lerp(h.cy, h.pts[9].y, 0.4);
    const d = h.dir();
    const size = h.scale * 0.9 * this.pow;
    const q = new FXQuad(scene, 'kiOrb', { a: this.cA, b: this.cB, intensity: 1.2 });
    q.param(1, 0.5, 0, 0);
    this.bullets.push({
      q, trail: new Trail(scene, { width: size * 0.7, life: 0.12, fire: false, a: this.cA, b: this.cB }),
      x, y, sx: x, sy: y, vx: d.x * 2600, vy: d.y * 2600, t: 0, life: toCam ? 0.3 : 1.0, size, mode: toCam ? 'camera' : 'lateral',
    });
    fx.glow({ x, y, s0: size, s1: size * 3, dur: 0.15, a: this.cA, b: this.cB, intensity: 2 });
    Post.shake(0.12);
    Post.punch(0.4, x, y);
    sfx.play('kiblast');
    const now = this.now || 0;
    this.shots.push(now);
    while (this.shots.length && now - this.shots[0] > 1.6) this.shots.shift();
    if (this.shots.length >= 3 && this.barrageCool <= 0) {
      overlay.callout('気弾連射', 'Ki Barrage');
      this.ctx.onMove(2);
      this.barrageCool = 3;
      this.lines = { t: 0.3, x, y };
    }
  }

  updateBullets(dt, time) {
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.t += dt;
      let s = b.size;
      if (b.mode === 'lateral') {
        b.x += b.vx * dt; b.y += b.vy * dt;
      } else {
        const k = easeInCubic(Math.min(1, b.t / b.life));
        b.x = lerp(b.sx, W / 2, k * 0.5); b.y = lerp(b.sy, H / 2, k * 0.5);
        s = b.size + (Math.max(W, H) * 0.9 - b.size) * k;
      }
      b.q.set(b.x, b.y, s);
      b.q.tick(time);
      b.trail.push(b.x, b.y, time);
      b.trail.update(time);
      if (Math.random() < 0.6) this.spark(b.x, b.y, Math.atan2(-b.vy, -b.vx) + rand(-0.4, 0.4), rand(200, 500), { life: 0.2 });
      const off = b.x < -60 || b.x > W + 60 || b.y < -60 || b.y > H + 60;
      if (b.t >= b.life || (b.mode === 'lateral' && off)) {
        this.pop(clamp(b.x, 0, W), clamp(b.y, 0, H), b.mode === 'camera' ? 1.6 : 0.7);
        b.q.dispose(); b.trail.dispose();
        this.bullets.splice(i, 1);
      }
    }
  }

  pop(x, y, power) {
    const { fx, sfx } = this.ctx;
    const base = Math.min(window.innerWidth, window.innerHeight);
    power *= this.pow;
    fx.glow({ x, y, s0: base * 0.05, s1: base * 0.5 * power, dur: 0.3, a: this.cA, b: this.cB, intensity: 2.6 });
    fx.ring({ x, y, r0: 10, r1: base * 0.3 * power, dur: 0.35, width: 12, a: this.cA, b: this.cB, intensity: 1.8 });
    Post.shockwave({ x, y, speed: 1000, width: 50, strength: 18 * power, life: 0.45 });
    Post.shake(0.2 * power);
    Post.bloom(0.8 * power);
    if (power > 1.2) { Post.flashScreen(0.25, this.cB); Post.aberrate(6); }
    for (let i = 0; i < 26 * power; i++) this.spark(x, y, rand(0, TAU), rand(300, 1000) * power);
    sfx.play('explode', 0.6);
  }

  instantStep(h) {
    const { sfx, overlay, fx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    Post.afterimage(0.85, (h.cx < W / 2 ? 1 : -1) * 1100);
    Post.glitchFor(0.9);
    Post.freeze(0.05);
    Post.flashScreen(0.3, this.cB);
    Post.aberrate(16);
    Post.punch(1.2, h.cx, h.cy);
    Post.shockwave({ x: h.cx, y: h.cy, speed: 1500, width: 50, strength: 22, life: 0.45 });
    fx.glow({ x: h.cx, y: h.cy, s0: h.scale, s1: h.scale * 7, dur: 0.25, a: this.cA, b: [1, 1, 1], intensity: 3 });
    // horizontal zip lines tear across the frame
    for (let i = 0; i < 40; i++) {
      const y = rand(0, H), dir = Math.random() < 0.5 ? 1 : -1;
      this.ctx.streaks.spawn({
        x: dir > 0 ? rand(-200, W * 0.3) : rand(W * 0.7, W + 200), y, vx: dir * rand(2500, 5000), vy: 0,
        life: rand(0.12, 0.25), c: pick(this.pal), bright: 2, width: rand(1, 3), stretch: 0.05, fade: 1,
      });
    }
    this.after(0.14, () => { Post.glitchFor(0.5); Post.flashScreen(0.15, [1, 1, 1]); });
    overlay.callout('瞬間移動', 'Instant Transmission');
    sfx.play('step');
    this.ctx.onMove(4);
  }

  // ---------- Ki Wave ----------
  updateWave(hands, dt, time, levels) {
    const w = this.wave, L = hands.L, R = hands.R;
    const { sfx, overlay, fx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    let together = false, sc = w.sc;
    if (L.present && R.present) {
      sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      together = d < CONFIG.touchDist * 1.45 && !L.fist && !R.fist && !L.point && !R.point;
      if (together) {
        const mx = (L.cx + R.cx) / 2, my = (L.cy + R.cy) / 2;
        w.x = w.t > 0 ? damp(w.x, mx, 18, dt) : mx;
        w.y = w.t > 0 ? damp(w.y, my, 18, dt) : my;
        w.sc = sc;
      }
    }

    if (w.phase === 'idle' || w.phase === 'charge') {
      const calm = together && L.speed < CONFIG.stillSpeed * 3 && R.speed < CONFIG.stillSpeed * 3;
      if (calm) { w.t += dt * this.ctx.voice.boost; w.lost = 0; } else { w.lost += dt; }
      if (w.phase === 'idle' && w.t > 0.35) {
        w.phase = 'charge';
        sfx.play('ready');
      }
      if (w.phase === 'charge') {
        w.level = clamp((w.t - 0.35) / 1.8, 0, 1);
        // Fire: both hands shove the same way, or thrust at the lens.
        if (together && w.level > 0.2) {
          const avx = (L.vx + R.vx) / 2, avy = (L.vy + R.vy) / 2;
          const sp = Math.hypot(avx, avy) / sc;
          const thrust = L.thrust || R.thrust || (L.scaleRate + R.scaleRate) / 2 > CONFIG.thrustRate;
          if (thrust && sp < CONFIG.swipeSpeed * 1.2) this.fireWave('camera', 0, 0);
          else if (sp > CONFIG.swipeSpeed * 0.85) this.fireWave('lateral', avx, avy);
        }
        if (w.phase === 'charge' && w.lost > 0.3) {
          w.phase = 'idle'; w.t = 0;
        }
      } else if (w.lost > 0.2) {
        w.t = 0;
      }
    }

    if (w.phase === 'charge') {
      const lv = w.level;
      const s = w.sc * (0.7 + lv * 1.9) * this.pow;
      w.orb.u.uColorA.value.set(...this.cA);
      w.orb.u.uColorB.value.set(...this.cB);
      w.orb.set(w.x, w.y, s * 1.8);
      w.orb.param(lv, lv, 0, 0);
      w.orb.intensity = 0.5 + lv * 0.6;
      w.orb.tick(time);
      const n = Math.floor((40 + lv * 160) * dt + Math.random());
      const tgt = w;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = w.sc * rand(2.5, 5 + lv * 3);
        this.spark(w.x + Math.cos(a) * d, w.y + Math.sin(a) * d, 0, 0, { life: 0.5, fn: this.homing(tgt, () => s * 0.2), drag: 0, width: rand(1.5, 2.5) });
      }
      w.ringT -= dt;
      if (w.ringT <= 0) {
        w.ringT = 0.35 - lv * 0.2;
        fx.ring({ x: w.x, y: w.y, r0: s * 2.2, r1: s * 0.4, dur: 0.3, width: 6, a: this.cA, b: this.cB, intensity: 1.2 });
      }
      if (lv > 0.5 && Math.random() < lv * 0.4) {
        const a = rand(0, TAU);
        bolt(this.ctx.lines, w.x, w.y, w.x + Math.cos(a) * s * 1.4, w.y + Math.sin(a) * s * 1.4, { c: this.cB, width: 2, depth: 4, branch: 0.2, life: 0.05 });
      }
      // debris lifting off the floor as the charge peaks
      if (lv > 0.4 && Math.random() < lv) {
        this.ctx.particles.spawn({ x: rand(0, W), y: H + 10, vy: rand(-300, -120), vx: rand(-20, 20), life: rand(1, 2),
          c: [0.6, 0.62, 0.7], bright: 0.5, size: rand(3, 7), fade: 0.5 });
      }
      sfx.loop('charge', 0.35 + lv * 0.65);
      if (lv > 0.3) sfx.loop('drone', lv * 0.6);
      Post.wantZoom(0.03 + lv * 0.13, w.x, w.y);
      Post.wantAura(0.2 + lv * 0.7, this.cA, this.cB);
      Post.wantDim(0.25 + lv * 0.45);
      Post.shake(dt * (0.3 + lv * 1.4));
      overlay.letterbox(lv);
      if (lv > 0.8) overlay.speedLines((lv - 0.8) * 3, w.x, w.y);
      if (lv > 0.95 && !w.calloutDone) {
        w.calloutDone = true;
        overlay.callout('気', 'Full Power', { dur: 0.9 });
      }
      levels[0] = Math.max(levels[0], 0.6 + lv * 1.2);
      levels[1] = Math.max(levels[1], 0.6 + lv * 1.2);
      return true;
    }
    w.calloutDone = false;

    if (w.phase === 'fire') {
      w.fireT += dt;
      const k = w.fireT / w.dur;
      if (together) { w.x = damp(w.x, (L.cx + R.cx) / 2, 12, dt); w.y = damp(w.y, (L.cy + R.cy) / 2, 12, dt); }
      const env = Math.min(1, w.fireT / 0.12) * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
      if (w.mode === 'lateral') {
        const e = toEdge(w.x, w.y, w.dx, w.dy, 200);
        const width = w.w * env * (1 + 0.06 * Math.sin(time * 70));
        const ang = Math.atan2(w.dy, w.dx);
        w.beam.set(w.x + w.dx * e.len / 2, w.y + w.dy * e.len / 2, e.len, Math.max(width, 1), ang);
        w.beam.param(1, 1, 0, 0);
        w.beam.intensity = 1.1 * env;
        w.beam.tick(time);
        w.beam2.set(w.x + w.dx * e.len / 2, w.y + w.dy * e.len / 2, e.len, Math.max(width * 1.6, 1), ang);
        w.beam2.intensity = 0.22 * env;
        w.beam2.tick(time + 3.1);
        w.orb.set(w.x, w.y, w.w * 2.4 * env);
        w.orb.intensity = 0.9 * env;
        w.orb.tick(time);
        // spiral streaks riding the beam
        const n = Math.floor(90 * dt * env + Math.random());
        for (let i = 0; i < n; i++) {
          const off = rand(-0.6, 0.6) * width;
          this.spark(w.x - w.dy * off, w.y + w.dx * off, ang + rand(-0.05, 0.05), rand(2500, 4000), { life: rand(0.2, 0.4), drag: 0, width: rand(2, 4), stretch: 0.02 });
        }
        w.ringT -= dt;
        if (w.ringT <= 0) {
          w.ringT = 0.09;
          const t = rand(0.1, 0.8) * e.len;
          fx.ring({ x: w.x + w.dx * t, y: w.y + w.dy * t, r0: width * 0.4, r1: width * 1.3, dur: 0.2, width: 5, a: this.cA, b: this.cB, intensity: 1.3 });
        }
        // the wall it hits keeps erupting
        const hx = clamp(e.x, 0, W), hy = clamp(e.y, 0, H);
        if (Math.random() < 0.5) Post.shockwave({ x: hx, y: hy, speed: 900, width: 50, strength: 14, life: 0.35 });
        for (let i = 0; i < 3; i++) this.spark(hx, hy, rand(0, TAU), rand(500, 1500), { life: 0.35 });
        Post.shake(dt * 2.2 * env);
        Post.wantDim(0.55 * env);
        Post.bloom(0.5 * env);
        this.ctx.overlay.speedLines(0.8 * env, w.x, w.y);
        this.ctx.overlay.letterbox(env);
        sfx.loop('beam', env);
      } else {
        // Straight at the viewer: a tunnel of rings rushing past the lens.
        const g = easeOutCubic(Math.min(1, w.fireT / 0.4));
        const cx = w.x + (W / 2 - w.x) * g * 0.4, cy = w.y + (H / 2 - w.y) * g * 0.4;
        w.orb.set(cx, cy, w.w * 2.2 + diag * 0.45 * g);
        w.orb.param(0.3, 1, 0, 0);
        w.orb.intensity = 0.45 * env;
        w.orb.tick(time);
        w.ringT -= dt;
        if (w.ringT <= 0) {
          w.ringT = 0.07;
          fx.ring({ x: cx, y: cy, r0: w.w * 0.8, r1: diag * 0.9, dur: 0.45, width: 18, a: this.cA, b: this.cB, noise: 0.1, intensity: 1.1 * env });
        }
        const n = Math.floor(160 * dt * env + Math.random());
        for (let i = 0; i < n; i++) this.spark(cx, cy, rand(0, TAU), rand(1500, 3500), { life: 0.35, drag: 0, width: rand(2, 5) });
        if (Math.random() < 0.3) Post.shockwave({ x: cx, y: cy, speed: 1600, width: 60, strength: 16, life: 0.4 });
        Post.shake(dt * 3 * env);
        Post.wantDim(0.6 * env);
        Post.bloom(0.4 * env);
        this.ctx.overlay.speedLines(env, cx, cy);
        sfx.loop('beam', env);
      }
      levels[0] = Math.max(levels[0], 1.8);
      levels[1] = Math.max(levels[1], 1.8);
      if (w.fireT >= w.dur) this.endWave();
      return true;
    }

    w.orb.intensity = 0; w.beam.intensity = 0; w.beam2.intensity = 0;
    return false;
  }

  fireWave(mode, vx, vy) {
    const w = this.wave;
    const { sfx, overlay, fx } = this.ctx;
    const lv = w.level;
    w.phase = 'fire';
    w.mode = mode;
    w.fireT = 0;
    w.dur = (0.9 + lv * 1.6) * (mode === 'camera' ? 0.55 : 1) * (this.awake ? 1.3 : 1);
    const m = Math.hypot(vx, vy) || 1;
    w.dx = vx / m; w.dy = vy / m;
    w.w = w.sc * (0.9 + lv * 1.1) * this.pow * (1 + this.ctx.voice.peak * 0.5);
    w.beam.u.uColorA.value.set(...this.cA); w.beam.u.uColorB.value.set(...this.cB);
    w.beam2.u.uColorA.value.set(...this.cA); w.beam2.u.uColorB.value.set(...this.cB);
    Post.freeze(0.08);
    Post.impact(0.1, [0.9, 0.95, 1]);
    Post.flashScreen(0.55, this.cB);
    Post.shake(1);
    Post.punch(mode === 'camera' ? 2.6 : 1.6, w.x, w.y);
    Post.aberrate(14);
    Post.bloom(2.4);
    Post.shockwave({ x: w.x, y: w.y, speed: 1600, width: 90, strength: 46, life: 0.8 });
    fx.ring({ x: w.x, y: w.y, r0: 20, r1: Math.hypot(window.innerWidth, window.innerHeight) * 0.6, dur: 0.6, width: 36, a: this.cA, b: this.cB, noise: 0.15, intensity: 2 });
    this.lines = { t: 0.5, x: w.x, y: w.y };
    overlay.callout('気功波', 'Ki Wave', { big: true, dur: 1.6 });
    sfx.play('kiwave');
    this.ctx.onMove(0);
  }

  endWave() {
    const w = this.wave;
    const W = window.innerWidth, H = window.innerHeight;
    if (w.mode === 'lateral') {
      const e = toEdge(w.x, w.y, w.dx, w.dy, 0);
      this.boom(clamp(e.x, 0, W), clamp(e.y, 0, H), 1.3 + w.level * 0.6);
    } else {
      this.boom(W / 2, H / 2, 2.2);
    }
    w.phase = 'idle'; w.t = 0; w.level = 0;
    w.orb.intensity = 0; w.beam.intensity = 0; w.beam2.intensity = 0;
  }

  boom(x, y, power) {
    const { fx, sfx } = this.ctx;
    power *= this.ctx.voice.power;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H), base = Math.min(W, H);
    power *= this.pow;
    Post.impact(0.1, [1, 1, 1]);
    Post.flashScreen(Math.min(0.9, 0.4 * power), this.cB);
    Post.freeze(0.06 * power);
    Post.shake(Math.min(1, 0.5 * power));
    Post.punch(1.6 * power, x, y);
    Post.aberrate(10 * power);
    Post.bloom(2 * power);
    Post.shockwave({ x, y, speed: 1400, width: 90, strength: 34 * power, life: 0.8 });
    Post.shockwave({ x, y, speed: 800, width: 60, strength: 20 * power, life: 0.9 });
    fx.glow({ x, y, s0: base * 0.2, s1: diag * 0.6 * power, dur: 0.6, a: this.cA, b: [1, 1, 1], intensity: 4 });
    fx.ring({ x, y, r0: 20, r1: diag * 0.4 * power, dur: 0.7, width: 40, a: this.cA, b: this.cB, noise: 0.2, intensity: 2 });
    for (let i = 0; i < 120 * power; i++) this.spark(x, y, rand(0, TAU), rand(600, 2200) * Math.min(power, 1.6), { life: rand(0.4, 0.9), width: rand(2, 4) });
    this.lines = { t: 0.5, x, y };
    if (power >= 2) this.ctx.overlay.crack(x, y, Math.min(1.6, power * 0.6));
    sfx.play('nova');
  }

  // ---------- Gathering Sphere ----------
  updateSphere(hands, dt, time, levels) {
    const s = this.sphere, L = hands.L, R = hands.R;
    const { sfx, overlay, fx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);

    if (s.thrown) return this.updateThrown(dt, time, levels);

    let cond = false, sc = 80;
    if (L.present && R.present && this.wave.phase === 'idle') {
      sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      cond = L.isOpen && R.isOpen && L.cy < H * 0.5 && R.cy < H * 0.5 && Math.abs(L.cy - R.cy) / sc < 1.6 && d > 1.8
        && L.speed < CONFIG.stillSpeed * 2.5 && R.speed < CONFIG.stillSpeed * 2.5;
      if (s.on) {
        // Throw: swing both arms down, or shove at the lens.
        const vy = (L.vy + R.vy) / 2 / sc;
        const thrust = L.thrust || R.thrust;
        if (vy > CONFIG.slamSpeed * 0.55 || (thrust && s.level > 0.3)) { this.throwSphere(thrust ? 'camera' : 'down'); return true; }
      }
    }
    if (cond) {
      s.t += dt * this.ctx.voice.boost; s.lost = 0;
      const mx = (L.cx + R.cx) / 2, my = Math.min(L.cy, R.cy);
      s.level = clamp((s.t - 0.3) / 5, 0, 1);
      s.r = base * (0.06 + 0.3 * s.level) * this.pow;
      s.x = s.on ? damp(s.x, mx, 8, dt) : mx;
      s.y = s.on ? damp(s.y, Math.max(my - sc * 1.2 - s.r, s.r * 0.35), 8, dt) : my - sc * 1.2 - s.r;
    } else {
      s.lost += dt;
    }
    if (!s.on && s.t > 0.3) {
      s.on = true;
      overlay.callout('天元玉', 'Gathering Sphere', { big: true, dur: 1.6 });
      this.ctx.onMove(1);
      sfx.play('whoomp');
      fx.ring({ x: s.x, y: s.y, r0: base * 0.6, r1: 20, dur: 0.5, width: 18, a: this.cA, b: this.cB, intensity: 1.6 });
    }
    if (s.on && s.lost > 0.6) this.fizzle();
    if (!s.on && !cond) s.t = 0;
    if (!s.on) { s.orb.intensity = 0; return false; }

    const lv = s.level;
    s.orb.u.uColorA.value.set(...this.cA);
    s.orb.u.uColorB.value.set(...this.cB);
    s.orb.set(s.x, s.y, s.r * 2.4);
    s.orb.param(0.4 + lv * 0.6, 1, 0, 0);
    s.orb.intensity = 0.7 + lv * 0.4;
    s.orb.tick(time);
    // Energy lent from everywhere: streams in from every edge of the frame.
    const n = Math.floor((60 + lv * 200) * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const side = (Math.random() * 4) | 0;
      const x = side === 0 ? -10 : side === 1 ? W + 10 : rand(0, W);
      const y = side === 2 ? -10 : side === 3 ? H + 10 : rand(0, H);
      if (Math.random() < 0.5) this.spark(x, y, 0, 0, { life: 1.4, drag: 0, fn: this.homing(s, () => s.r * 0.8), width: rand(1.5, 3) });
      else this.mote(x, y, { life: 1.6, fn: this.homing(s, () => s.r * 0.8), size: rand(4, 9), size1: 4 });
    }
    // light pouring up from the hands into the sphere
    if (Math.random() < 0.8) {
      for (const h of [L, R]) {
        if (!h.present) continue;
        this.spark(h.cx, h.cy, Math.atan2(s.y - h.cy, s.x - h.cx) + rand(-0.15, 0.15), rand(900, 1500), { life: 0.3, drag: 0 });
      }
    }
    if (Math.random() < lv * 0.5) {
      const a = rand(0, TAU);
      bolt(this.ctx.lines, s.x + Math.cos(a) * s.r * 0.9, s.y + Math.sin(a) * s.r * 0.9, s.x + Math.cos(a) * s.r * 1.6, s.y + Math.sin(a) * s.r * 1.6, { c: this.cB, width: 2.2, depth: 4, branch: 0.3, life: 0.06 });
    }
    sfx.loop('hum', 0.4 + lv * 0.6);
    sfx.loop('drone', 0.3 + lv * 0.5);
    Post.wantZoom(0.03 + lv * 0.08, s.x, s.y);
    Post.wantAura(0.35 + lv * 0.45, this.cA, this.cB);
    Post.wantDim(0.35 + lv * 0.35);
    Post.wantEdge(0.12 + lv * 0.3, this.cA);
    Post.shake(dt * (0.3 + lv));
    overlay.letterbox(0.5 + lv * 0.5);
    levels[0] = Math.max(levels[0], 0.9 + lv);
    levels[1] = Math.max(levels[1], 0.9 + lv);
    return true;
  }

  throwSphere(mode) {
    const s = this.sphere;
    const { sfx, overlay } = this.ctx;
    s.thrown = { mode, t: 0, sx: s.x, sy: s.y, r0: s.r, dur: mode === 'camera' ? 0.55 : 0.75 };
    s.on = false; s.t = 0;
    Post.shake(0.6);
    Post.punch(1, s.x, s.y);
    sfx.play('throw');
    sfx.play('whoomp');
    overlay.letterbox(1);
  }

  updateThrown(dt, time, levels) {
    const s = this.sphere, th = s.thrown;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    th.t += dt;
    const k = easeInCubic(Math.min(1, th.t / th.dur));
    const tx = W / 2, ty = th.mode === 'camera' ? H / 2 : H * 0.72;
    s.x = lerp(th.sx, tx, k);
    s.y = lerp(th.sy, ty, k);
    s.r = th.r0 + (th.mode === 'camera' ? diag * 0.9 : th.r0 * 0.6) * k;
    s.orb.set(s.x, s.y, s.r * 2.4);
    s.orb.intensity = 0.9;
    s.orb.tick(time);
    for (let i = 0; i < 4; i++) this.spark(s.x + rand(-1, 1) * s.r, s.y + rand(-1, 1) * s.r, -Math.PI / 2 + rand(-0.6, 0.6), rand(300, 900), { life: 0.3 });
    Post.shake(dt * 2);
    Post.wantDim(0.7);
    Post.wantEdge(0.4, this.cA);
    this.ctx.overlay.letterbox(1);
    this.ctx.sfx.loop('beam', 0.6);
    levels[0] = Math.max(levels[0], 1.8); levels[1] = Math.max(levels[1], 1.8);
    if (th.t >= th.dur) {
      s.thrown = null;
      s.orb.intensity = 0;
      const x = s.x, y = s.y;
      this.boom(x, y, 2.6);
      Post.impact(0.16, [1, 1, 1]);
      Post.freeze(0.16);
      Post.flashScreen(1, [1, 1, 1]);
      this.ctx.overlay.callout('天元玉', 'Gathering Sphere', { big: true, dur: 1.2 });
      // a second, slower dome of light rolls outward
      this.after(0.2, () => {
        Post.shockwave({ x, y, speed: 700, width: 140, strength: 40, life: 1.2 });
        this.ctx.fx.glow({ x, y, s0: diag * 0.3, s1: diag * 1.6, dur: 1.1, a: this.cA, b: this.cB, intensity: 3 });
        Post.shake(0.8);
      });
    }
    return true;
  }

  fizzle() {
    const s = this.sphere;
    s.on = false; s.t = 0;
    for (let i = 0; i < 60; i++) this.spark(s.x, s.y, rand(0, TAU), rand(200, 700), { life: 0.5 });
    this.ctx.fx.ring({ x: s.x, y: s.y, r0: s.r, r1: s.r * 2, dur: 0.4, width: 10, a: this.cA, b: this.cB, intensity: 1.2 });
    this.ctx.sfx.play('collapse');
  }

  // ---------- Awakening ----------
  updateAwaken(hands, dt, time, levels) {
    const a = this.aw, L = hands.L, R = hands.R;
    const { sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    if (a.awake > 0) {
      a.awake -= dt;
      const fade = Math.min(1, a.awake / 1.5);
      Post.wantEdge(0.2 * fade + 0.06 * Math.sin(time * 6) * fade, CH.gold);
      Post.wantAura((0.55 + 0.1 * Math.sin(time * 7)) * fade, CH.gold, CH.goldB);
      if (a.awake <= 0) { overlay.setCharacter(CH); sfx.play('collapse'); overlay.callout('気', 'Power Fades', { dur: 0.9 }); }
    }
    const cond = L.present && R.present && L.fist && R.fist && L.speed < CONFIG.stillSpeed * 3 && R.speed < CONFIG.stillSpeed * 3
      && this.wave.phase === 'idle' && !this.sphere.on;
    if (cond) a.t += dt * this.ctx.voice.boost; else a.t = Math.max(0, a.t - dt * 3);
    const c = clamp((a.t - 0.25) / 1.9, 0, 1);
    a.charging = damp(a.charging, c > 0 ? 0.35 + c * 0.9 : 0, 8, dt);
    if (c > 0) {
      // the whole world strains: shake, dim, gold at the edges, rubble rising
      Post.shake(dt * (0.5 + c * 2.5));
      Post.wantDim(0.3 + c * 0.4);
      Post.wantEdge(0.15 + c * 0.45, CH.gold);
      Post.aberrate(c * 3);
      Post.wantZoom(c * 0.12, (L.cx + R.cx) / 2, (L.cy + R.cy) / 2);
      Post.wantAura(0.4 + c * 1.0, CH.gold, CH.goldB);
      overlay.letterbox(c);
      overlay.speedLines(c * 0.6, (L.cx + R.cx) / 2, (L.cy + R.cy) / 2);
      if (Math.random() < 0.3 + c) {
        this.ctx.particles.spawn({ x: rand(0, W), y: H + 10, vy: rand(-500, -150), vx: rand(-30, 30), life: rand(1, 2),
          c: [0.75, 0.66, 0.5], bright: 0.55, size: rand(3, 9), fade: 0.4 });
      }
      a.boltT -= dt;
      if (a.boltT <= 0 && c > 0.3) {
        a.boltT = 0.12 - c * 0.08;
        const h = Math.random() < 0.5 ? L : R;
        const ang = -Math.PI / 2 + rand(-1.2, 1.2), len = h.scale * rand(2, 4);
        bolt(this.ctx.lines, h.cx, h.cy, h.cx + Math.cos(ang) * len, h.cy + Math.sin(ang) * len, { c: CH.goldB, width: 3, depth: 5, branch: 0.4, life: 0.07 });
      }
      sfx.loop('charge', 0.4 + c * 0.6);
      sfx.loop('roar', c);
      sfx.loop('drone', c * 0.8);
      levels[0] = Math.max(levels[0], 0.8 + c);
      levels[1] = Math.max(levels[1], 0.8 + c);
      if (c >= 1) this.awaken((L.cx + R.cx) / 2, (L.cy + R.cy) / 2);
    }
    return c > 0.05;
  }

  awaken(x, y) {
    const { fx, sfx, overlay } = this.ctx;
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    this.aw.t = 0;
    this.aw.awake = AWAKE_TIME;
    overlay.setCharacter({ ...CH, a: CH.gold, b: CH.goldB });
    Post.impact(0.14, [1, 0.95, 0.75]);
    Post.freeze(0.14);
    Post.flashScreen(0.9, CH.goldB);
    Post.shake(1);
    Post.punch(2.4, x, y);
    Post.aberrate(16);
    Post.bloom(2.6);
    Post.shockwave({ x, y, speed: 1700, width: 110, strength: 52, life: 0.9 });
    Post.shockwave({ x, y, speed: 900, width: 70, strength: 30, life: 1 });
    fx.glow({ x, y, s0: 100, s1: diag, dur: 0.7, a: CH.gold, b: [1, 1, 1], intensity: 4 });
    fx.ring({ x, y, r0: 20, r1: diag * 0.75, dur: 0.8, width: 50, a: CH.gold, b: CH.goldB, noise: 0.2, intensity: 2.4 });
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU;
      bolt(this.ctx.lines, x, y, x + Math.cos(ang) * diag * 0.4, y + Math.sin(ang) * diag * 0.4, { c: CH.goldB, width: 5, life: 0.16, branch: 0.6 });
    }
    for (let i = 0; i < 220; i++) {
      this.ctx.streaks.spawn({
        x, y, vx: rand(-1, 1) * 1800, vy: rand(-1.4, 0.6) * 1800, grav: 0, drag: 1.5, life: rand(0.4, 1),
        c: pick(GOLD), bright: 2.4, width: rand(2, 4), stretch: 0.03, fade: 1.2,
      });
    }
    this.lines = { t: 0.7, x, y };
    overlay.callout('覚醒', 'Awakening', { big: true, dur: 1.8 });
    overlay.crack(x, y, 1.5);
    sfx.play('awaken');
    this.ctx.onMove(3);
  }
}
