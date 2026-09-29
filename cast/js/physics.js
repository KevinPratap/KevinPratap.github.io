// A small 2D physics world that lives on top of the camera image.
//
//  - Shards: wood splinters, rock, metal plates. They fall, spin, bounce off
//    the floor and walls, and bounce off YOUR silhouette (read from the body
//    segmentation mask), so debris really lands on your shoulders.
//  - Orbiters: points of matter that fall around gravity wells with real
//    inverse-square pull, spiral in, and get swallowed at the event horizon.
//  - Wind: your moving hands push shards (and the overlay's smoke).
//  - Blasts: an explosion shoves everything nearby, not just spawns more.
import { rand, pick, TAU, clamp } from './util.js';

const KINDS = {
  wood: { fill: ['#b07a3f', '#7a4b22'], edge: '#e2b878', dark: '#3a230f', rest: 0.32, mass: 1.0 },
  rock: { fill: ['#9aa0a6', '#555b61'], edge: '#d5d9dc', dark: '#22262a', rest: 0.28, mass: 1.6 },
  steel: { fill: ['#e6edf1', '#7d8b94'], edge: '#ffffff', dark: '#2a3238', rest: 0.42, mass: 1.2 },
  gold: { fill: ['#ffd76a', '#b8801d'], edge: '#fff3c4', dark: '#4a3008', rest: 0.42, mass: 1.2 },
  red: { fill: ['#e8474f', '#9c1820'], edge: '#ffb3b6', dark: '#3d0508', rest: 0.4, mass: 1.2 },
  glass: { fill: ['#dff6ff', '#8ec9e8'], edge: '#ffffff', dark: '#1d4258', rest: 0.3, mass: 0.7 },
};

export class Physics {
  constructor(overlay, body) {
    this.ov = overlay;
    this.body = body;
    this.shards = [];
    this.orbs = [];
    this.wells = [];
    this.gravity = 1900;
    this.max = 220;
    this.maxOrbs = 520;
  }

  clear() {
    this.shards.length = 0;
    this.orbs.length = 0;
    this.wells.length = 0;
  }

  // ---------- spawning ----------
  shard(x, y, vx, vy, kind = 'wood', size = 14, o = {}) {
    if (this.shards.length >= this.max) this.shards.shift();
    // a jagged polygon: 4-6 vertices, stretched so splinters are long
    const n = 4 + ((Math.random() * 3) | 0);
    const stretch = o.stretch ?? rand(1, 2.4);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3);
      const r = size * rand(0.55, 1.05);
      pts.push([Math.cos(a) * r * stretch, Math.sin(a) * r]);
    }
    const s = {
      x, y, vx, vy, rot: rand(0, TAU), vr: rand(-14, 14), pts, kind, size,
      age: 0, life: o.life ?? rand(3.2, 5), bounces: 0, hot: o.hot ?? 0, glow: o.glow || null,
    };
    this.shards.push(s);
    return s;
  }

  // Debris flying out from a point. `dir` biases the spray (radians); `cone`
  // is how wide it fans (TAU = all around).
  burst(x, y, n, kind, o = {}) {
    const sp = o.speed ?? 900, dir = o.dir ?? -Math.PI / 2, cone = o.cone ?? TAU;
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-cone / 2, cone / 2);
      const s = sp * rand(0.25, 1);
      this.shard(x + rand(-6, 6), y + rand(-6, 6), Math.cos(a) * s, Math.sin(a) * s - (o.up ?? 250) * Math.random(),
        o.kinds ? pick(o.kinds) : kind, (o.size ?? 13) * rand(0.6, 1.3), o);
    }
  }

  // Shove everything within `r` away from a point (an explosion).
  blast(x, y, r, power) {
    for (const s of this.shards) {
      const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
      if (d > r) continue;
      const f = (1 - d / r) ** 2 * power / (KINDS[s.kind].mass * (0.6 + s.size / 24));
      const m = d || 1;
      s.vx += (dx / m) * f; s.vy += (dy / m) * f - f * 0.25;
      s.vr += rand(-10, 10);
    }
  }

  // A stream of force along a ray (a beam or a repulsor blast).
  push(x, y, dx, dy, len, width, power) {
    for (const s of this.shards) {
      const rx = s.x - x, ry = s.y - y, along = rx * dx + ry * dy;
      if (along < 0 || along > len) continue;
      const perp = Math.abs(rx * -dy + ry * dx);
      if (perp > width) continue;
      const f = (1 - perp / width) * power / KINDS[s.kind].mass;
      s.vx += dx * f; s.vy += dy * f - f * 0.15;
      s.vr += rand(-8, 8);
    }
  }

  // Gravity well. Anything orbiting or falling near it feels GM / r^2.
  well(x, y, GM, rs) {
    const w = { x, y, GM, rs, on: true, eaten: 0 };
    this.wells.push(w);
    return w;
  }

  dropWell(w) {
    const i = this.wells.indexOf(w);
    if (i >= 0) this.wells.splice(i, 1);
  }

  orbiter(x, y, vx, vy, o = {}) {
    if (this.orbs.length >= this.maxOrbs) this.orbs.shift();
    const p = { x, y, vx, vy, age: 0, life: o.life ?? 9, hue: o.hue ?? Math.random(), tr: [], size: o.size ?? rand(1.2, 2.6) };
    this.orbs.push(p);
    return p;
  }

  // ---------- simulation ----------
  step(dt) {
    if (dt <= 0) return;
    const W = window.innerWidth, H = window.innerHeight, floor = H * 0.985;
    const wind = this.ov.wind || [];
    const body = this.body && this.body.ready ? this.body : null;
    const sub = dt > 1 / 45 ? 2 : 1, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      for (let i = this.shards.length - 1; i >= 0; i--) {
        const s = this.shards[i];
        const K = KINDS[s.kind];
        s.age += h;
        s.vy += this.gravity * h * (this.wells.length ? 0.22 : 1);
        for (const w of wells(this)) this.pull(s, w, h, 1);
        for (const w of wind) {
          const dx = s.x - w.x, dy = s.y - w.y, d = Math.hypot(dx, dy);
          if (d < w.r) {
            const f = (1 - d / w.r) * h * 5.5 / K.mass;
            s.vx += w.vx * f; s.vy += w.vy * f;
          }
        }
        const drag = Math.exp(-h * 0.25);
        s.vx *= drag; s.vy *= drag;
        s.x += s.vx * h; s.y += s.vy * h;
        s.rot += s.vr * h;
        // floor and walls
        if (s.y > floor) {
          s.y = floor;
          if (s.vy > 0) { s.vy *= -K.rest; s.vx *= 0.72; s.vr *= 0.6; s.bounces++; }
          if (Math.abs(s.vy) < 60) { s.vy = 0; s.vr *= 0.8; }
        }
        if (s.x < 6) { s.x = 6; s.vx *= -K.rest; }
        if (s.x > W - 6) { s.x = W - 6; s.vx *= -K.rest; }
        // your silhouette is solid
        if (body && s.y < H) this.collideBody(body, s, K);
        if (s.age > s.life + 1) this.shards.splice(i, 1);
      }
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const p = this.orbs[i];
      p.age += dt;
      let eaten = null;
      for (const w of this.wells) {
        if (!w.on) continue;
        const dx = w.x - p.x, dy = w.y - p.y, d2 = dx * dx + dy * dy + 900;
        const d = Math.sqrt(d2), a = w.GM / d2;
        p.vx += (dx / d) * a * dt; p.vy += (dy / d) * a * dt;
        // frame dragging: a little spin so infall becomes a spiral
        p.vx += (-dy / d) * a * 0.22 * dt; p.vy += (dx / d) * a * 0.22 * dt;
        if (d < w.rs) eaten = w;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.tr.push(p.x, p.y);
      if (p.tr.length > 14) p.tr.splice(0, 2);
      if (eaten) { eaten.eaten++; if (this.onEat) this.onEat(p, eaten); this.orbs.splice(i, 1); continue; }
      if (p.age > p.life || p.x < -200 || p.x > W + 200 || p.y < -200 || p.y > H + 200) this.orbs.splice(i, 1);
    }
  }

  pull(s, w, h, k) {
    if (!w.on) return;
    const dx = w.x - s.x, dy = w.y - s.y, d2 = dx * dx + dy * dy + 900, d = Math.sqrt(d2);
    const a = (w.GM / d2) * 3.2 * k;
    s.vx += (dx / d) * a * h; s.vy += (dy / d) * a * h;
    if (d < w.rs) s.age = 999;
  }

  collideBody(body, s, K) {
    const m = body.sample(s.x, s.y);
    if (m < 0.55) return;
    // push out along the mask gradient until free
    const e = 10;
    const gx = body.sample(s.x + e, s.y) - body.sample(s.x - e, s.y);
    const gy = body.sample(s.x, s.y + e) - body.sample(s.x, s.y - e);
    let nx = -gx, ny = -gy;
    let nl = Math.hypot(nx, ny);
    if (nl < 0.02) { nx = 0; ny = -1; nl = 1; }
    nx /= nl; ny /= nl;
    // resting on top of a shoulder: nudge up, else out sideways
    for (let it = 0; it < 6 && body.sample(s.x, s.y) > 0.55; it++) { s.x += nx * 5; s.y += ny * 5; }
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) {
      s.vx -= (1 + K.rest) * vn * nx;
      s.vy -= (1 + K.rest) * vn * ny;
      s.vx *= 0.9; s.vr += rand(-6, 6) + nx * 4;
      s.bounces++;
    }
  }

  // ---------- drawing ----------
  draw(g) {
    for (const s of this.shards) {
      const K = KINDS[s.kind];
      const a = s.age > s.life ? Math.max(0, 1 - (s.age - s.life)) : 1;
      g.save();
      g.globalAlpha = a;
      g.translate(s.x, s.y);
      g.rotate(s.rot);
      const gr = g.createLinearGradient(-s.size, -s.size, s.size, s.size);
      gr.addColorStop(0, K.fill[0]); gr.addColorStop(1, K.fill[1]);
      g.fillStyle = gr;
      g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
      g.beginPath();
      s.pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.fill();
      g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.lineWidth = 1.4; g.strokeStyle = K.edge; g.stroke();
      if (s.kind === 'wood') {
        g.strokeStyle = K.dark; g.lineWidth = 1;
        g.beginPath(); g.moveTo(-s.size, -s.size * 0.2); g.lineTo(s.size * 1.2, s.size * 0.1); g.stroke();
      }
      if (s.hot > 0 && s.age < s.hot) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,${140 + (s.age / s.hot) * 60 | 0},40,${0.75 * (1 - s.age / s.hot)})`;
        g.fill();
      }
      g.restore();
    }
    if (this.orbs.length) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const p of this.orbs) {
        const sp = Math.hypot(p.vx, p.vy);
        // cold blue far away, white-hot then magenta as it plunges in
        let best = 1e9;
        for (const w of this.wells) best = Math.min(best, Math.hypot(p.x - w.x, p.y - w.y));
        const heat = clamp(1 - best / 420, 0, 1);
        const r = 90 + 165 * heat, gg = 130 + 90 * (1 - Math.abs(heat - 0.55) * 1.4), b = 255 - 60 * heat;
        const a = clamp(p.age * 4, 0, 1) * clamp((p.life - p.age) * 2, 0, 1);
        g.strokeStyle = `rgba(${r | 0},${gg | 0},${b | 0},${0.85 * a})`;
        g.lineWidth = p.size * (0.8 + heat * 1.4);
        const t = p.tr;
        if (t.length >= 4) {
          g.beginPath(); g.moveTo(t[0], t[1]);
          for (let i = 2; i < t.length; i += 2) g.lineTo(t[i], t[i + 1]);
          g.stroke();
        } else {
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); g.stroke();
        }
        void sp;
      }
      g.restore();
    }
  }
}

function wells(P) { return P.wells; }
