// Ember: projectile and combustion physics.
import { CONFIG, CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad, Sigil, Trail, makeSigilTextures } from '../render/objects.js';
import { clamp, rand, pick, lerp, TAU, easeInCubic, damp } from '../util.js';

const CH = CHARACTERS.ember;
const FIRE = [[1, 0.3, 0.06], [1, 0.5, 0.1], [1, 0.72, 0.25], [1, 0.9, 0.55]];

function release(src) {
  const i = Post.persistent.indexOf(src);
  if (i >= 0) Post.persistent.splice(i, 1);
}

export class Ember {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    const tex = makeSigilTextures('ember', 11);
    this.slots = {};
    for (const s of ['L', 'R']) {
      this.slots[s] = {
        charge: 0, ready: false, ox: 0, oy: 0, size: 80,
        sigil: new Sigil(S, tex, CH.a, CH.b),
        orb: new FXQuad(S, 'fireOrb', { a: CH.a, b: CH.b, intensity: 0 }),
        trail: new Trail(S, { width: 60, life: 0.3, fire: true }),
        whip: false, whipT: 0, whipCool: 0, calloutCool: 0, heat: null,
        jet: 0, jetHeat: null, jetCallout: 0,
        muzzle: new FXQuad(S, 'fireOrb', { a: CH.a, b: CH.b, intensity: 0 }),
      };
    }
    this.projectiles = [];
    this.nova = { togetherT: 0, lastTogether: -9, cool: 0, mid: { x: 0, y: 0 }, sc: 80,
      orb: new FXQuad(S, 'fireOrb', { a: CH.a, b: CH.b, intensity: 0 }) };
    this.wall = { level: 0, on: false, t: 0, off: 0, x: 0, y: 0, w: 0, sc: 80,
      quad: new FXQuad(S, 'flameWall', { intensity: 0 }), heat: null };
    this.lines = { t: 0, x: 0, y: 0 };
  }

  enter() {
    for (const st of Object.values(this.slots)) { st.heat = Post.source('heat'); st.jetHeat = Post.source('heat'); }
    this.wall.heat = Post.source('heat');
  }

  exit() {
    for (const st of Object.values(this.slots)) {
      st.charge = 0; st.ready = false; st.whip = false;
      st.sigil.target = 0; st.sigil.level = 0; st.sigil.update(0, 0, 0, 0, 1);
      st.orb.intensity = 0;
      st.trail.pts.length = 0; st.trail.update(0);
      release(st.heat); st.heat = null;
      release(st.jetHeat); st.jetHeat = null;
      st.jet = 0; st.muzzle.intensity = 0;
    }
    this.nova.orb.intensity = 0; this.nova.togetherT = 0;
    this.wall.on = false; this.wall.level = 0; this.wall.quad.intensity = 0;
    release(this.wall.heat); this.wall.heat = null;
    this.projectiles.forEach((p) => this.disposeProjectile(p));
    this.projectiles.length = 0;
  }

  update(dt, time, hands) {
    const levels = [0.3, 0.3];
    levels[0] = this.updateHand(this.slots.L, hands.L, dt, time);
    levels[1] = this.updateHand(this.slots.R, hands.R, dt, time);
    this.updateNova(hands, dt, time);
    this.updateWall(hands, dt, time, levels);
    this.updateProjectiles(dt, time);
    this.ambient(dt);
    if (this.lines.t > 0) {
      this.lines.t -= dt;
      this.ctx.overlay.speedLines(Math.min(1, this.lines.t * 3), this.lines.x, this.lines.y);
    }
    return levels;
  }

  // ---------- particles ----------
  ember(x, y, o = {}) {
    return this.ctx.particles.spawn({
      x, y, vx: o.vx ?? rand(-40, 40), vy: o.vy ?? rand(-120, -30), grav: -140, drag: 1.1,
      life: o.life ?? rand(0.5, 1.1), c: pick(FIRE), bright: o.bright ?? 1.5,
      size: o.size ?? rand(4, 9), size1: 1, fade: 1.2, flicker: 0.35,
    });
  }
  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, grav: o.grav ?? 650, drag: o.drag ?? 1.6,
      life: o.life ?? rand(0.25, 0.6), c: pick(FIRE), bright: o.bright ?? 2.4,
      width: o.width ?? rand(1.5, 3.2), stretch: o.stretch ?? 0.03, fade: 1.3,
    });
  }
  spiralTo(st) {
    return (p, dt) => {
      const dx = st.ox - p.x, dy = st.oy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const vr = 260 + Math.max(0, 1 - d / (st.size * 3)) * 520;
      p.vx = (dx / d) * vr - (dy / d) * 240;
      p.vy = (dy / d) * vr + (dx / d) * 240;
      if (d < st.size * 0.25) p.life = 0;
    };
  }

  // ---------- Palm Orb + Flame Whip ----------
  updateHand(st, h, dt, time) {
    const { sfx, overlay, fx, particles } = this.ctx;
    st.whipCool -= dt;
    st.calloutCool -= dt;
    let level = 0.3;

    if (!h.present) {
      st.charge = Math.max(0, st.charge - CONFIG.chargeDecay * dt);
      st.ready = false;
      st.whip = false;
    } else {
      st.size = h.scale;
      st.ox = lerp(h.cx, h.pts[9].x, 0.25);
      st.oy = lerp(h.cy, h.pts[9].y, 0.25);
      const nearNova = this.nova.togetherT > 0 || time - this.nova.lastTogether < 0.5;
      if (nearNova) {
        st.charge = Math.max(0, st.charge - CONFIG.chargeDecay * 2 * dt);
        st.ready = false;
      } else if (h.cupped && h.still) {
        st.charge = Math.min(1, st.charge + (dt * this.ctx.voice.boost) / CONFIG.chargeTime);
        if (st.charge >= 1 && !st.ready) {
          st.ready = true;
          fx.ring({ x: st.ox, y: st.oy, r0: h.scale * 0.6, r1: h.scale * 3.2, dur: 0.45, width: 10, fire: true });
          sfx.play('ready');
          Post.bloom(0.6);
        }
      } else if (h.fist) {
        st.charge = Math.max(0, st.charge - CONFIG.chargeDecay * 3 * dt);
        st.ready = false;
      } else if (st.charge > 0.25 && (h.flick || h.thrust)) {
        const toCam = h.thrust && (!h.flick || h.scaleRate > CONFIG.thrustRate * 1.3);
        this.launch(st, h, toCam ? 'camera' : 'lateral');
      } else {
        st.charge = Math.max(0, st.charge - CONFIG.chargeDecay * dt);
        if (st.charge < 0.99) st.ready = false;
      }

      // Flame Whip: fast-moving fist leaves a burning ribbon; snaps at the end.
      const whipOn = h.fist && h.speed > CONFIG.swipeSpeed * (st.whip ? 0.6 : 1);
      if (whipOn) {
        if (!st.whip) {
          st.whip = true;
          st.whipT = 0;
          if (st.whipCool <= 0) { sfx.play('whip'); st.whipCool = 0.25; }
          if (st.calloutCool <= 0) { overlay.callout('炎鞭', 'Flame Whip'); this.ctx.onMove(1); st.calloutCool = 2.5; }
        }
        st.whipT += dt;
        st.trail.width = h.scale * 1.2;
        st.trail.push(h.cx, h.cy, time);
        for (let i = 0; i < 3; i++) {
          const a = Math.atan2(h.vy, h.vx) + Math.PI + rand(-0.6, 0.6);
          this.spark(h.cx + rand(-8, 8), h.cy + rand(-8, 8), a, rand(150, 500));
        }
        this.ember(h.cx, h.cy, { vx: -h.vx * 0.1 + rand(-40, 40) });
        level = 1.1;
      } else if (st.whip) {
        st.whip = false;
        if (st.whipT > 0.08) this.crack(h.cx, h.cy, h.scale);
      }
    }

    const c = st.charge;
    st.orb.set(st.ox, st.oy, st.size * (0.45 + c * 1.15));
    st.orb.intensity = c > 0.01 ? 0.3 + c * 0.75 : 0;
    st.orb.param(c, 0, 0, 0);
    st.orb.tick(time);
    st.sigil.target = c > 0.04 ? 1 : 0;
    st.sigil.charge = c;
    st.sigil.update(dt, time, st.ox, st.oy, st.size * (2.8 + c * 1.3), 0.5 + c * 4.5);
    if (st.heat) {
      st.heat.x = st.ox; st.heat.y = st.oy;
      st.heat.radius = st.size * (1.2 + c * 2);
      st.heat.strength = c * 3.2;
    }
    if (c > 0.01) {
      const n = Math.floor((25 + c * 90) * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), r = st.size * rand(1.6, 2.9);
        particles.spawn({
          x: st.ox + Math.cos(a) * r, y: st.oy + Math.sin(a) * r, life: rand(0.35, 0.65),
          c: pick(FIRE), bright: 0.6, size: rand(4, 8), size1: 2, fade: 0.7, fn: this.spiralTo(st),
        });
      }
      if (Math.random() < c * 0.6) this.spark(st.ox, st.oy, rand(0, TAU), rand(200, 520), { life: 0.3 });
      sfx.loop('charge', c);
      Post.wantDim(c * 0.5);
      Post.wantZoom(c * 0.08, st.ox, st.oy);
      Post.wantAura(c * 0.55, CH.a, CH.b);
      if (c > 0.85) overlay.speedLines(((c - 0.85) / 0.15) * 0.6, st.ox, st.oy);
      level = Math.max(level, 0.35 + c * 1.3);
    }
    st.trail.update(time);
    if (h.present) this.fingerFlames(h, dt);
    return Math.max(level, this.updateJet(st, h, dt, time));
  }

  // Small flames always licking off the fingertips: the hand is on fire.
  fingerFlames(h, dt) {
    for (const i of [4, 8, 12, 16, 20]) {
      if (Math.random() > dt * 9) continue;
      const p = h.pts[i];
      this.ctx.particles.spawn({
        x: p.x + rand(-3, 3), y: p.y + rand(-3, 3), vx: rand(-20, 20) + h.vx * 0.2, vy: rand(-160, -90),
        grav: -200, drag: 1.5, life: rand(0.25, 0.45), c: pick(FIRE), bright: rand(0.8, 1.3),
        size: rand(6, 10), size1: 2, fade: 1, flicker: 0.4,
      });
    }
  }

  // ---------- Dragon Fire ----------
  // A pressurized stream: particles leave the fingertip fast, drag slows them,
  // buoyancy lifts them and they swell as they cool, so it reads as fluid.
  updateJet(st, h, dt, time) {
    const { sfx, overlay } = this.ctx;
    st.jetCallout -= dt;
    const want = h.present && h.point && h.pointTime > 0.2 ? 1 : 0;
    st.jet = damp(st.jet, want, want ? 7 : 10, dt);
    if (st.jet < 0.01) {
      st.jet = 0;
      st.muzzle.intensity = 0;
      if (st.jetHeat) st.jetHeat.strength = 0;
      return 0.3;
    }
    const J = st.jet;
    const x = h.tipX + h.pdx * h.scale * 0.15, y = h.tipY + h.pdy * h.scale * 0.15;
    const ang = Math.atan2(h.pdy, h.pdx);
    if (want && st.jetCallout <= 0) {
      overlay.callout('火龍', 'Dragon Fire');
      this.ctx.onMove(4);
      sfx.play('whoomp');
      st.jetCallout = 3;
    }
    const n = Math.floor(260 * J * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-0.13, 0.13), v = rand(900, 1500) * J;
      this.ctx.particles.spawn({
        x: x + rand(-4, 4), y: y + rand(-4, 4), vx: Math.cos(a) * v + h.vx * 0.3, vy: Math.sin(a) * v + h.vy * 0.3,
        grav: -520, drag: 2.2, life: rand(0.45, 0.8), c: pick(FIRE), bright: rand(0.9, 1.5),
        size: rand(5, 9), size1: rand(34, 58), fade: 1.4, flicker: 0.3,
      });
    }
    if (Math.random() < J) this.spark(x, y, ang + rand(-0.2, 0.2), rand(1200, 2000), { grav: -100, life: 0.35 });
    if (Math.random() < J * 0.4) this.ember(x + Math.cos(ang) * h.scale * 4, y + Math.sin(ang) * h.scale * 4, { vy: rand(-200, -60) });
    st.muzzle.set(x, y, h.scale * (0.6 + 0.2 * Math.sin(time * 40)));
    st.muzzle.intensity = 0.9 * J;
    st.muzzle.param(1, 0, 0, 0);
    st.muzzle.tick(time);
    if (st.jetHeat) {
      st.jetHeat.x = x + Math.cos(ang) * h.scale * 4;
      st.jetHeat.y = y + Math.sin(ang) * h.scale * 4 - h.scale;
      st.jetHeat.radius = h.scale * 5;
      st.jetHeat.strength = 5 * J;
    }
    sfx.loop('roar', J);
    Post.wantAura(0.4 * J, CH.a, CH.b);
    sfx.loop('beam', J * 0.5);
    Post.shake(dt * 0.9 * J);
    Post.wantDim(0.3 * J);
    return 0.6 + J;
  }

  crack(x, y, sc) {
    const { fx, sfx } = this.ctx;
    sfx.play('crack');
    fx.glow({ x, y, s0: sc * 0.5, s1: sc * 4, dur: 0.2, intensity: 2.2 });
    fx.ring({ x, y, r0: sc * 0.3, r1: sc * 2.5, dur: 0.3, width: 8, fire: true });
    Post.shockwave({ x, y, speed: 700, width: 40, strength: 14, life: 0.35 });
    Post.shake(0.18);
    for (let i = 0; i < 26; i++) this.spark(x, y, rand(0, TAU), rand(250, 800));
  }

  launch(st, h, mode) {
    const { fx, sfx, overlay, scene } = this.ctx;
    sfx.play('throw');
    overlay.callout('火球', 'Palm Orb');
    this.ctx.onMove(0);
    Post.shake(0.22);
    Post.bloom(0.8);
    const size = st.size * (0.8 + st.charge * 0.6);
    const orb = new FXQuad(scene, 'fireOrb', { a: CH.a, b: CH.b, intensity: 1.2 });
    orb.param(1, 0, 0, 0);
    const d = h.dir();
    const p = {
      mode, x: st.ox, y: st.oy, sx: st.ox, sy: st.oy, t: 0,
      vx: d.x * 1700, vy: d.y * 1700 - 180,
      life: mode === 'camera' ? 0.42 : 0.8, size, orb,
      trail: new Trail(scene, { width: size * 0.9, life: 0.2, fire: true }),
      heat: Post.source('heat'),
    };
    this.projectiles.push(p);
    fx.glow({ x: st.ox, y: st.oy, s0: size, s1: size * 4, dur: 0.25 });
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
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        s = p.size * (1 + 0.15 * Math.sin(p.t * 40));
      } else {
        const k = easeInCubic(Math.min(1, p.t / p.life));
        p.x = lerp(p.sx, W / 2, k * 0.6);
        p.y = lerp(p.sy, H / 2, k * 0.6);
        s = p.size + (Math.max(W, H) * 1.8 - p.size) * k;
      }
      p.orb.set(p.x, p.y, s);
      p.orb.tick(time);
      p.trail.push(p.x, p.y, time);
      p.trail.update(time);
      p.heat.x = p.x; p.heat.y = p.y; p.heat.radius = s * 1.2; p.heat.strength = 4;
      for (let j = 0; j < 3; j++) this.ember(p.x + rand(-s, s) * 0.3, p.y + rand(-s, s) * 0.3, { life: rand(0.3, 0.6) });
      if (Math.random() < 0.7) this.spark(p.x, p.y, Math.atan2(-p.vy, -p.vx) + rand(-0.5, 0.5), rand(200, 500));
      const off = p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80;
      if (p.t >= p.life || (p.mode === 'lateral' && off)) {
        this.explode(clamp(p.x, 0, W), clamp(p.y, 0, H), p.mode === 'camera' ? 2.2 : 1);
        this.disposeProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  disposeProjectile(p) {
    p.orb.dispose();
    p.trail.dispose();
    release(p.heat);
  }

  explode(x, y, power) {
    const { fx, sfx, overlay } = this.ctx;
    power *= this.ctx.voice.power;
    const base = Math.min(window.innerWidth, window.innerHeight);
    fx.glow({ x, y, s0: base * 0.1 * power, s1: base * 0.9 * power, dur: 0.45, a: [1, 0.45, 0.1], b: [1, 0.9, 0.6], intensity: 3 });
    fx.ring({ x, y, r0: 10, r1: base * 0.45 * power, dur: 0.55, width: 26 * power, fire: true, noise: 0.12 });
    Post.shockwave({ x, y, speed: 1100 * power, width: 70, strength: 28 * power, life: 0.6 });
    Post.shake(0.4 * power);
    Post.flashScreen(0.18 * power, [1, 0.75, 0.45]);
    Post.aberrate(5 * power);
    Post.punch(1.2 * power, x, y);
    Post.bloom(1.2 * power);
    if (power > 1.5) {
      Post.impact(0.09, [1, 0.94, 0.86]);
      this.lines = { t: 0.4, x, y };
      overlay.crack(x, y, 1.1);
    }
    const n = Math.floor(70 * power);
    for (let i = 0; i < n; i++) this.spark(x, y, rand(0, TAU), rand(400, 1400) * power, { grav: 500 });
    for (let i = 0; i < 40 * power; i++) {
      const a = rand(0, TAU), v = rand(80, 420);
      this.ember(x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rand(6, 14) });
    }
    sfx.play('explode', power > 1.5 ? 1.5 : 1);
    overlay.letterbox(0);
  }

  // ---------- Nova Burst ----------
  updateNova(hands, dt, time) {
    const n = this.nova, L = hands.L, R = hands.R;
    n.cool -= dt;
    let build = 0;
    if (L.present && R.present) {
      const sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      if (d < CONFIG.touchDist) {
        n.togetherT += dt;
        n.lastTogether = time;
        n.mid.x = (L.cx + R.cx) / 2;
        n.mid.y = (L.cy + R.cy) / 2;
        n.sc = sc;
        build = clamp(n.togetherT / 0.6, 0, 1);
      } else if (n.togetherT > 0 && time - n.lastTogether < 0.45 && d > CONFIG.novaApart && n.cool <= 0 && !this.wall.on) {
        this.novaBurst(n.mid.x, n.mid.y, clamp(n.togetherT / 0.6, 0.5, 1));
        n.togetherT = 0;
        n.cool = 1.2;
      } else if (time - n.lastTogether >= 0.45) {
        n.togetherT = 0;
      }
    } else {
      n.togetherT = 0;
    }
    n.orb.set(n.mid.x, n.mid.y, n.sc * (0.6 + build * 1.5));
    n.orb.intensity = build > 0 ? 0.3 + build * 1.3 : 0;
    n.orb.param(build, 0, 0, 0);
    n.orb.tick(time);
    if (build > 0) {
      if (Math.random() < 0.8) this.spark(n.mid.x, n.mid.y, rand(0, TAU), rand(150, 450), { life: 0.25 });
      this.ctx.sfx.loop('charge', 0.4 + build * 0.5);
      Post.wantDim(build * 0.4);
      Post.wantZoom(build * 0.13, n.mid.x, n.mid.y);
      Post.wantAura(build * 0.9, CH.a, CH.b);
      Post.shake(dt * 0.5 * build);
    }
  }

  novaBurst(x, y, power) {
    const { fx, sfx, overlay } = this.ctx;
    power *= this.ctx.voice.power;
    const W = window.innerWidth, H = window.innerHeight;
    const diag = Math.hypot(W, H), base = Math.min(W, H);
    Post.impact(0.11, [1, 0.96, 0.9]);
    Post.flashScreen(0.7, [1, 0.8, 0.55]);
    Post.shake(1);
    Post.punch(2.4 * power, x, y);
    Post.aberrate(11);
    Post.bloom(2.2);
    Post.shockwave({ x, y, speed: 1500, width: 90, strength: 48 * power, life: 0.8 });
    Post.shockwave({ x, y, speed: 850, width: 60, strength: 30 * power, life: 0.9 });
    fx.ring({ x, y, r0: 20, r1: diag * 0.7, dur: 0.85, width: 60, fire: true, noise: 0.18, intensity: 2 });
    fx.ring({ x, y, r0: 10, r1: diag * 0.5, dur: 0.45, width: 12, a: [1, 0.8, 0.5], b: [1, 1, 1] });
    fx.glow({ x, y, s0: base * 0.2, s1: base * 1.5, dur: 0.6, intensity: 4, a: [1, 0.45, 0.1], b: [1, 0.95, 0.8] });
    for (let i = 0; i < 240; i++) this.spark(x, y, rand(0, TAU), rand(600, 2200), { grav: 300, width: rand(2, 4.5), life: rand(0.4, 0.9) });
    for (let i = 0; i < 90; i++) {
      const a = rand(0, TAU), v = rand(150, 700);
      this.ember(x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rand(8, 16), life: rand(0.6, 1.3) });
    }
    overlay.callout('爆炎', 'Nova Burst', { big: true });
    overlay.crack(x, y, 1.4);
    Post.freeze(0.1);
    this.lines = { t: 0.5, x, y };
    sfx.play('nova');
    this.ctx.onMove(2);
  }

  // ---------- Wall of Flame ----------
  updateWall(hands, dt, time, levels) {
    const w = this.wall, L = hands.L, R = hands.R;
    const { sfx, overlay, fx } = this.ctx;
    let cond = false;
    if (L.present && R.present) {
      const sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      cond = L.isOpen && R.isOpen && Math.abs(L.cy - R.cy) / sc < CONFIG.levelTol && d > CONFIG.wallSpread
        && L.speed < CONFIG.stillSpeed * 1.8 && R.speed < CONFIG.stillSpeed * 1.8;
      if (cond || w.on) {
        const x0 = Math.min(L.cx, R.cx), x1 = Math.max(L.cx, R.cx);
        w.x = (x0 + x1) / 2;
        w.w = x1 - x0 + sc * 1.6;
        w.y = (L.cy + R.cy) / 2 + sc * 0.7;
        w.sc = sc;
      }
    }
    if (cond) { w.t += dt; w.off = 0; } else { w.off += dt; w.t = 0; }
    if (!w.on && w.t > 0.25) {
      w.on = true;
      sfx.play('whoomp');
      overlay.callout('炎壁', 'Wall of Flame');
      this.ctx.onMove(3);
      Post.shake(0.35);
      fx.glow({ x: w.x, y: w.y, s0: w.w * 0.3, s1: w.w * 1.2, dur: 0.4, intensity: 2 });
    }
    if (w.on && w.off > 0.25) w.on = false;
    w.level += ((w.on ? 1 : 0) - w.level) * (1 - Math.exp(-dt * (w.on ? 5 : 7)));
    const H = w.sc * 3.2 * (0.3 + 0.7 * w.level);
    w.quad.set(w.x, w.y - H / 2, w.w, H);
    w.quad.param(w.w / 60, 0, 0, 0);
    w.quad.intensity = w.level > 0.01 ? w.level * 1.1 : 0;
    w.quad.tick(time);
    if (w.heat) {
      w.heat.x = w.x; w.heat.y = w.y - H * 0.45;
      w.heat.radius = Math.max(w.w, H) * 0.65;
      w.heat.strength = w.level * 4.5;
    }
    if (w.level > 0.05) {
      const n = Math.floor(70 * w.level * dt + Math.random());
      for (let i = 0; i < n; i++) {
        this.ember(w.x + rand(-0.5, 0.5) * w.w, w.y - rand(0.2, 0.9) * H, { vy: rand(-260, -90), size: rand(5, 11) });
      }
      if (Math.random() < w.level) this.spark(w.x + rand(-0.5, 0.5) * w.w, w.y - rand(0, 0.6) * H, -Math.PI / 2 + rand(-0.4, 0.4), rand(200, 600), { grav: -200 });
      sfx.loop('roar', w.level);
      Post.wantDim(0.4 * w.level);
      Post.wantZoom(0.05 * w.level, w.x, w.y - H * 0.4);
      Post.wantAura(0.7 * w.level, CH.a, CH.b);
      Post.shake(dt * 0.6 * w.level);
      overlay.letterbox(w.level);
      levels[0] = Math.max(levels[0], 0.5 + w.level);
      levels[1] = Math.max(levels[1], 0.5 + w.level);
    }
  }

  ambient(dt) {
    if (Math.random() < dt * 8) {
      const W = window.innerWidth, H = window.innerHeight;
      this.ember(rand(0, W), H + 10, { vy: rand(-110, -50), life: rand(2.5, 4.5), size: rand(3, 6), bright: 0.9 });
    }
  }
}
