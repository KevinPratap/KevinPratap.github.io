// Raiju: instantaneous, branching discharge physics. Nothing here travels
// smoothly; energy jumps between points and re-rolls its path every frame.
import { CONFIG, CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad, Sigil, Trail, makeSigilTextures, bolt } from '../render/objects.js';
import { clamp, rand, pick, lerp, TAU, damp, easeInCubic } from '../util.js';

const CH = CHARACTERS.raiju;
const VOLT = [[1, 0.85, 0.3], [1, 0.95, 0.6], [1, 1, 0.9], [1, 0.75, 0.2]];
const BOLT = [1, 0.86, 0.35];
const HOT = [1, 0.96, 0.8];

// Where a ray from (x,y) along (dx,dy) leaves the screen.
function toEdge(x, y, dx, dy, pad = 40) {
  const W = window.innerWidth + pad, H = window.innerHeight + pad;
  let t = 1e9;
  if (dx > 0) t = Math.min(t, (W - x) / dx); else if (dx < 0) t = Math.min(t, (-pad - x) / dx);
  if (dy > 0) t = Math.min(t, (H - y) / dy); else if (dy < 0) t = Math.min(t, (-pad - y) / dy);
  if (!isFinite(t) || t > 1e8) t = 0;
  return { x: x + dx * t, y: y + dy * t, len: t };
}

export class Raiju {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    const tex = makeSigilTextures('nyx', 41);
    this.slots = {};
    for (const s of ['L', 'R']) {
      this.slots[s] = {
        charge: 0, ready: false, ox: 0, oy: 0, size: 80, boltT: 0,
        call: 0, callCool: 0, rail: 0, railCool: 0, railBoltT: 0, strikeCool: 0, calloutCool: 0,
        ball: new FXQuad(S, 'plasma', { a: CH.a, b: CH.b, intensity: 0 }),
        tipBall: new FXQuad(S, 'plasma', { a: CH.a, b: HOT, intensity: 0 }),
        sigil: new Sigil(S, tex, CH.a, CH.b),
      };
    }
    this.link = { level: 0, on: false, t: 0, boltT: 0, prevD: 0, cool: 0, mx: 0, my: 0, calloutCool: 0 };
    this.charged = 0; this.fireT = 0; this.stormT = 0; this.stormCool = 0; this.conduitCool = 0; this.shots = 0;
    this.projectiles = [];
    this.beams = [];
    this.timers = [];
    this.lines = { t: 0, x: 0, y: 0 };
  }

  enter() {}

  exit() {
    for (const st of Object.values(this.slots)) {
      st.charge = 0; st.ready = false; st.rail = 0;
      st.ball.intensity = 0; st.tipBall.intensity = 0;
      st.sigil.target = 0; st.sigil.level = 0; st.sigil.update(0, 0, 0, 0, 1);
    }
    this.link.level = 0; this.link.on = false;
    this.charged = 0; this.stormT = 0;
    this.projectiles.forEach((p) => { p.ball.dispose(); p.trail.dispose(); });
    this.projectiles.length = 0;
    this.beams.forEach((b) => b.q.dispose());
    this.beams.length = 0;
    this.timers.length = 0;
  }

  after(t, fn) { this.timers.push({ t, fn }); }

  bolt(x0, y0, x1, y1, o = {}) {
    return bolt(this.ctx.lines, x0, y0, x1, y1, { c: BOLT, ...o });
  }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, grav: o.grav ?? 300, drag: o.drag ?? 3,
      life: o.life ?? rand(0.12, 0.35), c: pick(VOLT), bright: o.bright ?? 2.6,
      width: o.width ?? rand(1.2, 2.4), stretch: o.stretch ?? 0.025, fade: 1,
    });
  }

  update(dt, time, hands) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const levels = [0.3, 0.3];
    this.fireT -= dt; this.stormCool -= dt; this.conduitCool -= dt;
    if (this.charged > 0) {
      this.charged -= dt;
      Post.wantAura(0.3 + Math.min(1, this.charged) * 0.15, CH.a, CH.b);
      Post.wantEdge(0.35, CH.b);
      levels[0] = levels[1] = 0.9;
      if (this.charged <= 0) {
        this.ctx.overlay.callout('放電', 'Charge spent');
        this.ctx.sfx.play('zap', 0.8);
      }
    }
    if (this.stormT > 0) { this.stormT -= dt; Post.wantDim(Math.min(0.65, this.stormT * 0.8)); }
    const linked = this.updateLink(hands, dt, time, levels);
    levels[0] = Math.max(levels[0], this.updateHand(this.slots.L, hands.L, dt, time, linked));
    levels[1] = Math.max(levels[1], this.updateHand(this.slots.R, hands.R, dt, time, linked));
    this.updateProjectiles(dt, time);
    this.updateBeams(dt, time);
    if (this.lines.t > 0) {
      this.lines.t -= dt;
      this.ctx.overlay.speedLines(Math.min(1, this.lines.t * 3), this.lines.x, this.lines.y);
    }
    // stray static crawling over the hands
    for (const h of [hands.L, hands.R]) {
      if (h.present && Math.random() < dt * (this.charged > 0 ? 22 : 5)) {
        const p = h.pts[pick([4, 8, 12, 16, 20])];
        this.spark(p.x, p.y, rand(0, TAU), rand(150, 450), { life: 0.15 });
      }
      if (h.present && Math.random() < dt * (this.charged > 0 ? 24 : 6)) {
        const a = h.pts[(Math.random() * 21) | 0], b = h.pts[(Math.random() * 21) | 0];
        this.bolt(a.x, a.y, b.x, b.y, { width: 1.6, depth: 3, branch: 0, bright: 1.6, life: 0.06 });
      }
    }
    return levels;
  }

  // ---------- Thunder Palm + Railgun + Thunderstrike ----------
  updateHand(st, h, dt, time, busy) {
    const { sfx, overlay, fx } = this.ctx;
    st.railCool -= dt; st.strikeCool -= dt; st.calloutCool -= dt; st.callCool -= dt;
    let level = 0.3;

    if (!h.present) {
      st.charge = Math.max(0, st.charge - CONFIG.chargeDecay * dt);
      st.ready = false;
      st.rail = Math.max(0, st.rail - dt * 3);
    } else {
      st.size = h.scale;
      st.ox = lerp(h.cx, h.pts[9].x, 0.3);
      st.oy = lerp(h.cy, h.pts[9].y, 0.3);

      // Thunderstrike: a fist slammed straight down.
      const vyS = h.vy / h.scale;
      if (h.fist && vyS > CONFIG.slamSpeed && h.vy > Math.abs(h.vx) * 1.6 && st.strikeCool <= 0) {
        this.strike(h.cx, h.cy + h.scale * 0.3, h.scale);
        st.strikeCool = 0.9;
      }

      if (!busy && h.cupped && h.still) {
        st.charge = Math.min(1, st.charge + (dt * this.ctx.voice.boost) / CONFIG.chargeTime);
        if (st.charge >= 1 && !st.ready) {
          st.ready = true;
          fx.ring({ x: st.ox, y: st.oy, r0: h.scale * 0.5, r1: h.scale * 3.4, dur: 0.35, width: 8, a: CH.a, b: HOT, intensity: 2 });
          sfx.play('zap', 1.4);
          Post.bloom(0.8);
          for (let i = 0; i < 6; i++) {
            const a = rand(0, TAU);
            this.bolt(st.ox, st.oy, st.ox + Math.cos(a) * h.scale * 4, st.oy + Math.sin(a) * h.scale * 4, { width: 3, life: 0.12 });
          }
        }
      } else if (st.charge > 0.25 && (h.flick || h.thrust) && !h.fist) {
        const toCam = h.thrust && (!h.flick || h.scaleRate > CONFIG.thrustRate * 1.3);
        this.throwBall(st, h, toCam);
      } else {
        st.charge = Math.max(0, st.charge - CONFIG.chargeDecay * (h.fist ? 3 : 1) * dt);
        if (st.charge < 0.99) st.ready = false;
      }

      // Shazam Bolt: point straight up to call lightning down; while charged,
      // every point fires a bolt from the fingertip.
      const up = h.point && h.pdy < -0.62;
      if (up && this.charged <= 0 && st.callCool <= 0 && !busy) {
        st.call += dt;
        st.callT = (st.callT || 0) - dt;
        if (st.callT <= 0) {
          st.callT = 0.05;
          const k = st.call / 0.45;
          this.bolt(h.tipX + rand(-40, 40) * (1 - k), -30, h.tipX, h.tipY, { width: 1.4 + k * 3, jag: 0.12, depth: 5, branch: 0.2, life: 0.05, bright: 1 + k });
        }
        Post.wantDim(st.call * 0.7);
        Post.wantZoom(st.call * 0.07, h.tipX, h.tipY);
        if (st.call > 0.45) { this.skyCall(h, st); st.call = 0; st.callCool = 1.2; }
      } else {
        st.call = 0;
      }
      if (this.charged > 0 && h.point && this.fireT <= 0) {
        this.fireT = 0.15;
        this.shootBolt(h);
      }

      // Railgun: point, hold still, auto-fire at full charge.
      if (h.point && !up && this.charged <= 0 && st.railCool <= 0 && h.speed < CONFIG.stillSpeed * 1.3) {
        st.rail = Math.min(1, st.rail + (dt * this.ctx.voice.boost) / CONFIG.railCharge);
        if (st.rail >= 1) {
          this.fireRail(h);
          st.rail = 0;
          st.railCool = 0.75;
        }
      } else {
        st.rail = Math.max(0, st.rail - dt * 2.5);
      }
    }

    // palm ball visuals
    const c = st.charge;
    st.ball.set(st.ox, st.oy, st.size * (0.7 + c * 1.3));
    st.ball.intensity = c > 0.01 ? 0.25 + c * 0.55 : 0;
    st.ball.param(c, 0, 0, 0);
    st.ball.tick(time);
    st.sigil.target = c > 0.04 ? 1 : 0;
    st.sigil.charge = c;
    st.sigil.update(dt, time, st.ox, st.oy, st.size * (2.6 + c * 1.4), -(1 + c * 6));
    if (c > 0.01) {
      st.boltT -= dt;
      if (st.boltT <= 0) {
        st.boltT = 0.045;
        const n = 1 + Math.floor(c * 3);
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), r = st.size * rand(1.2, 1.5 + c * 2.8);
          this.bolt(st.ox, st.oy, st.ox + Math.cos(a) * r, st.oy + Math.sin(a) * r, { width: 2 + c * 3, depth: 4, life: 0.06, branch: 0.25 });
        }
        if (h.present && Math.random() < 0.7) {
          const tip = h.pts[pick([4, 8, 12, 16, 20])];
          this.bolt(st.ox, st.oy, tip.x, tip.y, { width: 1.6 + c * 1.5, depth: 3, branch: 0, life: 0.06 });
        }
      }
      if (Math.random() < c * 0.8) this.spark(st.ox, st.oy, rand(0, TAU), rand(300, 900));
      sfx.loop('buzz', 0.3 + c * 0.7);
      Post.wantDim(c * 0.45);
      Post.wantZoom(c * 0.08, st.ox, st.oy);
      Post.wantAura(c * 0.55, CH.a, CH.b);
      if (c > 0.85) overlay.speedLines(((c - 0.85) / 0.15) * 0.5, st.ox, st.oy);
      level = Math.max(level, 0.4 + c * 1.3);
    }

    // railgun charge visuals at the fingertip
    const r = st.rail;
    if (r > 0.01 && h.present) {
      const tx = h.tipX + h.pdx * h.scale * 0.2, ty = h.tipY + h.pdy * h.scale * 0.2;
      st.tipBall.set(tx, ty, h.scale * (0.35 + r * 0.9));
      st.tipBall.intensity = 0.4 + r * 1.2;
      st.tipBall.param(r, 0, 0, 0);
      st.tipBall.tick(time);
      st.railBoltT -= dt;
      if (st.railBoltT <= 0) {
        st.railBoltT = 0.05;
        // converging arcs spiral in toward the tip
        const a = time * 9 + rand(0, TAU), d = h.scale * (2.6 - r * 1.6);
        this.bolt(tx + Math.cos(a) * d, ty + Math.sin(a) * d, tx, ty, { width: 2, depth: 4, branch: 0.1, life: 0.06 });
        // guide line: faint aim preview
        if (r > 0.4) {
          const e = toEdge(tx, ty, h.pdx, h.pdy);
          this.ctx.lines.spawn(tx, ty, e.x, e.y, 1.2 + r * 1.6, CH.a, 0.35 * r, 0.06);
        }
      }
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU), d = h.scale * rand(1.5, 2.6);
        this.ctx.particles.spawn({
          x: tx + Math.cos(a) * d, y: ty + Math.sin(a) * d, life: 0.18, c: pick(VOLT), bright: 1.4, size: 5, size1: 1,
          vx: -Math.cos(a) * d / 0.18, vy: -Math.sin(a) * d / 0.18,
        });
      }
      sfx.loop('charge', 0.3 + r * 0.7);
      Post.wantDim(r * 0.4);
      Post.wantZoom(r * 0.1, tx, ty);
      Post.wantAura(r * 0.45, CH.a, CH.b);
      level = Math.max(level, 0.5 + r * 1.2);
    } else {
      st.tipBall.intensity = 0;
    }
    return level;
  }

  throwBall(st, h, toCam) {
    const { sfx, overlay, scene, fx } = this.ctx;
    sfx.play('zap', 1.6);
    sfx.play('throw');
    overlay.callout('雷掌', 'Thunder Palm');
    this.ctx.onMove(0);
    Post.shake(0.25);
    const size = st.size * (1 + st.charge * 0.8);
    const ball = new FXQuad(scene, 'plasma', { a: CH.a, b: CH.b, intensity: 1.4 });
    ball.param(1, 0, 0, 0);
    const d = h.dir();
    this.projectiles.push({
      mode: toCam ? 'camera' : 'lateral', x: st.ox, y: st.oy, sx: st.ox, sy: st.oy, t: 0,
      vx: d.x * 2600, vy: d.y * 2600, life: toCam ? 0.38 : 1.2, size, ball, boltT: 0,
      trail: new Trail(scene, { width: size * 0.5, life: 0.12, fire: false, a: CH.a, b: HOT }),
      prev: [],
    });
    fx.glow({ x: st.ox, y: st.oy, s0: size, s1: size * 4, dur: 0.2, a: CH.a, b: HOT });
    st.charge = 0;
    st.ready = false;
  }

  updateProjectiles(dt, time) {
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      let s;
      if (p.mode === 'lateral') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        s = p.size;
      } else {
        const k = easeInCubic(Math.min(1, p.t / p.life));
        p.x = lerp(p.sx, W / 2, k * 0.6);
        p.y = lerp(p.sy, H / 2, k * 0.6);
        s = p.size + (Math.max(W, H) * 1.6 - p.size) * k;
      }
      p.ball.set(p.x, p.y, s);
      p.ball.tick(time);
      p.trail.push(p.x, p.y, time);
      p.trail.update(time);
      p.prev.unshift({ x: p.x, y: p.y });
      if (p.prev.length > 8) p.prev.pop();
      p.boltT -= dt;
      if (p.boltT <= 0) {
        p.boltT = 0.035;
        const back = p.prev[p.prev.length - 1];
        this.bolt(p.x, p.y, back.x + rand(-20, 20), back.y + rand(-20, 20), { width: 4, depth: 4, life: 0.07 });
        const a = rand(0, TAU);
        this.bolt(p.x, p.y, p.x + Math.cos(a) * s * 0.9, p.y + Math.sin(a) * s * 0.9, { width: 2.5, depth: 3, branch: 0, life: 0.05 });
      }
      const off = p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80;
      if (p.t >= p.life || (p.mode === 'lateral' && off)) {
        this.discharge(clamp(p.x, 0, W), clamp(p.y, 0, H), p.mode === 'camera' ? 2.2 : 1);
        p.ball.dispose();
        p.trail.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  discharge(x, y, power) {
    const { fx, sfx } = this.ctx;
    power *= this.ctx.voice.power;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    sfx.play('thunder', power > 1.5 ? 1.4 : 0.8);
    Post.shockwave({ x, y, speed: 1300 * power, width: 60, strength: 26 * power, life: 0.55 });
    Post.flashScreen(0.25 * power, HOT);
    Post.shake(0.45 * power);
    Post.aberrate(7 * power);
    Post.punch(1.2 * power, x, y);
    Post.bloom(1.4 * power);
    Post.freeze(0.05 * power);
    if (power > 1.5) { Post.impact(0.1, [1, 1, 0.9]); this.lines = { t: 0.45, x, y }; this.ctx.overlay.crack(x, y, 1.1); }
    fx.glow({ x, y, s0: base * 0.1, s1: base * 0.8 * power, dur: 0.35, a: CH.a, b: HOT, intensity: 3 });
    fx.ring({ x, y, r0: 10, r1: base * 0.45 * power, dur: 0.4, width: 14, a: CH.a, b: HOT, noise: 0.2, intensity: 2 });
    const n = Math.floor(8 * power);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), L = base * rand(0.25, 0.6) * power;
      this.bolt(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, { width: 5, life: 0.14, branch: 0.6 });
    }
    // aftershock flickers re-roll the fan
    this.after(0.07, () => {
      for (let i = 0; i < n * 0.6; i++) {
        const a = rand(0, TAU), L = base * rand(0.2, 0.5) * power;
        this.bolt(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, { width: 4, life: 0.1, branch: 0.5 });
      }
    });
    for (let i = 0; i < 60 * power; i++) this.spark(x, y, rand(0, TAU), rand(500, 1700) * power, { life: rand(0.2, 0.5) });
  }

  fireRail(h) {
    const { fx, sfx, overlay, scene } = this.ctx;
    const x = h.tipX, y = h.tipY, dx = h.pdx, dy = h.pdy;
    const e = toEdge(x, y, dx, dy, 60);
    const w = h.scale * 1.1;
    const q = new FXQuad(scene, 'beam', { a: CH.a, b: HOT, intensity: 2.2 });
    this.beams.push({ q, x, y, dx, dy, len: e.len, w, t: 0, life: 0.5, ex: e.x, ey: e.y, boltT: 0 });
    Post.freeze(0.07);
    Post.shake(0.7);
    Post.punch(-1.2, x, y);
    Post.aberrate(12);
    Post.bloom(2);
    Post.flashScreen(0.22, HOT);
    Post.shockwave({ x, y, speed: 1400, width: 60, strength: 30, life: 0.5 });
    fx.ring({ x, y, r0: 10, r1: h.scale * 5, dur: 0.3, width: 12, a: CH.a, b: HOT, intensity: 2.4 });
    // muzzle rings stacked along the barrel, like a coil gun
    for (let i = 1; i <= 4; i++) {
      fx.ring({ x: x + dx * h.scale * i * 1.2, y: y + dy * h.scale * i * 1.2, r0: h.scale * 0.4, r1: h.scale * (1.6 - i * 0.2), dur: 0.35 + i * 0.05, width: 6, a: CH.a, b: HOT, intensity: 1.8 });
    }
    this.lines = { t: 0.35, x, y };
    this.after(0.08, () => this.discharge(clamp(e.x, 0, window.innerWidth), clamp(e.y, 0, window.innerHeight), 1.3));
    for (let i = 0; i < 50; i++) {
      const a = Math.atan2(dy, dx) + rand(-0.25, 0.25);
      this.spark(x, y, a, rand(1500, 3200), { life: rand(0.15, 0.3), grav: 0, width: rand(1.5, 3) });
    }
    overlay.callout('電磁砲', 'Railgun', { big: true, dur: 1.2 });
    sfx.play('rail');
    this.ctx.onMove(1);
  }

  updateBeams(dt, time) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const k = b.t / b.life;
      const w = b.w * (k < 0.1 ? 1.6 : 1.6 * Math.pow(1 - (k - 0.1) / 0.9, 1.5));
      b.q.set(b.x + b.dx * b.len / 2, b.y + b.dy * b.len / 2, b.len, Math.max(w, 1), Math.atan2(b.dy, b.dx));
      b.q.param(1, 1, 0, 0);
      b.q.intensity = 2.2 * (1 - k);
      b.q.tick(time);
      b.boltT -= dt;
      if (b.boltT <= 0 && k < 0.7) {
        b.boltT = 0.04;
        // arcs wrapping the beam
        const nx = -b.dy, ny = b.dx;
        let px = b.x, py = b.y;
        const steps = 10;
        for (let s = 1; s <= steps; s++) {
          const t = (s / steps) * b.len;
          const off = Math.sin(s * 1.7 + time * 50) * w * 0.6;
          const qx = b.x + b.dx * t + nx * off, qy = b.y + b.dy * t + ny * off;
          this.ctx.lines.spawn(px, py, qx, qy, 2.5, BOLT, 2, 0.05);
          px = qx; py = qy;
        }
      }
      Post.wantDim(0.5 * (1 - k));
      if (b.t >= b.life) { b.q.dispose(); this.beams.splice(i, 1); }
    }
  }

  strike(x, y, sc) {
    const { fx, sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    const sx = x + rand(-0.15, 0.15) * W;
    const fire = (w) => this.bolt(sx, -30, x, y, { width: w, jag: 0.14, depth: 7, branch: 1, life: 0.09, bright: 3 });
    fire(16);
    this.ctx.phys.blast(x, y, base * 0.6, 2600);
    this.ctx.phys.burst(x, y, 16, 'rock', { speed: 1100, size: 13, up: 600, kinds: ['rock', 'glass'], cone: 2.6 });
    Post.impact(0.1, [1, 1, 0.92]);
    Post.flashScreen(0.7, [1, 0.98, 0.85]);
    Post.freeze(0.09);
    Post.shake(1);
    Post.punch(2, x, y);
    Post.aberrate(14);
    Post.bloom(2.2);
    Post.shockwave({ x, y, speed: 1500, width: 80, strength: 44, life: 0.7 });
    fx.glow({ x, y, s0: base * 0.2, s1: base * 1.2, dur: 0.4, a: CH.a, b: HOT, intensity: 2.4 });
    fx.ring({ x, y, r0: 10, r1: base * 0.7, dur: 0.6, width: 24, a: CH.a, b: HOT, noise: 0.2, intensity: 2.2 });
    // the channel flickers a few more times, like real lightning
    [0.06, 0.13, 0.22].forEach((t, i) => this.after(t, () => { fire(12 - i * 3); Post.flashScreen(0.35 - i * 0.1, HOT); }));
    // ground arcs skitter sideways
    for (let i = 0; i < 6; i++) {
      const a = (i % 2 ? 0 : Math.PI) + rand(-0.5, 0.5);
      const L = base * rand(0.2, 0.45);
      this.bolt(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.4, { width: 4, life: 0.2, branch: 0.6 });
    }
    for (let i = 0; i < 120; i++) {
      const a = -Math.PI / 2 + rand(-1.4, 1.4);
      this.spark(x, y, a, rand(400, 1800), { grav: 1600, life: rand(0.3, 0.8), drag: 1.2 });
    }
    this.lines = { t: 0.5, x, y };
    overlay.callout('落雷', 'Thunderstrike', { big: true });
    overlay.crack(x, y, 1.4);
    sfx.play('thunder', 1.6);
    this.ctx.onMove(3);
  }

  // ---------- Shazam Bolt ----------
  skyCall(h, st) {
    const { fx, sfx, overlay, phys } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    const x = h.tipX, y = h.tipY;
    const fire = (w) => this.bolt(x + rand(-30, 30), -30, x, y, { width: w, jag: 0.14, depth: 7, branch: 1, life: 0.1, bright: 3.4 });
    fire(22); fire(12);
    Post.impact(0.14, [1, 1, 0.95]);
    Post.flashScreen(1, [1, 1, 0.92]);
    Post.freeze(0.12);
    Post.shake(1);
    Post.punch(2.4, x, y);
    Post.aberrate(18);
    Post.bloom(3);
    Post.glitchFor(0.35);
    Post.shockwave({ x, y, speed: 1600, width: 90, strength: 46, life: 0.8 });
    fx.glow({ x, y, s0: base * 0.2, s1: base * 1.4, dur: 0.5, a: CH.a, b: HOT, intensity: 3 });
    fx.ring({ x, y, r0: 10, r1: base * 0.8, dur: 0.6, width: 26, a: CH.a, b: HOT, noise: 0.2, intensity: 2.4 });
    [0.05, 0.11, 0.19, 0.3].forEach((t, i) => this.after(t, () => { fire(16 - i * 3); Post.flashScreen(0.4 - i * 0.08, HOT); }));
    // a crown of arcs leaps off the hand
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + rand(-0.2, 0.2), L = base * rand(0.2, 0.5);
      this.bolt(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, { width: 5, life: 0.16, branch: 0.7 });
    }
    for (let i = 0; i < 140; i++) this.spark(x, y, rand(0, TAU), rand(500, 2200), { life: rand(0.3, 0.7), grav: 900 });
    phys.blast(x, y, base * 0.7, 2600);
    phys.burst(x, Math.min(H - 10, y + base * 0.4), 18, 'rock', { speed: 900, size: 13, up: 500, kinds: ['rock', 'glass'], dir: -Math.PI / 2, cone: 2.4 });
    this.charged = 8;
    this.lines = { t: 0.6, x, y };
    overlay.callout('神雷', 'Shazam Bolt', { big: true });
    overlay.crack(x, y, 1.5);
    sfx.play('thunder', 1.8);
    this.ctx.onMove(4);
  }

  shootBolt(h) {
    const { fx, sfx, overlay, phys } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    const x = h.tipX + h.pdx * h.scale * 0.2, y = h.tipY + h.pdy * h.scale * 0.2;
    const a0 = Math.atan2(h.pdy, h.pdx) + rand(-0.03, 0.03);
    const dx = Math.cos(a0), dy = Math.sin(a0);
    const e = toEdge(x, y, dx, dy, 30);
    const ex = clamp(e.x, 0, W), ey = clamp(e.y, 0, H);
    this.bolt(x, y, e.x, e.y, { width: 9, jag: 0.1, depth: 8, branch: 0.9, life: 0.09, bright: 3.4 });
    this.bolt(x, y, e.x, e.y, { width: 4, jag: 0.2, depth: 7, branch: 0.5, life: 0.07, bright: 2.6 });
    // chain forks off the main channel
    for (let i = 0; i < 3; i++) {
      const t = rand(0.25, 0.9) * e.len, fa = a0 + rand(-0.9, 0.9);
      const fx0 = x + dx * t, fy0 = y + dy * t, L = base * rand(0.1, 0.28);
      this.bolt(fx0, fy0, fx0 + Math.cos(fa) * L, fy0 + Math.sin(fa) * L, { width: 3, life: 0.08, branch: 0.4 });
    }
    fx.glow({ x, y, s0: h.scale * 0.6, s1: h.scale * 2.6, dur: 0.16, a: CH.a, b: HOT, intensity: 2.6 });
    fx.ring({ x, y, r0: h.scale * 0.3, r1: h.scale * 1.8, dur: 0.22, width: 8, a: CH.a, b: HOT, intensity: 2 });
    for (let i = 0; i < 14; i++) this.spark(x, y, a0 + rand(-0.35, 0.35), rand(1000, 2600), { life: rand(0.12, 0.28), grav: 0 });
    phys.push(x, y, dx, dy, e.len, h.scale * 1.4, 2200);
    phys.blast(ex, ey, base * 0.32, 1500);
    phys.burst(ex, ey, 6, 'rock', { speed: 800, size: 11, up: 400, kinds: ['rock', 'glass'], dir: a0 + Math.PI, cone: 2.2 });
    fx.glow({ x: ex, y: ey, s0: base * 0.05, s1: base * 0.3, dur: 0.2, a: CH.a, b: HOT, intensity: 2.2 });
    for (let i = 0; i < 12; i++) this.spark(ex, ey, rand(0, TAU), rand(400, 1400), { life: rand(0.15, 0.4) });
    Post.shake(0.4);
    Post.flashScreen(0.14, HOT);
    Post.aberrate(6);
    Post.bloom(1);
    Post.punch(-0.8, x, y);
    if (++this.shots % 3 === 1) overlay.sfxText(['ZAKK!', 'BZZT!', 'KRA-KOOM!'][((this.shots / 3) | 0) % 3], ex, ey, 1.1, [255, 236, 120]);
    if (this.shots % 2 === 0) sfx.play('zap', 1.4);
  }

  // Arc Link raised skyward: the storm answers along the whole chain.
  stormCall(L, R, sc) {
    const { fx, sfx, overlay, phys } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    this.stormCool = 3;
    this.stormT = 1.6;
    Post.flashScreen(0.6, HOT);
    Post.shake(1);
    Post.aberrate(14);
    Post.glitchFor(0.3);
    overlay.callout('天雷', 'Sky Storm', { big: true, dur: 1.5 });
    sfx.play('thunder', 1.8);
    this.ctx.onMove(5);
    const n = 11;
    for (let i = 0; i < n; i++) {
      this.after(i * 0.1, () => {
        const u = i < 2 ? i : Math.random();
        const x = lerp(L.cx, R.cx, u) + (i > 1 ? rand(-0.12, 0.12) * W : 0);
        const y = lerp(L.cy, R.cy, u) + base * rand(0.05, 0.4);
        const yy = Math.min(H - 20, y);
        const sx = x + rand(-0.1, 0.1) * W;
        this.bolt(sx, -30, x, yy, { width: 14, jag: 0.14, depth: 7, branch: 1, life: 0.1, bright: 3.2 });
        this.bolt(sx, -30, x, yy, { width: 6, jag: 0.2, depth: 6, branch: 0.6, life: 0.07, bright: 2.4 });
        Post.flashScreen(0.35, HOT);
        Post.shockwave({ x, y: yy, speed: 1300, width: 60, strength: 28, life: 0.5 });
        Post.shake(0.6);
        Post.bloom(1.6);
        fx.glow({ x, y: yy, s0: base * 0.05, s1: base * 0.5, dur: 0.3, a: CH.a, b: HOT, intensity: 2.6 });
        fx.ring({ x, y: yy, r0: 10, r1: base * 0.3, dur: 0.35, width: 14, a: CH.a, b: HOT, intensity: 2 });
        for (let k = 0; k < 4; k++) {
          const a = (k % 2 ? 0 : Math.PI) + rand(-0.4, 0.4), Ll = base * rand(0.1, 0.3);
          this.bolt(x, yy, x + Math.cos(a) * Ll, yy + Math.sin(a) * Ll * 0.4, { width: 3, life: 0.14, branch: 0.5 });
        }
        for (let k = 0; k < 40; k++) this.spark(x, yy, -Math.PI / 2 + rand(-1.3, 1.3), rand(400, 1600), { grav: 1600, life: rand(0.3, 0.7) });
        phys.blast(x, yy, base * 0.5, 2200);
        phys.burst(x, yy, 8, 'rock', { speed: 1000, size: 12, up: 600, kinds: ['rock', 'glass'], cone: 2.4 });
        if (i === 4 || i === 9) overlay.sfxText('DOOOM!', x, Math.max(H * 0.5, yy), 1.1, [255, 240, 150]);
        sfx.play('thunder', 1.0);
      });
    }
  }

  // ---------- Arc Link ----------
  updateLink(hands, dt, time, levels) {
    const k = this.link, L = hands.L, R = hands.R;
    const { sfx, overlay, fx } = this.ctx;
    k.cool -= dt; k.calloutCool -= dt;
    let cond = false, d = 0, sc = 80;
    if (L.present && R.present) {
      sc = (L.scale + R.scale) / 2;
      d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      cond = (L.isOpen || L.cupped) && (R.isOpen || R.cupped) && d > 2.4 && d < 14;
      // Overload: a live link slammed shut.
      const closing = k.prevD ? (k.prevD - d) / Math.max(dt, 1e-3) : 0;
      if (k.level > 0.5 && d < CONFIG.touchDist * 1.6 && closing > 6 && k.cool <= 0) {
        this.overload((L.cx + R.cx) / 2, (L.cy + R.cy) / 2, sc);
        k.cool = 1.6;
        k.level = 0;
      }
      // Sky Storm: raise a live link fast.
      const rise = -((L.vy + R.vy) / 2) / sc;
      if (k.level > 0.5 && rise > CONFIG.slamSpeed * 0.85 && this.stormCool <= 0) this.stormCall(L, R, sc);
      k.prevD = d;
    } else {
      k.prevD = 0;
    }
    k.t = cond ? k.t + dt : 0;
    const want = cond && k.t > 0.15 ? 1 : 0;
    k.level = damp(k.level, want, want ? 4 : 10, dt);
    if (want && !k.on) {
      k.on = true;
      if (k.calloutCool <= 0) {
        overlay.callout('雷鎖', 'Arc Link');
        this.ctx.onMove(2);
        k.calloutCool = 3;
      }
      sfx.play('zap', 1.5);
    }
    if (!want) k.on = false;
    const lv = k.level;
    if (lv < 0.02 || !L.present || !R.present) return false;

    k.boltT -= dt;
    if (k.boltT <= 0) {
      k.boltT = 0.04;
      const n = 2 + Math.floor(lv * 2);
      for (let i = 0; i < n; i++) {
        this.bolt(L.cx, L.cy, R.cx, R.cy, { width: (3 + lv * 6) * (i ? 0.6 : 1), jag: 0.18, depth: 6, branch: 0.4, life: 0.06, bright: 2 + lv });
      }
      // fingertip tendrils reach across
      for (let i = 0; i < 2; i++) {
        const a = L.pts[pick([4, 8, 12, 16, 20])], b = R.pts[pick([4, 8, 12, 16, 20])];
        this.bolt(a.x, a.y, lerp(a.x, b.x, rand(0.2, 0.6)), lerp(a.y, b.y, rand(0.2, 0.6)), { width: 1.8, depth: 4, branch: 0, life: 0.05 });
        this.bolt(b.x, b.y, lerp(b.x, a.x, rand(0.2, 0.6)), lerp(b.y, a.y, rand(0.2, 0.6)), { width: 1.8, depth: 4, branch: 0, life: 0.05 });
      }
    }
    // Conduit: a charged body feeds the link, so every finger throws lightning outward.
    if (this.charged > 0 && lv > 0.3) {
      if (this.conduitCool <= 0) {
        overlay.callout('雷導', 'Conduit');
        this.ctx.onMove(6);
        this.conduitCool = 4;
        Post.flashScreen(0.4, HOT);
        sfx.play('zap', 1.8);
      }
      this.conduitCool = Math.max(this.conduitCool, 0.5);
      const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
      const mx = (L.cx + R.cx) / 2, my = (L.cy + R.cy) / 2;
      if (k.boltT > 0.03) {
        for (const h of [L, R]) {
          for (const ti of [4, 8, 12, 16, 20]) {
            if (Math.random() > 0.55) continue;
            const p = h.pts[ti];
            let ax = p.x - mx, ay = p.y - my - base * 0.25;
            const m = Math.hypot(ax, ay) || 1;
            const a = Math.atan2(ay / m, ax / m) + rand(-0.5, 0.5), Ll = base * rand(0.25, 0.75);
            this.bolt(p.x, p.y, p.x + Math.cos(a) * Ll, p.y + Math.sin(a) * Ll, { width: 3.2, depth: 6, branch: 0.6, life: 0.07, bright: 2.4 });
          }
        }
        this.ctx.phys.blast(mx, my, base * 0.6, 260);
        Post.aberrate(4);
      }
      Post.wantAura(0.9, CH.a, CH.b);
      Post.shake(dt * 0.6);
    }
    if (Math.random() < lv) {
      const t = Math.random();
      this.spark(lerp(L.cx, R.cx, t), lerp(L.cy, R.cy, t), rand(0, TAU), rand(200, 700));
    }
    k.mx = (L.cx + R.cx) / 2; k.my = (L.cy + R.cy) / 2;
    sfx.loop('buzz', 0.5 + lv * 0.5);
    Post.wantAura(0.3 + lv * 0.45, CH.a, CH.b);
    Post.wantDim(lv * 0.45);
    Post.shake(dt * 0.5 * lv);
    levels[0] = Math.max(levels[0], 0.8 + lv);
    levels[1] = Math.max(levels[1], 0.8 + lv);
    return lv > 0.3;
  }

  overload(x, y, sc) {
    const { fx, sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    Post.impact(0.12, [1, 1, 0.9]);
    Post.flashScreen(0.8, HOT);
    Post.freeze(0.1);
    Post.shake(1);
    Post.punch(2.6, x, y);
    Post.aberrate(16);
    Post.bloom(2.5);
    Post.glitchFor(0.6);
    Post.shockwave({ x, y, speed: 1700, width: 90, strength: 50, life: 0.8 });
    Post.shockwave({ x, y, speed: 900, width: 60, strength: 30, life: 0.9 });
    fx.glow({ x, y, s0: sc, s1: diag * 0.9, dur: 0.5, a: CH.a, b: HOT, intensity: 4 });
    fx.ring({ x, y, r0: 10, r1: diag * 0.7, dur: 0.7, width: 40, a: CH.a, b: HOT, noise: 0.25, intensity: 2.2 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rand(-0.1, 0.1);
      const e = toEdge(x, y, Math.cos(a), Math.sin(a), 0);
      this.bolt(x, y, e.x, e.y, { width: 7, life: 0.18, branch: 0.8, depth: 6 });
    }
    this.after(0.09, () => {
      for (let i = 0; i < 10; i++) {
        const a = rand(0, TAU), e = toEdge(x, y, Math.cos(a), Math.sin(a), 0);
        this.bolt(x, y, e.x, e.y, { width: 5, life: 0.12, branch: 0.6 });
      }
    });
    for (let i = 0; i < 200; i++) this.spark(x, y, rand(0, TAU), rand(600, 2400), { life: rand(0.25, 0.6) });
    const { phys } = this.ctx;
    phys.blast(x, y, diag * 0.6, this.charged > 0 ? 4200 : 2600);
    phys.burst(x, y, 22, 'rock', { speed: 1300, size: 13, up: 500, kinds: ['rock', 'glass'] });
    if (this.charged > 0) {
      // a charged body turns the overload into a full storm
      for (let i = 0; i < 8; i++) this.after(0.05 + i * 0.06, () => {
        const sx = rand(0.1, 0.9) * W, sy = rand(0.45, 0.9) * H;
        this.bolt(sx + rand(-80, 80), -30, sx, sy, { width: 12, jag: 0.14, depth: 7, branch: 1, life: 0.1, bright: 3 });
        Post.flashScreen(0.3, HOT); Post.shake(0.6);
        phys.blast(sx, sy, 300, 1800);
      });
      Post.glitchFor(0.9);
      this.charged = 0;
    }
    this.lines = { t: 0.55, x, y };
    overlay.callout('過負荷', 'Overload', { big: true });
    overlay.crack(x, y, 1.5);
    sfx.play('overload');
    this.ctx.onMove(2);
  }
}
