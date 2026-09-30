// Orin: a telekinetic swordmaster. Grip an invisible hilt and a blade of
// light ignites out of your fist and follows your wrist. Training drones
// hunt you and fire bolts you can swing back at them. With an open hand you
// shove the room, with a claw you seize things and drag them through the
// air, crush them or throw them; raise both palms to lift everything, drop
// them to slam it down; claw both hands to pour lightning from every finger.
import { CHARACTERS } from '../config.js';
import { Post } from '../render/pipeline.js';
import { bolt } from '../render/objects.js';
import { pose, Hold } from '../signs.js';
import { clamp, rand, pick, TAU, damp, lerp, rgbToCss } from '../util.js';

const CH = CHARACTERS.force;
const JEDI = [0.22, 0.58, 1.0], JEDI_B = [0.82, 0.93, 1.0];
const SITH = [1.0, 0.1, 0.06], SITH_B = [1.0, 0.78, 0.72];
const BOLT_C = [1.0, 0.16, 0.08];
const ZAP = [[0.62, 0.66, 1], [0.85, 0.82, 1], [0.5, 0.45, 1]];
const MOVE = { saber: 0, push: 1, grip: 2, lift: 3, lightning: 4, deflect: 5 };

// Closest point on segment ab to p, and the distance.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return { d: Math.hypot(px - cx, py - cy), x: cx, y: cy, t };
}

// Where two segments cross, or null.
function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1 = bx - ax, r2 = by - ay, s1 = dx - cx, s2 = dy - cy;
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + r1 * t, y: ay + r2 * t };
}

export class Force {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = CH;
    const blade = () => ({
      on: false, k: 0, hold: new Hold(0.28), off: 0, lost: 0,
      bx: 0, by: 0, tx: 0, ty: 0, pbx: 0, pby: 0, ptx: 0, pty: 0, dx: 0, dy: -1, len: 0,
      px: 0, py: 0, spd: 0, swingCool: 0, fresh: true,
    });
    this.sab = { L: blade(), R: blade() };
    this.drones = [];
    this.bolts = [];
    this.halves = [];
    this.grip = null;
    this.gripHold = { L: new Hold(0.3), R: new Hold(0.3) };
    this.gripEnd = { L: -9, R: -9 };
    this.pushCool = { L: 0, R: 0 };
    this.lev = { on: false, hold: new Hold(0.45), y0: 0, lift: 0, off: 0, slam: 0, vyAvg: 0 };
    this.zap = { hold: new Hold(0.3), on: false, k: 0, called: false };
    this.dark = 0;
    this.training = 0; this.spawnT = 3; this.deflects = 0; this.hits = 0;
    this.clashCool = 0; this.painter = (g, dt) => this.paint(g, dt);
    this.time = 0;
  }

  get cA() { return this.dark > 0 ? SITH : JEDI; }
  get cB() { return this.dark > 0 ? SITH_B : JEDI_B; }

  enter() {
    this.ctx.overlay.painters.add(this.painter);
    // a pile of rubble and crates to throw around
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    for (let i = 0; i < 12; i++) {
      const x = rand(0.06, 0.94) * W;
      if (Math.abs(x - W / 2) < W * 0.14) continue;
      const s = this.ctx.phys.shard(x, rand(-0.4, -0.05) * H, rand(-60, 60), rand(0, 200), pick(['rock', 'rock', 'wood', 'steel']), base * rand(0.022, 0.04), { life: 1e9, stretch: rand(1, 1.5) });
      s.prop = true;
    }
    this.spawnT = 3.5; this.training = 0;
  }

  exit() {
    this.ctx.overlay.painters.delete(this.painter);
    for (const s of ['L', 'R']) { const b = this.sab[s]; b.on = false; b.k = 0; b.hold.reset(); }
    this.drones.length = 0; this.bolts.length = 0; this.halves.length = 0;
    this.grip = null; this.lev.on = false; this.zap.on = false; this.dark = 0;
    this.ctx.phys.gscale = 1;
  }

  spark(x, y, a, speed, o = {}) {
    return this.ctx.streaks.spawn({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, drag: o.drag ?? 2.2, grav: o.grav ?? 900,
      life: o.life ?? rand(0.2, 0.5), c: o.c || pick([[1, 0.85, 0.5], [1, 0.6, 0.2], [1, 1, 0.9]]), bright: o.bright ?? 2.4,
      width: o.width ?? rand(1.4, 2.6), stretch: o.stretch ?? 0.035, fade: 1.2,
    });
  }

  boom(x, y, power = 1, col = [1, 0.55, 0.2]) {
    const { fx, sfx, phys, overlay } = this.ctx;
    const base = Math.min(window.innerWidth, window.innerHeight);
    Post.shake(0.35 * power); Post.flashScreen(0.18 * power, [1, 0.8, 0.6]);
    Post.shockwave({ x, y, speed: 1200, width: 70, strength: 22 * power, life: 0.6 });
    Post.freeze(0.04 * power); Post.bloom(1.2 * power);
    fx.glow({ x, y, s0: base * 0.05, s1: base * 0.45 * power, dur: 0.45, a: col, b: [1, 1, 0.9], intensity: 3.5 });
    fx.ring({ x, y, r0: 10, r1: base * 0.32 * power, dur: 0.5, width: 26, a: col, b: [1, 0.95, 0.8], fire: true, intensity: 1.6 });
    for (let i = 0; i < 40 * power; i++) this.spark(x, y, rand(0, TAU), rand(300, 1400) * power);
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), s = rand(40, 220);
      this.ctx.particles.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, drag: 1.8, life: rand(0.5, 1.1), c: [1, 0.5, 0.15], bright: 1.4, size: base * 0.04, size1: base * 0.11, fade: 1.3 });
    }
    phys.burst(x, y, (8 * power) | 0, 'steel', { speed: 1000 * power, size: 9, up: 300, kinds: ['steel', 'steel', 'glass'] });
    phys.blast(x, y, base * 0.4 * power, 1800 * power);
    overlay.sfxText(pick(['BOOM!', 'KRAK!', 'BLAM!']), x, y - base * 0.04, 0.9 * power, [255, 190, 90]);
    sfx.play('explode', 0.8 + power * 0.2);
  }

  // ---------- drones ----------
  target() {
    const I = this.ctx.phys.body?.info;
    const W = window.innerWidth, H = window.innerHeight;
    if (I && I.ok) return { x: I.cx, y: Math.min(I.cy, I.top + (I.cy - I.top) * 0.55) };
    return { x: W / 2, y: H * 0.55 };
  }

  spawnDrone() {
    const W = window.innerWidth, H = window.innerHeight, base = Math.min(W, H);
    const side = pick([-1, 1, 0]);
    const x = side === 0 ? rand(0.2, 0.8) * W : side < 0 ? -60 : W + 60;
    const y = side === 0 ? -60 : rand(0.1, 0.35) * H;
    this.drones.push({
      x, y, vx: 0, vy: 0, hx: rand(0.14, 0.86) * W, hy: rand(0.12, 0.42) * H, R: base * rand(0.034, 0.042),
      state: 'fly', t: 0, fire: rand(0.7, 1.2), aim: 0, ax: 0, ay: 0, rot: rand(0, TAU), vr: rand(-1, 1),
      fry: 0, crush: 0, retarget: rand(3, 5), dazed: 0, seed: Math.random() * 100,
    });
    this.ctx.sfx.play('appear');
  }

  killDrone(d, how = 'boom') {
    if (d.dead) return;
    this.kills = (this.kills || 0) + 1; this.lastKill = how;
    d.dead = true;
    if (how === 'slice') {
      const a = Math.atan2(this.sliceDy || 1, this.sliceDx || 0) + Math.PI / 2;
      for (const s of [-1, 1]) this.halves.push({ x: d.x, y: d.y, vx: d.vx * 0.3 + Math.cos(a) * s * 380, vy: d.vy * 0.3 + Math.sin(a) * s * 380 - 200, rot: d.rot, vr: s * rand(6, 12), R: d.R, side: s, cut: a, t: 0 });
      for (let i = 0; i < 30; i++) this.spark(d.x, d.y, rand(0, TAU), rand(300, 1100));
      this.ctx.sfx.play('crack');
      this.ctx.overlay.sfxText('SHNK!', d.x, d.y - d.R * 1.5, 0.7, [255, 255, 255]);
    } else {
      this.boom(d.x, d.y, how === 'crush' ? 1.1 : 0.9);
    }
  }

  updateDrones(dt, time) {
    const W = window.innerWidth, H = window.innerHeight;
    const lit = this.sab.L.on || this.sab.R.on;
    if (lit) this.training = 18;
    this.training -= dt;
    const want = this.training > 0 ? Math.min(4, 2 + ((this.deflects / 6) | 0)) : 0;
    this.spawnT -= dt;
    const alive = this.drones.filter((d) => !d.dead).length;
    if (alive < want && this.spawnT <= 0) { this.spawnDrone(); this.spawnT = rand(1.8, 3); }

    const tgt = this.target();
    for (const d of this.drones) {
      if (d.dead) continue;
      d.t += dt;
      d.rot += d.vr * dt;
      if (d.state === 'held') continue;
      if (d.state === 'thrown') {
        d.vy += 300 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt;
        const sp = Math.hypot(d.vx, d.vy);
        const wall = d.x < d.R || d.x > W - d.R || d.y < d.R || d.y > H - d.R;
        if (wall && sp > 700) { this.ctx.overlay.crack(clamp(d.x, 0, W), clamp(d.y, 0, H), 0.7); this.killDrone(d); continue; }
        if (wall) { d.x = clamp(d.x, d.R, W - d.R); d.y = clamp(d.y, d.R, H - d.R); d.vx *= -0.4; d.vy *= -0.4; }
        // smash into other drones
        for (const o of this.drones) {
          if (o === d || o.dead) continue;
          if (Math.hypot(o.x - d.x, o.y - d.y) < o.R + d.R && sp > 500) { this.killDrone(o); this.killDrone(d); break; }
        }
        d.vx *= Math.exp(-dt * 1.2); d.vy *= Math.exp(-dt * 1.2);
        if (!d.dead && sp < 260) { d.state = 'fly'; d.dazed = 1.2; }
        continue;
      }
      // hover: spring toward a station, bobbing
      d.retarget -= dt;
      if (d.retarget <= 0) { d.hx = rand(0.12, 0.88) * W; d.hy = rand(0.1, 0.42) * H; d.retarget = rand(2.5, 4.5); }
      let bx = d.hx + Math.sin(time * 1.3 + d.seed) * 30, by = d.hy + Math.sin(time * 2.1 + d.seed * 2) * 16;
      // stay just out of reach of any lit blade, and dodge the tip
      for (const sl of ['L', 'R']) {
        const B = this.sab[sl];
        if (!B.on || B.k < 0.3) continue;
        const reach = Math.min(B.len * 1.35 + d.R, Math.hypot(W, H) * 0.5), hx = bx - B.bx, hy = by - B.by, hd = Math.hypot(hx, hy) || 1;
        if (hd < reach) { bx = B.bx + (hx / hd) * reach; by = B.by + (hy / hd) * reach; }
        const q = segDist(d.x, d.y, B.bx, B.by, B.tx, B.ty);
        if (q.d < d.R * 5 && d.dazed <= 0) { const ex = d.x - q.x, ey = d.y - q.y, em = Math.hypot(ex, ey) || 1; d.vx += (ex / em) * 5200 * dt; d.vy += (ey / em) * 5200 * dt; }
      }
      bx = clamp(bx, d.R * 2, W - d.R * 2); by = clamp(by, d.R * 2, H * 0.6);
      d.vx += (bx - d.x) * 5 * dt; d.vy += (by - d.y) * 5 * dt;
      d.vx *= Math.exp(-dt * 3); d.vy *= Math.exp(-dt * 3);
      if (d.fry > 0) { d.vx += rand(-900, 900) * dt; d.vy += rand(-900, 900) * dt; }
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.dazed -= dt;
      if (d.dazed > 0 || d.fry > 0) { d.aim = 0; continue; }
      // fire cycle: glint, lock a sight line, shoot
      d.fire -= dt;
      if (d.fire < 0.6 && d.aim === 0) { d.ax = tgt.x + rand(-0.1, 0.1) * W; d.ay = tgt.y + rand(-0.08, 0.1) * H; }
      d.aim = d.fire < 0.6 ? clamp(1 - d.fire / 0.6, 0, 1) : 0;
      if (d.fire <= 0) {
        const dx = d.ax - d.x, dy = d.ay - d.y, m = Math.hypot(dx, dy) || 1;
        const sp = 950 + Math.min(500, this.deflects * 25);
        const ox = d.x + (dx / m) * d.R * 1.1, oy = d.y + (dy / m) * d.R * 1.1;
        this.bolts.push({ x: ox, y: oy, px: ox, py: oy, vx: (dx / m) * sp, vy: (dy / m) * sp, mine: false, t: 0, tx: d.ax, ty: d.ay });
        d.vx -= (dx / m) * 120; d.vy -= (dy / m) * 120;
        this.ctx.sfx.play('blaster');
        this.fired = (this.fired || 0) + 1;
        this.ctx.fx.glow({ x: ox, y: oy, s0: d.R * 0.5, s1: d.R * 2.4, dur: 0.14, a: BOLT_C, b: [1, 0.9, 0.8], intensity: 3 });
        d.fire = rand(1.3, 2.4) - Math.min(0.7, this.deflects * 0.04);
        d.aim = 0;
      }
    }
    for (let i = this.drones.length - 1; i >= 0; i--) if (this.drones[i].dead) this.drones.splice(i, 1);

    // sliced halves tumble, then pop
    for (let i = this.halves.length - 1; i >= 0; i--) {
      const h = this.halves[i];
      h.t += dt; h.vy += 1500 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt;
      if (Math.random() < 0.5) this.spark(h.x, h.y, rand(0, TAU), rand(80, 300), { life: 0.25 });
      if (h.t > 0.55 || h.y > H) { this.boom(h.x, Math.min(h.y, H - 10), 0.55); this.halves.splice(i, 1); }
    }
  }

  // ---------- bolts ----------
  updateBolts(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    const { lines, sfx, overlay } = this.ctx;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      let gone = b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80 || b.t > 4;
      // blades
      if (!gone && !b.mine) {
        for (const s of ['L', 'R']) {
          const B = this.sab[s];
          if (!B.on || B.k < 0.6) continue;
          const hit = segHit(b.px, b.py, b.x, b.y, B.bx, B.by, B.tx, B.ty)
            || (segDist(b.x, b.y, B.bx, B.by, B.tx, B.ty).d < 26 ? segDist(b.x, b.y, B.bx, B.by, B.tx, B.ty) : null)
            || segHit(b.px, b.py, b.x, b.y, B.pbx, B.pby, B.ptx, B.pty);
          if (hit) { this.deflect(b, B, hit.x, hit.y); break; }
        }
      }
      // drones get hit by returned bolts
      if (!gone && b.mine) {
        for (const d of this.drones) {
          if (d.dead) continue;
          if (segDist(d.x, d.y, b.px, b.py, b.x, b.y).d < d.R * 1.1) {
            this.killDrone(d);
            gone = true;
            if (this.deflects >= 3 && Math.random() < 0.5) overlay.sfxText(pick(['RETURNED!', 'NICE!', 'PERFECT!']), d.x, d.y - d.R * 2.2, 0.8, [255, 240, 160]);
            break;
          }
        }
      }
      // you get tagged
      if (!gone && !b.mine && segDist(b.tx, b.ty, b.px, b.py, b.x, b.y).d < 30) {
        gone = true;
        this.hits++;
        Post.flashScreen(0.22, [1, 0.15, 0.08]); Post.shake(0.22); Post.aberrate(10);
        for (let k = 0; k < 18; k++) this.spark(b.x, b.y, rand(0, TAU), rand(200, 700), { c: [1, 0.4, 0.2] });
        sfx.play('crack');
      }
      if (gone) { this.bolts.splice(i, 1); continue; }
      const m = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / m, uy = b.vy / m, L = 70;
      const col = b.mine ? this.cA : BOLT_C;
      lines.spawn(b.x - ux * L, b.y - uy * L, b.x, b.y, 12, col, 1.6, 0.03);
      lines.spawn(b.x - ux * L * 0.9, b.y - uy * L * 0.9, b.x, b.y, 4, [1, 1, 1], 2.2, 0.03);
    }
  }

  deflect(b, B, x, y) {
    const { sfx, fx, overlay } = this.ctx;
    // reflect off the blade, then most of the time steer it home at a drone
    let nx = -B.dy, ny = B.dx;
    if (nx * b.vx + ny * b.vy > 0) { nx = -nx; ny = -ny; }
    const vn = b.vx * nx + b.vy * ny;
    b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny;
    const sp = Math.hypot(b.vx, b.vy) * 1.3;
    const live = this.drones.filter((d) => !d.dead && d.state !== 'held');
    if (live.length && Math.random() < 0.72) {
      let best = null, bd = 1e9;
      for (const d of live) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } }
      const dx = best.x - x, dy = best.y - y, m = Math.hypot(dx, dy) || 1;
      b.vx = (dx / m) * sp; b.vy = (dy / m) * sp;
    } else {
      const m = Math.hypot(b.vx, b.vy) || 1; b.vx = (b.vx / m) * sp; b.vy = (b.vy / m) * sp;
    }
    b.mine = true; b.x = x; b.y = y; b.px = x; b.py = y;
    this.deflects++;
    for (let k = 0; k < 24; k++) this.spark(x, y, Math.atan2(ny, nx) + rand(-1.1, 1.1), rand(300, 1300), { c: pick([[1, 0.9, 0.6], [1, 0.5, 0.25], [1, 1, 1]]) });
    fx.glow({ x, y, s0: 20, s1: 180, dur: 0.16, a: BOLT_C, b: [1, 1, 1], intensity: 3.5 });
    Post.freeze(0.045); Post.aberrate(6); Post.shake(0.08);
    sfx.play('deflect');
    if (this.deflects === 1) { overlay.callout('反射', 'Deflect', { dur: 1.2 }); this.ctx.onMove(MOVE.deflect); }
    else if (this.deflects % 5 === 0) overlay.sfxText(`${this.deflects} DEFLECTS`, x, y - 60, 0.9, [255, 255, 255]);
    else if (Math.random() < 0.35) overlay.sfxText(pick(['TSHING!', 'PSHEW!', 'KZZT!']), x, y - 40, 0.6, [255, 230, 200]);
  }

  // ---------- the blade ----------
  updateSaber(slot, h, p, dt, time) {
    const B = this.sab[slot];
    const { lines, sfx, overlay, phys } = this.ctx;
    const gripping = this.grip && this.grip.slot === slot;
    const recentGrip = this.time - this.gripEnd[slot] < 0.8;
    const want = h.present && p === 'fist' && !gripping && !recentGrip;
    B.hold.update(!B.on && want ? 'fist' : null, dt);
    if (!B.on && B.hold.ready) {
      B.on = true; B.k = 0; B.fresh = true; B.off = 0;
      sfx.play('ignite');
      Post.bloom(0.8); Post.aberrate(4);
      this.training = 18;
      if (!this.firstSaber) { this.firstSaber = true; overlay.callout('光刃', 'Lightsaber', { dur: 1.3 }); }
      this.ctx.onMove(MOVE.saber);
    }
    if (B.on) {
      // shut off on a clearly open hand, a claw (grip), or losing the hand
      if (!h.present) B.lost += dt; else B.lost = 0;
      B.off = h.present && (p === 'open' || p === 'claw' || p === 'V' || p === 'point') ? B.off + dt : 0;
      if (B.off > 0.22 || B.lost > 0.6 || gripping) { B.on = false; sfx.play('retract'); }
    }
    B.k = damp(B.k, B.on ? 1 : 0, B.on ? 16 : 11, dt);
    if (B.k < 0.02 || !h.present) { B.fresh = true; return 0; }

    // hilt axis through the fist: pinky side to index side
    const P = h.pts, sc = h.scale;
    const c5x = (P[5].x + P[6].x) / 2, c5y = (P[5].y + P[6].y) / 2;
    const c17x = (P[17].x + P[18].x) / 2, c17y = (P[17].y + P[18].y) / 2;
    let dx = c5x - c17x, dy = c5y - c17y;
    const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    if (B.fresh) { B.dx = dx; B.dy = dy; }
    const kd = 1 - Math.exp(-dt * 30);
    B.dx += (dx - B.dx) * kd; B.dy += (dy - B.dy) * kd;
    const n = Math.hypot(B.dx, B.dy) || 1; B.dx /= n; B.dy /= n;
    const W = window.innerWidth, H = window.innerHeight;
    B.len = Math.min(sc * 5.4, Math.hypot(W, H) * 0.42) * B.k;
    const bx = c5x + B.dx * sc * 0.28, by = c5y + B.dy * sc * 0.28;
    B.px = c17x - B.dx * sc * 0.18; B.py = c17y - B.dy * sc * 0.18; // pommel
    if (B.fresh) { B.pbx = bx; B.pby = by; B.ptx = bx + B.dx * B.len; B.pty = by + B.dy * B.len; B.fresh = false; }
    else { B.pbx = B.bx; B.pby = B.by; B.ptx = B.tx; B.pty = B.ty; }
    B.sc = sc;
    B.bx = bx; B.by = by; B.tx = bx + B.dx * B.len; B.ty = by + B.dy * B.len;
    const tipV = Math.hypot(B.tx - B.ptx, B.ty - B.pty) / Math.max(dt, 1e-3);
    B.spd = damp(B.spd, tipV, 12, dt);

    const col = this.cA, fl = 1 + Math.sin(time * 60 + (slot === 'L' ? 1 : 0)) * 0.04 + rand(-0.03, 0.03);
    const w = sc * 0.17 * fl;
    // swing smear: fill the arc between last frame's blade and this one
    const sweep = Math.hypot(B.tx - B.ptx, B.ty - B.pty);
    const steps = Math.min(14, (sweep / 16) | 0);
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const ax = lerp(B.pbx, B.bx, t), ay = lerp(B.pby, B.by, t), ex = lerp(B.ptx, B.tx, t), ey = lerp(B.pty, B.ty, t);
      lines.spawn(ax, ay, ex, ey, w * 1.5, col, 0.4 * t, 0.1);
    }
    lines.spawn(bx, by, B.tx, B.ty, w * 3.6, col, 0.32, 0.034);
    lines.spawn(bx, by, B.tx, B.ty, w * 1.7, col, 1.3, 0.034);
    lines.spawn(bx, by, B.tx, B.ty, w * 0.62, [1, 1, 1], 2.1, 0.034);
    // tip flare and emitter glow
    this.ctx.particles.spawn({ x: B.tx, y: B.ty, life: 0.04, c: col, bright: 0.9, size: w * 2, size1: w * 2, fade: 1 });
    this.ctx.particles.spawn({ x: bx, y: by, life: 0.04, c: this.cB, bright: 1.1, size: w * 2.4, size1: w * 2.4, fade: 1 });

    sfx.loop('saber', 0.35 + clamp(B.spd / 3200, 0, 0.65));
    B.swingCool -= dt;
    if (B.spd > 1700 && B.swingCool <= 0) { sfx.play('swing', clamp(B.spd / 2400, 0.8, 1.5)); B.swingCool = 0.28; }

    // the blade cuts rubble
    if (B.k > 0.7) {
      let cuts = 0;
      for (const s of phys.shards) {
        if (cuts > 2 || s.cut || s.size < 7) continue;
        const q = segDist(s.x, s.y, bx, by, B.tx, B.ty);
        if (q.d < s.size * 0.8) {
          s.cut = true; s.age = Math.max(s.age, s.life + 0.95); cuts++;
          for (const sg of [-1, 1]) {
            const hs = phys.shard(s.x - B.dy * sg * s.size * 0.4, s.y + B.dx * sg * s.size * 0.4, s.vx + -B.dy * sg * 260, s.vy + B.dx * sg * 260 - 150, s.kind, s.size * 0.62, { hot: 1.6, life: s.prop ? 12 : 3 });
            hs.cut = true;
          }
          for (let k = 0; k < 10; k++) this.spark(q.x, q.y, rand(0, TAU), rand(200, 700));
          sfx.play('debris');
        }
      }
      // and drones
      for (const d of this.drones) {
        if (d.dead) continue;
        if (segDist(d.x, d.y, bx, by, B.tx, B.ty).d < d.R * 0.95) { this.sliceDx = B.dx; this.sliceDy = B.dy; this.killDrone(d, 'slice'); Post.freeze(0.05); }
      }
    }
    return 0.25 + clamp(B.spd / 4000, 0, 0.5);
  }

  // ---------- telekinesis ----------
  startGrip(slot, h) {
    const { phys, sfx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    let best = null, bd = diag * 0.45;
    for (const d of this.drones) {
      if (d.dead) continue;
      const dd = Math.hypot(d.x - h.cx, d.y - h.cy);
      if (dd < bd) { bd = dd; best = d; }
    }
    const g = { slot, drone: null, shards: [], t: 0, crush: 0, ox: 0, oy: 0 };
    if (best) {
      g.drone = best; best.state = 'held'; best.aim = 0;
      g.ox = (best.x - h.cx) * 0.55; g.oy = (best.y - h.cy) * 0.55;
    } else {
      // no drone: take everything loose within reach of the hand
      const R = Math.max(h.scale * 6, diag * 0.22);
      const list = phys.shards.filter((s) => !s.cut && Math.hypot(s.x - h.cx, s.y - h.cy) < R).slice(0, 30);
      if (!list.length) {
        const pool = phys.shards.filter((s) => !s.cut).sort((a, b) => Math.hypot(a.x - h.cx, a.y - h.cy) - Math.hypot(b.x - h.cx, b.y - h.cy));
        list.push(...pool.slice(0, 8));
      }
      if (!list.length) return null;
      g.shards = list.map((s) => ({ s, ox: (s.x - h.cx) * 0.35 + rand(-20, 20), oy: (s.y - h.cy) * 0.35 + rand(-20, 20), ph: rand(0, TAU) }));
      g.shards.forEach(({ s }) => { s.life = Math.max(s.life, s.age + 8); });
    }
    sfx.play('whoomp');
    Post.shockwave({ x: h.cx, y: h.cy, speed: 900, width: 50, strength: 14, life: 0.5 });
    if (!this.firstGrip) { this.firstGrip = true; overlay.callout('念掴', 'Force Grip', { dur: 1.2 }); }
    this.ctx.onMove(MOVE.grip);
    return g;
  }

  updateGrip(dt, hands, poses) {
    const { overlay, sfx, fx, lines } = this.ctx;
    // pick up
    for (const s of ['L', 'R']) {
      const h = hands[s];
      const other = hands[s === 'L' ? 'R' : 'L'];
      const both = poses[s] === 'claw' && poses[s === 'L' ? 'R' : 'L'] === 'claw';
      const can = !this.grip && h.present && poses[s] === 'claw' && !both && !this.sab[s].on;
      this.gripHold[s].update(can ? 'claw' : null, dt);
      if (can) overlay.chip(h.cx, h.cy + h.scale * 1.7, 'GRIP', this.gripHold[s].p);
      if (!this.grip && this.gripHold[s].ready) this.grip = this.startGrip(s, h);
      void other;
    }
    const g = this.grip;
    if (!g) return 0;
    const h = hands[g.slot], p = poses[g.slot];
    g.t += dt;
    const end = (why) => {
      this.gripEnd[g.slot] = this.time;
      if (g.drone && !g.drone.dead) { g.drone.state = why === 'throw' ? 'thrown' : 'fly'; g.drone.dazed = 1.2; }
      this.grip = null;
    };
    if (!h.present) { g.lost = (g.lost || 0) + dt; if (g.lost > 0.5) { end('drop'); return 0; } return 0.5; }
    g.lost = 0;
    const hx = h.cx, hy = h.cy;
    // pull the object toward the hand, keeping it at arm's length
    if (g.drone) {
      const d = g.drone;
      if (d.dead) { this.grip = null; return 0; }
      g.ox *= Math.exp(-dt * 0.8); g.oy *= Math.exp(-dt * 0.8);
      const tx = hx + g.ox - h.ux * h.scale * 2.2, ty = hy + g.oy + h.uy * h.scale * -2.2;
      d.vx += (tx - d.x) * 26 * dt; d.vy += (ty - d.y) * 26 * dt;
      d.vx *= Math.exp(-dt * 7); d.vy *= Math.exp(-dt * 7);
      d.x += d.vx * dt + rand(-2, 2) * (1 + g.crush * 4); d.y += d.vy * dt + rand(-2, 2) * (1 + g.crush * 4);
      d.vr += rand(-8, 8) * dt;
      if (Math.random() < 0.3 + g.crush) this.spark(d.x + rand(-d.R, d.R), d.y + rand(-d.R, d.R), rand(0, TAU), rand(80, 400), { c: [0.7, 0.85, 1] });
    } else {
      for (const it of g.shards) {
        const s = it.s;
        it.ph += dt * 3;
        const tx = hx + it.ox * (1 - g.crush * 0.8) + Math.cos(it.ph) * 10, ty = hy - h.scale * 1.5 + it.oy * (1 - g.crush * 0.8) + Math.sin(it.ph * 1.3) * 10;
        s.vx += ((tx - s.x) * 16 - s.vx * 5) * dt; s.vy += ((ty - s.y) * 16 - s.vy * 5 - this.ctx.phys.gravity * this.ctx.phys.gscale) * dt;
        s.vr += rand(-3, 3) * dt;
      }
    }
    // telekinetic ripples from the fingertips to the target
    const ox = g.drone ? g.drone.x : hx, oy = g.drone ? g.drone.y : hy - h.scale * 1.5;
    if (Math.random() < 0.35) Post.shockwave({ x: ox, y: oy, speed: 260, width: 30, strength: 7 + g.crush * 12, life: 0.4, r: 20 });
    for (const i of [8, 12, 16, 20]) {
      if (Math.random() < 0.5) continue;
      const f = h.pts[i];
      lines.spawn(f.x, f.y, lerp(f.x, ox, 0.5) + rand(-14, 14), lerp(f.y, oy, 0.5) + rand(-14, 14), 3, this.cA, 0.35, 0.05);
    }
    // crush: close the claw into a fist
    if (p === 'fist' && g.t > 0.2) {
      g.crush = Math.min(1, g.crush + dt / 0.4);
      sfx.loop('charge', 0.3 + g.crush * 0.6);
      if (g.crush >= 1) {
        sfx.play('crush');
        overlay.sfxText('CRUNCH!', ox, oy - 40, 1.1, [220, 235, 255]);
        Post.punch(0.8, ox, oy);
        if (g.drone) this.killDrone(g.drone, 'crush');
        else {
          // compress the rubble into a ball, then let it burst
          for (const it of g.shards) { const a = rand(0, TAU); it.s.vx = Math.cos(a) * rand(700, 1600); it.s.vy = Math.sin(a) * rand(700, 1600) - 300; }
          this.boom(ox, oy, 0.8, [0.6, 0.75, 1]);
        }
        if (!this.firstCrush) { this.firstCrush = true; overlay.callout('握潰', 'Crush', { dur: 1 }); }
        end('crush');
        return 1;
      }
    } else g.crush = Math.max(0, g.crush - dt * 2);
    // throw: flick the hand
    if (h.flick && g.t > 0.25) {
      const v = h.dir(), sp = Math.max(1500, Math.hypot(h.vx, h.vy) * 2.4);
      if (g.drone) { g.drone.vx = v.x * sp; g.drone.vy = v.y * sp; }
      for (const it of g.shards) { it.s.vx = v.x * sp * rand(0.7, 1.1) + rand(-150, 150); it.s.vy = v.y * sp * rand(0.7, 1.1) + rand(-150, 150); it.s.vr = rand(-20, 20); }
      sfx.play('throw');
      Post.shockwave({ x: hx, y: hy, speed: 1300, width: 60, strength: 18, life: 0.5 });
      overlay.speedLines(0.7, hx, hy);
      end('throw');
      return 0.8;
    }
    if (p === 'open' && g.t > 0.3) { g.openT = (g.openT || 0) + dt; if (g.openT > 0.2) end('drop'); } else g.openT = 0;
    return 0.5 + g.crush * 0.5;
  }

  push(slot, h, radial) {
    const { phys, sfx, fx, overlay } = this.ctx;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    const v = h.dir(), x = h.cx, y = h.cy;
    const pw = this.ctx.voice.power;
    Post.shockwave({ x, y, speed: 1700, width: 120, strength: 46 * pw, life: 0.9 });
    Post.shockwave({ x, y, speed: 1000, width: 70, strength: 24 * pw, life: 0.8 });
    Post.shake(0.4); Post.punch(-0.9, x, y); Post.aberrate(9);
    fx.ring({ x, y, r0: h.scale, r1: diag * 0.55, dur: 0.6, width: 50, a: this.cA, b: [0.9, 0.95, 1], noise: 0.25, intensity: 0.7 });
    for (let i = 0; i < 26; i++) {
      const a = radial ? rand(0, TAU) : Math.atan2(v.y, v.x) + rand(-0.6, 0.6), s = rand(500, 1400);
      this.ctx.particles.spawn({ x: x + rand(-20, 20), y: y + rand(-20, 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.4, life: rand(0.5, 0.9), c: [0.8, 0.85, 0.95], bright: 0.22, size: 40, size1: 160, fade: 1.4 });
    }
    if (radial) phys.blast(x, y, diag * 0.7, 3200 * pw);
    else phys.push(x - v.x * 100, y - v.y * 100, v.x, v.y, diag, diag * 0.35, 3600 * pw);
    for (const d of this.drones) {
      if (d.dead || d.state === 'held') continue;
      let dx = d.x - x, dy = d.y - y; const dd = Math.hypot(dx, dy) || 1; dx /= dd; dy /= dd;
      const inCone = radial || dx * v.x + dy * v.y > 0.35;
      if (!inCone || dd > diag * 0.8) continue;
      const f = 2600 * (1 - dd / (diag * 0.9)) * pw;
      d.vx = dx * f; d.vy = dy * f; d.vr = rand(-14, 14); d.state = 'thrown';
    }
    for (const b of this.bolts) {
      if (b.mine) continue;
      const dx = b.x - x, dy = b.y - y;
      if (Math.hypot(dx, dy) > diag * 0.45) continue;
      b.vx = -b.vx * 1.1; b.vy = -b.vy * 1.1; b.mine = true;
    }
    sfx.play('push');
    if (!this.firstPush) { this.firstPush = true; overlay.callout('念押', 'Force Push', { dur: 1.2 }); }
    this.ctx.onMove(MOVE.push);
  }

  updateLevitate(dt, hands, poses) {
    const { phys, sfx, overlay } = this.ctx;
    const L = hands.L, R = hands.R, lev = this.lev;
    const H = window.innerHeight, floor = H * 0.985;
    const both = L.present && R.present && poses.L === 'open' && poses.R === 'open';
    const apart = both && Math.abs(L.cx - R.cx) / ((L.scale + R.scale) / 2) > 2.4;
    const y = both ? (L.cy + R.cy) / 2 : lev.y0;
    lev.hold.update(!lev.on && apart && L.still && R.still && !this.grip ? 'lev' : null, dt);
    if (!lev.on && apart && !this.grip) overlay.chip((L.cx + R.cx) / 2, y + L.scale * 1.8, 'LEVITATE', lev.hold.p);
    if (!lev.on && lev.hold.ready) {
      lev.on = true; lev.y0 = y; lev.lift = 0; lev.off = 0;
      sfx.play('lift');
      overlay.callout('浮遊', 'Levitate', { dur: 1.2 });
      this.ctx.onMove(MOVE.lift);
    }
    lev.slam = Math.max(0, lev.slam - dt);
    phys.gscale = lev.slam > 0 ? 5 : 1;
    if (!lev.on) return 0;
    const vy = both ? (L.vy + R.vy) / 2 : 0;
    lev.vyAvg = damp(lev.vyAvg, vy, 14, dt);
    if (both) lev.lift = clamp(lev.lift + ((lev.y0 - y) / (H * 0.28) - lev.lift) * (1 - Math.exp(-dt * 6)), 0, 1);
    lev.off = both ? 0 : lev.off + dt;
    // slam: drop both hands hard after lifting
    const hs = both ? (L.scale + R.scale) / 2 : 80;
    if (both && lev.lift > 0.15 && lev.vyAvg > hs * 9) {
      lev.on = false; lev.slam = 0.6;
      for (const s of phys.shards) s.vy += 1800;
      for (const d of this.drones) if (!d.dead) { d.state = 'thrown'; d.vy = 2600; d.vx *= 0.3; }
      Post.shake(0.9); Post.punch(1.4, window.innerWidth / 2, floor); Post.freeze(0.08);
      setTimeout(() => {
        const W = window.innerWidth;
        overlay.crack(W * 0.5, floor, 1.2);
        Post.shockwave({ x: W / 2, y: floor, speed: 1600, width: 110, strength: 40, life: 0.9 });
        Post.flashScreen(0.25, this.cB);
        phys.burst(W * 0.3, floor, 10, 'rock', { speed: 900, up: 900, dir: -Math.PI / 2, cone: 1.2 });
        phys.burst(W * 0.7, floor, 10, 'rock', { speed: 900, up: 900, dir: -Math.PI / 2, cone: 1.2 });
        sfx.play('explode', 1.3);
      }, 180);
      sfx.play('slam');
      overlay.callout('叩落', 'Slam', { dur: 1 });
      overlay.sfxText('DOOM!', window.innerWidth / 2, H * 0.4, 1.6, [210, 225, 255]);
      return 1;
    }
    if (lev.off > 0.6) { lev.on = false; return 0; }
    // everything loose drifts up to a height set by your hands, bobbing
    const k = lev.lift;
    const hover = floor - k * H * 0.72;
    for (const s of phys.shards) {
      if (this.grip && this.grip.shards.some((it) => it.s === s)) continue;
      s.life = Math.max(s.life, s.age + 2);
      if (!s.lph) s.lph = rand(0, TAU);
      s.lph += dt * 1.6;
      const ty = hover + Math.sin(s.lph) * H * 0.04 - (s.size % 7) * 6 * k;
      if (k > 0.03) {
        s.vy += ((ty - s.y) * 8 - s.vy * 3.2 - phys.gravity) * dt;
        s.vx += (Math.sin(s.lph * 0.7) * 30 - s.vx * 1.5) * dt;
        s.vr *= Math.exp(-dt * 2);
      }
    }
    if (k > 0.05) {
      sfx.loop('drone', 0.25 + k * 0.5);
      Post.wantEdge(0.15 * k, this.cA);
      if (Math.random() < k * 0.6) this.ctx.particles.spawn({ x: rand(0, window.innerWidth), y: floor, vx: rand(-20, 20), vy: rand(-160, -60), drag: 0.8, life: rand(1, 2), c: [0.8, 0.8, 0.85], bright: 0.2, size: 20, size1: 60, fade: 1.3 });
    }
    return 0.4 + k * 0.5;
  }

  updateLightning(dt, hands, poses) {
    const { lines, sfx, overlay } = this.ctx;
    const L = hands.L, R = hands.R, z = this.zap;
    const both = L.present && R.present && poses.L === 'claw' && poses.R === 'claw' && !this.grip;
    z.hold.update(both ? 'zap' : null, dt);
    if (both && !z.on) overlay.chip((L.cx + R.cx) / 2, (L.cy + R.cy) / 2 + L.scale * 1.8, 'LIGHTNING', z.hold.p);
    if (z.hold.held && both) {
      if (!z.on) {
        z.on = true;
        sfx.play('thunder');
        if (!z.called) { z.called = true; overlay.callout('念雷', 'Force Lightning', { big: true, dur: 1.4 }); }
        this.ctx.onMove(MOVE.lightning);
      }
    } else z.on = false;
    z.k = damp(z.k, z.on ? 1 : 0, 10, dt);
    if (z.k < 0.05) return 0;
    this.dark = 25;
    const W = window.innerWidth, H = window.innerHeight, diag = Math.hypot(W, H);
    sfx.loop('buzz', 0.9 * z.k);
    Post.wantEdge(0.35 * z.k, [0.6, 0.55, 1]); Post.shake(dt * 0.9); Post.aberrate(4);
    const targets = this.drones.filter((d) => !d.dead);
    for (const h of [L, R]) {
      for (const i of [4, 8, 12, 16, 20]) {
        if (Math.random() < 0.35) continue;
        const f = h.pts[i];
        let tx, ty, tgt = null;
        if (targets.length && Math.random() < 0.75) {
          tgt = pick(targets); tx = tgt.x + rand(-tgt.R, tgt.R) * 0.5; ty = tgt.y + rand(-tgt.R, tgt.R) * 0.5;
        } else {
          // spray outward the way the fingers point
          const a = Math.atan2(f.y - h.cy, f.x - h.cx) + rand(-0.5, 0.5), r = diag * rand(0.25, 0.5) * z.k;
          tx = f.x + Math.cos(a) * r; ty = f.y + Math.sin(a) * r;
        }
        bolt(lines, f.x, f.y, tx, ty, { c: pick(ZAP), width: rand(2.5, 5), life: 0.07, jag: 0.28, branch: 0.6 });
        if (tgt) { tgt.fry += dt * 2.5; if (tgt.fry > 1.1) this.killDrone(tgt); }
      }
    }
    // rubble in the arcs' path jumps
    if (Math.random() < 0.3) {
      const s = pick(this.ctx.phys.shards);
      if (s) { s.vy -= rand(200, 500); s.vx += rand(-200, 200); s.hot = s.age + 0.4; }
    }
    return 0.9 * z.k;
  }

  // ---------- frame ----------
  update(dt, time, hands) {
    this.time = time;
    const L = hands.L, R = hands.R;
    const poses = { L: pose(L), R: pose(R) };
    const { overlay } = this.ctx;
    this.dark = Math.max(0, this.dark - dt);
    const lv = { L: 0.15, R: 0.15 };

    for (const s of ['L', 'R']) {
      const h = hands[s];
      lv[s] = Math.max(lv[s], this.updateSaber(s, h, poses[s], dt, time));
      if (h.present && !this.sab[s].on && poses[s] === 'fist' && this.sab[s].hold.p > 0) overlay.chip(h.cx, h.cy + h.scale * 1.7, 'HILT', this.sab[s].hold.p);
      // push: open palm shoved at the camera (radial) or swept (directional)
      this.pushCool[s] -= dt;
      if (h.present && !this.sab[s].on && !this.lev.on && (poses[s] === 'open' || h.open > 0.62) && this.pushCool[s] <= 0 && (h.thrust || h.flick) && !(this.grip && this.grip.slot === s)) {
        this.push(s, h, h.thrust);
        this.pushCool[s] = 0.7;
        lv[s] = 1;
      }
    }
    // dual blades clash
    this.clashCool -= dt;
    const A = this.sab.L, B = this.sab.R;
    if (A.on && B.on && A.k > 0.8 && B.k > 0.8 && this.clashCool <= 0) {
      const x = segHit(A.bx, A.by, A.tx, A.ty, B.bx, B.by, B.tx, B.ty);
      if (x) {
        this.clashCool = 0.25;
        for (let k = 0; k < 30; k++) this.spark(x.x, x.y, rand(0, TAU), rand(300, 1400), { c: [1, 1, 0.8] });
        this.ctx.fx.glow({ x: x.x, y: x.y, s0: 30, s1: 260, dur: 0.18, a: [1, 0.9, 0.7], b: [1, 1, 1], intensity: 4 });
        Post.freeze(0.05); Post.shake(0.15);
        this.ctx.sfx.play('clash');
      }
    }

    const g = this.updateGrip(dt, hands, poses);
    if (this.grip) lv[this.grip.slot] = Math.max(lv[this.grip.slot], g);
    const l = this.updateLevitate(dt, hands, poses);
    const z = this.updateLightning(dt, hands, poses);
    lv.L = Math.max(lv.L, l, z); lv.R = Math.max(lv.R, l, z);
    this.updateDrones(dt, time);
    this.updateBolts(dt);
    return [lv.L, lv.R];
  }

  dbg() { return { fired: this.fired || 0, kills: this.kills || 0, last: this.lastKill || '', hits: this.hits }; }

  // ---------- solid 2D: hilts, drones, halves ----------
  paint(g) {
    for (const s of ['L', 'R']) {
      const B = this.sab[s];
      if (B.k < 0.05) continue;
      this.paintHilt(g, B);
    }
    for (const d of this.drones) this.paintDrone(g, d);
    for (const h of this.halves) this.paintHalf(g, h);
    if (this.deflects > 0 && (this.sab.L.on || this.sab.R.on || this.drones.length)) {
      const W = window.innerWidth, base = Math.min(W, window.innerHeight);
      g.save();
      g.font = `700 ${base * 0.03}px "JetBrains Mono", ui-monospace, monospace`;
      g.textAlign = 'right'; g.textBaseline = 'top';
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.shadowColor = rgbToCss(this.cA, 1); g.shadowBlur = 12;
      g.fillText(`DEFLECTED ${this.deflects}`, W - base * 0.03, base * 0.12);
      g.restore();
    }
  }

  paintHilt(g, B) {
    // emitter shroud above the fist, pommel below it; the fist covers the grip
    const ang = Math.atan2(B.dy, B.dx);
    const w = B.sc * 0.26;
    g.save();
    g.translate(B.bx, B.by); g.rotate(ang);
    const gr = g.createLinearGradient(0, -w, 0, w);
    gr.addColorStop(0, '#6d747c'); gr.addColorStop(0.35, '#f2f5f7'); gr.addColorStop(0.6, '#9aa3ab'); gr.addColorStop(1, '#2d3238');
    g.fillStyle = gr;
    g.fillRect(-w * 0.6, -w * 0.62, w * 1.5, w * 1.24);
    g.fillStyle = '#1b1e22'; g.fillRect(w * 0.55, -w * 0.72, w * 0.35, w * 1.44);
    g.fillStyle = '#c9a24a'; g.fillRect(-w * 0.2, -w * 0.64, w * 0.18, w * 1.28);
    g.restore();
    g.save();
    g.translate(B.px, B.py); g.rotate(ang);
    g.fillStyle = gr;
    g.beginPath(); g.roundRect ? g.roundRect(-w * 1.1, -w * 0.55, w * 1.3, w * 1.1, w * 0.3) : g.rect(-w * 1.1, -w * 0.55, w * 1.3, w * 1.1); g.fill();
    g.fillStyle = '#23272c'; g.fillRect(-w * 0.35, -w * 0.58, w * 0.14, w * 1.16);
    g.restore();
  }

  paintDrone(g, d) {
    const R = d.R;
    const crush = this.grip && this.grip.drone === d ? this.grip.crush : 0;
    g.save();
    g.translate(d.x, d.y);
    g.rotate(d.rot);
    g.scale(1 + crush * 0.15, 1 - crush * 0.35);
    // body
    const gr = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    gr.addColorStop(0, '#f4f7fa'); gr.addColorStop(0.45, '#a3adb6'); gr.addColorStop(1, '#353c44');
    g.fillStyle = gr;
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = R * 0.5; g.shadowOffsetY = R * 0.2;
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    // equator band and panel lines
    g.fillStyle = '#2a2f36'; g.fillRect(-R, -R * 0.12, R * 2, R * 0.24);
    g.strokeStyle = 'rgba(20,24,28,0.7)'; g.lineWidth = Math.max(1, R * 0.05);
    g.beginPath(); g.arc(0, 0, R * 0.62, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.62, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    // emitter ports on the band
    for (let i = -1; i <= 1; i++) { g.fillStyle = '#111'; g.beginPath(); g.arc(i * R * 0.55, 0, R * 0.08, 0, TAU); g.fill(); }
    // fins
    g.fillStyle = '#4b535c';
    g.fillRect(-R * 1.25, -R * 0.06, R * 0.3, R * 0.12); g.fillRect(R * 0.95, -R * 0.06, R * 0.3, R * 0.12);
    // dents while crushed
    if (crush > 0.2) {
      g.strokeStyle = 'rgba(10,10,10,0.6)'; g.lineWidth = R * 0.06;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(rand(-R, R) * 0.6, rand(-R, R) * 0.6); g.lineTo(rand(-R, R) * 0.6, rand(-R, R) * 0.6); g.stroke(); }
    }
    g.restore();
    // eye: points at its aim, glows as it locks on
    const ex = d.ax - d.x, ey = d.ay - d.y, em = Math.hypot(ex, ey) || 1;
    const lx = d.x + (d.aim > 0 ? (ex / em) * R * 0.45 : 0), ly = d.y + (d.aim > 0 ? (ey / em) * R * 0.45 : R * 0.2);
    const on = d.fry > 0 ? 0.3 + Math.random() * 0.7 : 0.45 + d.aim * 0.55;
    g.save();
    g.fillStyle = `rgba(255,${60 + (1 - on) * 80 | 0},40,${0.9})`;
    g.shadowColor = '#ff2a10'; g.shadowBlur = R * (0.4 + on * 1.2);
    g.beginPath(); g.arc(lx, ly, R * (0.16 + on * 0.06), 0, TAU); g.fill();
    g.restore();
    // laser sight while locking on
    if (d.aim > 0.05 && d.state === 'fly') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,40,20,${0.15 + d.aim * 0.5})`;
      g.lineWidth = 1 + d.aim * 1.5;
      g.setLineDash([10, 8]);
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(d.ax, d.ay); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(d.ax, d.ay, 8 + (1 - d.aim) * 26, 0, TAU); g.stroke();
      g.restore();
    }
  }

  paintHalf(g, h) {
    g.save();
    g.translate(h.x, h.y); g.rotate(h.rot);
    const R = h.R;
    const gr = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
    gr.addColorStop(0, '#e8edf1'); gr.addColorStop(1, '#3a4148');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R, h.side > 0 ? 0 : Math.PI, h.side > 0 ? Math.PI : TAU); g.closePath(); g.fill();
    // molten cut edge
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(255,${150 + Math.random() * 80 | 0},60,${0.9 - h.t})`;
    g.lineWidth = R * 0.14;
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.stroke();
    g.restore();
  }
}
