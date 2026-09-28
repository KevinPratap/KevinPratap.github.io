// Nyx: a live attraction/repulsion field acting on a swarm of void motes,
// plus a real screen-space black hole that bends the camera image.
import { CONFIG, CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { FXQuad, Sigil, Trail, makeSigilTextures } from '../render/objects.js';
import { clamp, rand, pick, TAU, damp, lerp } from '../util.js';

const CH = CHARACTERS.nyx;
const VOID = [[0.55, 0.35, 1], [0.7, 0.5, 1], [0.9, 0.8, 1], [0.42, 0.26, 0.95]];
const MOTES = 200;

function release(src) {
  const i = Post.persistent.indexOf(src);
  if (i >= 0) Post.persistent.splice(i, 1);
}

export class Nyx {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const S = ctx.scene;
    const tex = makeSigilTextures('nyx', 23);
    this.slots = {};
    for (const s of ['L', 'R']) {
      this.slots[s] = {
        pull: 0, calloutCool: 0, pushCool: 0, x: 0, y: 0, size: 80,
        sigil: new Sigil(S, tex, CH.a, CH.b),
        disk: new FXQuad(S, 'voidDisk', { a: CH.a, b: CH.b, intensity: 0, param: [0.28, 0.95, 3, 0] }),
        lens: null, swirl: null,
        slash: false, sx: 0, sy: 0, ex: 0, ey: 0, slashT: 0, riftCool: 0,
        blade: new Trail(S, { width: 30, life: 0.22, fire: false, a: CH.a, b: [1, 1, 1] }),
      };
    }
    this.sing = {
      t: 0, on: false, portal: false, level: 0, pr: 0, x: 0, y: 0, sc: 80, lost: 0,
      disk: new FXQuad(S, 'voidDisk', { a: [0.42, 0.18, 1.0], b: [0.9, 0.7, 1.0], intensity: 0, param: [0.3, 0.95, 3, 0] }),
      inner: new FXQuad(S, 'voidDisk', { a: [0.3, 0.1, 0.6], b: [0.6, 0.4, 1], intensity: 0, param: [0.02, 0.9, 4, 0] }),
      sigil: new Sigil(S, tex, CH.a, CH.b),
      lens: null, swirl: null,
    };
    this.motes = [];
    this.forces = [];
    this.timers = [];
    this.moteFn = (p, dt) => this.moveMote(p, dt);
  }

  enter() {
    for (const st of Object.values(this.slots)) { st.lens = Post.source('lens'); st.swirl = Post.source('swirl'); }
    this.sing.lens = Post.source('lens');
    this.sing.swirl = Post.source('swirl');
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < MOTES; i++) {
      const p = this.ctx.particles.spawn({
        x: rand(0, W), y: rand(0, H), life: 1e9, c: pick(VOID), bright: rand(0.5, 1.1),
        size: rand(3, 7), fade: 0, flicker: 0.25, tag: 'keep', fn: this.moteFn,
      });
      if (!p) break;
      p.dvx = rand(-14, 14); p.dvy = rand(-14, 14);
      p.vx = p.dvx; p.vy = p.dvy;
      this.motes.push(p);
    }
  }

  exit() {
    for (const st of Object.values(this.slots)) {
      st.pull = 0; st.slash = false;
      st.blade.pts.length = 0; st.blade.update(0);
      st.sigil.target = 0; st.sigil.level = 0; st.sigil.update(0, 0, 0, 0, 1);
      st.disk.intensity = 0;
      release(st.lens); release(st.swirl); st.lens = st.swirl = null;
    }
    const s = this.sing;
    s.t = 0; s.on = false; s.portal = false; s.level = 0; s.pr = 0;
    s.disk.intensity = 0; s.inner.intensity = 0;
    s.sigil.target = 0; s.sigil.level = 0; s.sigil.update(0, 0, 0, 0, 1);
    release(s.lens); release(s.swirl); s.lens = s.swirl = null;
    this.motes.forEach((p) => { p.life = 0; p.tag = null; p.fn = null; });
    this.motes.length = 0;
    this.forces.length = 0;
    this.timers.length = 0;
  }

  moveMote(p, dt) {
    for (const f of this.forces) {
      const dx = f.x - p.x, dy = f.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > f.r * f.r) continue;
      const d = Math.sqrt(d2) || 1;
      const k = 1 - d / f.r;
      const ax = dx / d, ay = dy / d;
      p.vx += (ax * f.pull * k - ay * f.swirl * k) * dt;
      p.vy += (ay * f.pull * k + ax * f.swirl * k) * dt;
      if (f.kill && d < f.kill) { this.respawn(p); return; }
    }
    const relax = this.forces.length ? 0.3 : 1.2;
    p.vx += (p.dvx - p.vx) * dt * relax;
    p.vy += (p.dvy - p.vy) * dt * relax;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 1700) { p.vx *= 1700 / sp; p.vy *= 1700 / sp; }
    const W = window.innerWidth, H = window.innerHeight;
    if (p.x < -30) p.x = W + 30; else if (p.x > W + 30) p.x = -30;
    if (p.y < -30) p.y = H + 30; else if (p.y > H + 30) p.y = -30;
  }

  respawn(p) {
    const W = window.innerWidth, H = window.innerHeight;
    const side = (Math.random() * 4) | 0;
    p.x = side === 0 ? -20 : side === 1 ? W + 20 : rand(0, W);
    p.y = side === 2 ? -20 : side === 3 ? H + 20 : rand(0, H);
    p.vx = rand(-30, 30); p.vy = rand(-30, 30);
  }

  impulse(x, y, radius, power, dir) {
    for (const p of this.motes) {
      const dx = p.x - x, dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > radius) continue;
      let k = 1 - d / radius;
      if (dir) k *= 0.3 + 0.7 * Math.max(0, (dx * dir.x + dy * dir.y) / d);
      p.vx += (dx / d) * power * k;
      p.vy += (dy / d) * power * k;
    }
  }

  streak(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: o.drag ?? 1.4, grav: 0,
      life: o.life ?? rand(0.3, 0.6), c: pick(VOID), bright: o.bright ?? 2.2,
      width: o.width ?? rand(1.5, 3), stretch: o.stretch ?? 0.04, fade: 1.2, fn: o.fn,
    });
  }

  inward(x, y, kill = 14) {
    return (p) => {
      const dx = x - p.x, dy = y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const v = 300 + 90000 / Math.max(d, 30);
      p.vx = (dx / d) * v - (dy / d) * v * 0.5;
      p.vy = (dy / d) * v + (dx / d) * v * 0.5;
      if (d < kill) p.life = 0;
    };
  }

  update(dt, time, hands) {
    this.forces.length = 0;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const levels = [0.3, 0.3];
    const singActive = this.updateSing(hands, dt, time, levels);
    levels[0] = Math.max(levels[0], this.updateHand(this.slots.L, hands.L, dt, time, singActive));
    levels[1] = Math.max(levels[1], this.updateHand(this.slots.R, hands.R, dt, time, singActive));
    return levels;
  }

  // ---------- Pull + Push ----------
  updateHand(st, h, dt, time, busy) {
    const { overlay, sfx, fx } = this.ctx;
    st.calloutCool -= dt;
    st.pushCool -= dt;
    this.updateSlash(st, h, dt, time);
    let want = 0;
    if (h.present && Math.random() < dt * 14) {
      // void wisps seeping off the fingertips
      const p = h.pts[pick([4, 8, 12, 16, 20])];
      this.ctx.particles.spawn({ x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-70, -20), drag: 1.2, life: rand(0.5, 0.9),
        c: pick(VOID), bright: 0.7, size: rand(5, 9), size1: 14, fade: 1.2, flicker: 0.2 });
    }
    if (h.present) {
      st.x = damp(st.x || h.cx, h.cx, 20, dt);
      st.y = damp(st.y || h.cy, h.cy, 20, dt);
      st.size = h.scale;
      if (!busy && (h.cupped || h.fist) && h.still) want = 1;
      if (!busy && h.isOpen && (h.flick || h.thrust) && st.pushCool <= 0) this.push(h, h.thrust && !h.flick);
    }
    st.pull = damp(st.pull, want, want ? 2.6 : 6, dt);
    if (st.pull < 0.003) st.pull = 0;
    const P = st.pull;
    if (P > 0.6 && want && st.calloutCool <= 0) {
      overlay.callout('引力', 'Pull');
      this.ctx.onMove(0);
      st.calloutCool = 3;
    }

    st.sigil.target = P > 0.05 ? 1 : 0;
    st.sigil.charge = P;
    st.sigil.update(dt, time, st.x, st.y, st.size * 3.1, -(0.6 + P * 3));
    st.disk.set(st.x, st.y, st.size * (0.6 + P * 1.4), undefined, 0);
    st.disk.intensity = P > 0.01 ? P * 0.75 : 0;
    st.disk.tick(time);
    if (st.lens) {
      st.lens.x = st.x; st.lens.y = st.y;
      st.lens.radius = st.size * 0.5;
      st.lens.strength = P * 0.5;
      st.lens.horizon = st.size * 0.13 * P;
      st.lens.seed = 0;
    }
    if (st.swirl) {
      st.swirl.x = st.x; st.swirl.y = st.y;
      st.swirl.radius = st.size * 3.2;
      st.swirl.strength = P * 0.9;
    }
    if (P > 0.01) {
      const r = Math.max(280, st.size * 6);
      this.forces.push({ x: st.x, y: st.y, r, pull: 2600 * P, swirl: 1500 * P, kill: st.size * 0.35 });
      const n = Math.floor(90 * P * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = st.size * rand(2.2, 3.6);
        this.streak(st.x + Math.cos(a) * d, st.y + Math.sin(a) * d, 0, 0, { life: 0.5, fn: this.inward(st.x, st.y, st.size * 0.2), drag: 0 });
      }
      sfx.loop('vortex', P);
      Post.wantDim(P * 0.35);
      Post.wantZoom(P * 0.06, st.x, st.y);
      Post.wantAura(P * 0.35, [0.4, 0.16, 1.0], [0.85, 0.7, 1.0]);
      return 0.35 + P * 1.1;
    }
    return 0.3;
  }

  // ---------- Rift Cut ----------
  updateSlash(st, h, dt, time) {
    st.riftCool -= dt;
    const fast = h.present && h.point && h.speed > CONFIG.slashSpeed * (st.slash ? 0.45 : 1);
    if (fast) {
      if (!st.slash) {
        st.slash = true; st.slashT = 0;
        st.sx = h.tipX; st.sy = h.tipY;
        this.ctx.sfx.play('whip');
      }
      st.slashT += dt;
      st.ex = h.tipX; st.ey = h.tipY;
      st.blade.width = h.scale * 0.5;
      st.blade.push(h.tipX, h.tipY, time);
      for (let i = 0; i < 2; i++) this.streak(h.tipX, h.tipY, Math.atan2(-h.vy, -h.vx) + rand(-0.4, 0.4), rand(100, 400), { life: 0.25 });
    } else if (st.slash) {
      st.slash = false;
      const len = Math.hypot(st.ex - st.sx, st.ey - st.sy);
      if (len > h.scale * 2.2 && st.riftCool <= 0 && st.slashT < 0.8) this.rift(st.sx, st.sy, st.ex, st.ey, h.scale);
    }
    st.blade.update(time);
  }

  rift(x0, y0, x1, y1, sc) {
    const { fx, sfx, overlay } = this.ctx;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // overshoot both ends: the cut runs past the fingertip
    const ax = x0 - ux * len * 0.25, ay = y0 - uy * len * 0.25;
    const bx = x1 + ux * len * 0.35, by = y1 + uy * len * 0.35;
    Post.tear({ x0: ax, y0: ay, x1: bx, y1: by, strength: 30, width: 12, life: 1.6 });
    Post.freeze(0.08);
    Post.shake(0.6);
    Post.aberrate(12);
    Post.flashScreen(0.2, [0.85, 0.75, 1]);
    Post.bloom(1.4);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    // the two sides of space get shoved apart
    for (const p of this.motes) {
      const rx = p.x - mx, ry = p.y - my;
      const along = rx * ux + ry * uy;
      if (Math.abs(along) > len * 0.9) continue;
      const perp = -rx * uy + ry * ux;
      const k = Math.exp(-Math.abs(perp) / 260);
      const s = perp < 0 ? -1 : 1;
      p.vx += -uy * s * 1600 * k; p.vy += ux * s * 1600 * k;
    }
    for (let i = 0; i < 90; i++) {
      const t = rand(0, 1);
      const px = lerp(ax, bx, t), py = lerp(ay, by, t);
      const side = Math.random() < 0.5 ? -1 : 1;
      this.streak(px, py, Math.atan2(ux * side, -uy * side) + rand(-0.3, 0.3), rand(300, 1100), { life: rand(0.3, 0.6) });
    }
    fx.glow({ x: mx, y: my, s0: sc, s1: len * 1.2, dur: 0.3, a: CH.a, b: [1, 1, 1], intensity: 2 });
    overlay.callout('空間斬', 'Rift Cut', { big: true, dur: 1.3 });
    sfx.play('tear');
    this.ctx.onMove(4);
    for (const st of Object.values(this.slots)) st.riftCool = 0.5;
  }

  push(h, toCamera) {
    const { fx, sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    const x = h.cx, y = h.cy;
    const dir = toCamera ? null : h.dir();
    const pw = this.ctx.voice.power;
    this.slots[h.slot].pushCool = 0.45;
    this.impulse(x, y, toCamera ? diag : diag * 0.7, (toCamera ? 2600 : 2000) * pw, dir);
    Post.shockwave({ x, y, speed: 1300, width: 80, strength: (toCamera ? 46 : 36) * pw, life: 0.75 });
    if (pw > 1.35) { Post.impact(0.08, [0.85, 0.78, 1]); this.ctx.overlay.crack(x, y, 1); }
    Post.shockwave({ x, y, speed: 700, width: 50, strength: 20, life: 0.6 });
    fx.ring({ x, y, r0: h.scale * 0.5, r1: diag * (toCamera ? 0.75 : 0.5), dur: 0.6, width: 22, a: CH.a, b: CH.b, noise: 0.05, intensity: 1.8 });
    fx.glow({ x, y, s0: h.scale, s1: h.scale * 6, dur: 0.3, a: CH.a, b: CH.b, intensity: 2.4 });
    Post.aberrate(toCamera ? 12 : 8);
    Post.shake(toCamera ? 0.7 : 0.45);
    Post.punch(toCamera ? 2 : 1, x, y);
    Post.bloom(1.2);
    if (toCamera) {
      Post.impact(0.08, [0.85, 0.78, 1]);
      Post.flashScreen(0.3, [0.7, 0.55, 1]);
    }
    for (let i = 0; i < 70; i++) {
      let a = rand(0, TAU);
      if (dir && Math.random() < 0.7) a = Math.atan2(dir.y, dir.x) + rand(-0.7, 0.7);
      this.streak(x, y, a, rand(500, 1600), { life: rand(0.3, 0.6) });
    }
    overlay.callout('斥力', 'Push');
    sfx.play('push');
    this.ctx.onMove(1);
  }

  // ---------- Singularity + Portal ----------
  updateSing(hands, dt, time, levels) {
    const s = this.sing, L = hands.L, R = hands.R;
    const { overlay, sfx, fx } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    const diag = Math.hypot(W, H), base = Math.min(W, H);
    let hold = false;
    if (L.present && R.present) {
      const sc = (L.scale + R.scale) / 2;
      const d = Math.hypot(L.cx - R.cx, L.cy - R.cy) / sc;
      const limit = CONFIG.touchDist * (s.on ? 1.6 : 1.25);
      if (d < limit && L.speed < CONFIG.stillSpeed * 2.2 && R.speed < CONFIG.stillSpeed * 2.2) {
        hold = true;
        const mx = (L.cx + R.cx) / 2, my = (L.cy + R.cy) / 2;
        s.x = s.t > 0 ? damp(s.x, mx, 10, dt) : mx;
        s.y = s.t > 0 ? damp(s.y, my, 10, dt) : my;
        s.sc = sc;
      }
    }
    s.lost = hold ? 0 : s.lost + dt;
    if (hold) s.t += dt * this.ctx.voice.boost;

    if (!s.on && s.t > 0.2) {
      s.on = true;
      overlay.callout('特異点', 'Singularity');
      this.ctx.onMove(2);
      sfx.play('whoomp');
      fx.ring({ x: s.x, y: s.y, r0: diag * 0.45, r1: s.sc * 0.5, dur: 0.45, width: 16, a: CH.a, b: CH.b, intensity: 1.6 });
    }
    if (s.on && !s.portal && s.t >= CONFIG.portalHold) this.openPortal();
    if (s.on && s.lost > 0.18) this.closeSing();
    if (!s.on && !hold) s.t = 0;

    s.level = damp(s.level, s.on ? clamp((s.t - 0.2) / 1.0, 0.15, 1) : 0, s.on ? 4 : 9, dt);
    s.pr = damp(s.pr, s.portal ? 1 : 0, s.portal ? 4 : 10, dt);
    const lv = s.level, pr = s.pr;
    if (lv < 0.003 && pr < 0.003) {
      s.disk.intensity = 0; s.inner.intensity = 0;
      s.sigil.target = 0; s.sigil.update(dt, time, s.x, s.y, 10);
      if (s.lens) s.lens.strength = 0;
      if (s.swirl) s.swirl.strength = 0;
      return false;
    }

    const holeR = s.sc * (0.3 + lv * 0.55);
    const portalR = clamp(s.sc * 2.2, base * 0.16, base * 0.3);
    const horizon = holeR + (portalR * 0.85 - holeR) * pr;
    s.lens.x = s.x; s.lens.y = s.y;
    s.lens.horizon = horizon;
    s.lens.seed = pr;
    s.lens.radius = horizon;
    s.lens.strength = 1.1 + lv * 0.35 + pr * 0.15;
    s.swirl.x = s.x; s.swirl.y = s.y;
    s.swirl.radius = horizon * 5;
    s.swirl.strength = 0.8 * lv + pr * 1.4;

    const diskS = (horizon * 2) / 0.3;
    s.disk.set(s.x, s.y, diskS, undefined, 0);
    s.disk.param(0.3, 0.95 - pr * 0.5, 2.5 + lv * 3 + pr * 3, 0);
    s.disk.intensity = 0.25 + lv * 0.35 - pr * 0.05;
    s.disk.tick(time);
    s.sigil.target = pr > 0.05 ? 1 : 0;
    s.sigil.charge = 1;
    s.sigil.update(dt, time, s.x, s.y, horizon * 3.6, 0.9);

    this.forces.push({ x: s.x, y: s.y, r: diag, pull: (1800 + 2600 * lv) * (1 - pr * 0.6), swirl: 900 + 2600 * pr, kill: pr > 0.5 ? 0 : horizon });
    const n = Math.floor((60 + 140 * lv) * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = diag * rand(0.35, 0.6);
      this.streak(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 0, 0, { life: 0.9, fn: this.inward(s.x, s.y, horizon * 1.05), drag: 0, width: rand(1.5, 3.5) });
    }
    if (pr > 0.3 && Math.random() < 0.8) {
      const a = rand(0, TAU);
      this.streak(s.x + Math.cos(a) * horizon * 1.1, s.y + Math.sin(a) * horizon * 1.1, a + Math.PI / 2, rand(400, 900), { life: 0.5 });
    }
    sfx.loop('drone', 0.35 + lv * 0.65);
    if (pr > 0.05) sfx.loop('hum', pr);
    Post.wantDim(0.5 + lv * 0.3 + pr * 0.15);
    Post.wantZoom(0.05 + lv * 0.08 + pr * 0.04, s.x, s.y);
    Post.wantAura(0.35 + lv * 0.45 + pr * 0.3, [0.4, 0.16, 1.0], [0.85, 0.7, 1.0]);
    Post.shake(dt * (0.5 + lv * 0.9 + pr * 0.6));
    overlay.letterbox(Math.max(lv, pr));
    levels[0] = Math.max(levels[0], 0.8 + lv);
    levels[1] = Math.max(levels[1], 0.8 + lv);
    return s.on;
  }

  openPortal() {
    const s = this.sing;
    const { fx, sfx, overlay } = this.ctx;
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    s.portal = true;
    Post.impact(0.12, [0.88, 0.8, 1]);
    Post.flashScreen(0.6, [0.75, 0.6, 1]);
    Post.shake(1);
    Post.punch(2.2, s.x, s.y);
    Post.aberrate(12);
    Post.bloom(2);
    Post.shockwave({ x: s.x, y: s.y, speed: 1600, width: 100, strength: 50, life: 0.9 });
    fx.ring({ x: s.x, y: s.y, r0: 20, r1: diag * 0.75, dur: 0.8, width: 40, a: CH.a, b: CH.b, noise: 0.12, intensity: 2.2 });
    fx.glow({ x: s.x, y: s.y, s0: 100, s1: diag, dur: 0.6, a: CH.a, b: [1, 1, 1], intensity: 3.2 });
    for (let i = 0; i < 160; i++) this.streak(s.x, s.y, rand(0, TAU), rand(700, 2200), { life: rand(0.4, 0.8), width: rand(2, 4) });
    this.impulse(s.x, s.y, diag, 1800);
    overlay.callout('虚空門', 'Portal', { big: true, dur: 1.6 });
    overlay.crack(s.x, s.y, 1.3);
    Post.freeze(0.1);
    sfx.play('portal');
    this.ctx.onMove(3);
  }

  closeSing() {
    const s = this.sing;
    const { fx, sfx } = this.ctx;
    const x = s.x, y = s.y, wasPortal = s.portal;
    const R = s.sc * (wasPortal ? 3 : 1);
    s.on = false; s.portal = false; s.t = 0;
    sfx.play('collapse');
    fx.ring({ x, y, r0: R * 1.4, r1: 4, dur: 0.3, width: 14, a: CH.a, b: CH.b, intensity: 1.8 });
    this.timers.push({
      t: 0.3,
      fn: () => {
        const diag = Math.hypot(window.innerWidth, window.innerHeight);
        Post.shockwave({ x, y, speed: 1400, width: 80, strength: wasPortal ? 44 : 30, life: 0.7 });
        Post.flashScreen(wasPortal ? 0.45 : 0.25, [0.8, 0.7, 1]);
        Post.shake(wasPortal ? 0.8 : 0.5);
        Post.punch(1.4, x, y);
        Post.aberrate(9);
        fx.glow({ x, y, s0: 40, s1: diag * 0.6, dur: 0.4, a: CH.a, b: [1, 1, 1], intensity: 3 });
        this.impulse(x, y, diag, wasPortal ? 2400 : 1600);
        for (let i = 0; i < 90; i++) this.streak(x, y, rand(0, TAU), rand(500, 1800));
      },
    });
  }
}
