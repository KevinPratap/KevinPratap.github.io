import * as THREE from 'three';
import { QUAD_VERT, QUAD_FRAG, STRIP_VERT, TRAIL_FRAG, BONES_FRAG } from './shaders.js';
import { additive } from './particles.js';
import { easeOutBack, easeOutCubic, TAU } from '../util.js';

const PLANE = new THREE.PlaneGeometry(1, 1);
const v3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);

// A camera-facing quad running one of the FX fragment shaders.
export class FXQuad {
  constructor(scene, type, o = {}) {
    this.scene = scene;
    this.u = {
      uTime: { value: 0 },
      uIntensity: { value: o.intensity ?? 1 },
      uSeed: { value: Math.random() * 50 },
      uColorA: { value: v3(o.a || [1, 1, 1]) },
      uColorB: { value: v3(o.b || [1, 1, 1]) },
      uParam: { value: new THREE.Vector4(...(o.param || [0, 0, 0, 0])) },
      uTex: { value: o.tex || null },
    };
    this.mat = additive({ uniforms: this.u, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG[type] });
    this.mesh = new THREE.Mesh(PLANE, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.order || 0;
    scene.add(this.mesh);
  }
  set(x, y, w, h = w, rot = 0) {
    this.mesh.position.set(x, y, 0);
    this.mesh.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), 1);
    this.mesh.rotation.z = rot;
    return this;
  }
  get intensity() { return this.u.uIntensity.value; }
  set intensity(v) { this.u.uIntensity.value = v; this.mesh.visible = v > 0.002; }
  param(x, y, z, w) { this.u.uParam.value.set(x, y, z, w); return this; }
  tick(time) { this.u.uTime.value = time; }
  dispose() { this.scene.remove(this.mesh); this.mat.dispose(); }
}

// Short-lived effects that animate themselves and clean up.
export class FXList {
  constructor(scene) { this.scene = scene; this.items = []; }
  add(item) { this.items.push(item); return item; }
  update(dt, time) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.update(dt, time)) { it.dispose(); this.items.splice(i, 1); }
    }
  }
  clear() { this.items.forEach((it) => it.dispose()); this.items.length = 0; }

  // Expanding glow ring. Radii in px.
  ring({ x, y, r0 = 10, r1 = 300, dur = 0.5, width = 18, a = [1, 1, 1], b = [1, 1, 1], fire = false, noise = 0.08, intensity = 1.6 }) {
    const q = new FXQuad(this.scene, 'ring', { a, b });
    let t = 0;
    return this.add({
      update: (dt, time) => {
        t += dt;
        const k = Math.min(1, t / dur);
        const R = r0 + (r1 - r0) * easeOutCubic(k);
        const S = R / 0.4 + width * 4;
        q.set(x, y, S);
        q.param(R / (S / 2), (width * (1 - k * 0.6)) / (S / 2), noise, fire ? 1 : 0);
        q.intensity = intensity * (1 - k) * (1 - k);
        q.tick(time);
        return t < dur;
      },
      dispose: () => q.dispose(),
    });
  }

  // Radial flash bloom.
  glow({ x, y, s0 = 40, s1 = 400, dur = 0.35, a = [1, 0.6, 0.2], b = [1, 1, 1], intensity = 2.5, sharp = 5 }) {
    const q = new FXQuad(this.scene, 'glow', { a, b, param: [sharp, 0, 0, 0] });
    let t = 0;
    return this.add({
      update: (dt, time) => {
        t += dt;
        const k = Math.min(1, t / dur);
        q.set(x, y, s0 + (s1 - s0) * easeOutCubic(k));
        q.intensity = intensity * Math.pow(1 - k, 1.6);
        q.tick(time);
        return t < dur;
      },
      dispose: () => q.dispose(),
    });
  }
}

// ---------- Magic circles ----------

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigilCanvas(draw) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g, S * 0.46);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const circle = (g, r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };

function glyph(g, rnd, h) {
  const n = 2 + ((rnd() * 3) | 0);
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const kind = rnd();
    const x0 = (rnd() * 2 - 1) * h, y0 = (rnd() * 2 - 1) * h;
    if (kind < 0.55) {
      g.moveTo(x0, y0);
      g.lineTo((rnd() * 2 - 1) * h, (rnd() * 2 - 1) * h);
    } else if (kind < 0.85) {
      const r = h * (0.3 + rnd() * 0.6);
      const a0 = rnd() * TAU;
      g.moveTo(x0 + Math.cos(a0) * r, y0 + Math.sin(a0) * r);
      g.arc(x0, y0, r, a0, a0 + Math.PI * (0.5 + rnd()));
    } else {
      g.moveTo(x0 + h * 0.18, y0);
      g.arc(x0, y0, h * 0.18, 0, TAU);
    }
  }
  g.stroke();
}

export function makeSigilTextures(style, seed = 7) {
  const rnd = mulberry32(seed);
  const outer = sigilCanvas((g, R) => {
    circle(g, R, 5);
    circle(g, R * 0.93, 2);
    circle(g, R * 0.74, 2.5);
    g.lineWidth = 2;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU;
      const l = i % 5 === 0 ? 0.055 : 0.028;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.935, Math.sin(a) * R * 0.935);
      g.lineTo(Math.cos(a) * R * (0.935 - l), Math.sin(a) * R * (0.935 - l));
      g.stroke();
    }
    g.lineWidth = 2.6;
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      g.save();
      g.rotate(a);
      g.translate(0, -R * 0.825);
      glyph(g, rnd, R * 0.05);
      g.restore();
    }
  });

  const inner = sigilCanvas((g, R) => {
    circle(g, R * 0.64, 3);
    if (style === 'ember') {
      g.lineWidth = 3;
      for (let t = 0; t < 2; t++) {
        g.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = (i / 3) * TAU + t * Math.PI - Math.PI / 2;
          const x = Math.cos(a) * R * 0.62, y = Math.sin(a) * R * 0.62;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      circle(g, R * 0.31, 2.5);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        g.save();
        g.rotate(a);
        g.beginPath();
        g.moveTo(-R * 0.045, -R * 0.31);
        g.quadraticCurveTo(R * 0.03, -R * 0.4, 0, -R * 0.47);
        g.quadraticCurveTo(R * 0.01, -R * 0.38, R * 0.045, -R * 0.31);
        g.fill();
        g.restore();
      }
      circle(g, R * 0.12, 3);
    } else {
      g.lineWidth = 1.8;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
        g.lineTo(Math.cos(a + Math.PI * 0.75) * R * 0.62, Math.sin(a + Math.PI * 0.75) * R * 0.62);
        g.stroke();
      }
      circle(g, R * 0.46, 2);
      circle(g, R * 0.3, 2);
      [[0.46, 0.4, 0.05], [0.46, 2.6, 0.035], [0.3, 1.3, 0.04], [0.3, 4.2, 0.03]].forEach(([r, a, s]) => {
        g.beginPath();
        g.arc(Math.cos(a) * R * r, Math.sin(a) * R * r, R * s, 0, TAU);
        g.fill();
      });
      g.beginPath();
      g.arc(0, 0, R * 0.14, 0, TAU);
      g.arc(R * 0.06, -R * 0.02, R * 0.12, 0, TAU, true);
      g.fill('evenodd');
    }
  });
  return { outer, inner };
}

// Two counter-rotating layers with a charge arc and a spring-in animation.
export class Sigil {
  constructor(scene, tex, a, b) {
    this.outer = new FXQuad(scene, 'sigil', { tex: tex.outer, a, b, param: [0, 0.975, 0.022, 0] });
    this.inner = new FXQuad(scene, 'sigil', { tex: tex.inner, a, b, param: [0, 0, 0.01, 0] });
    this.level = 0; this.target = 0; this.rot = 0; this.charge = 0;
    this.outer.intensity = 0; this.inner.intensity = 0;
  }
  update(dt, time, x, y, size, spin = 1) {
    const rising = this.target > this.level;
    this.level += (this.target - this.level) * (1 - Math.exp(-dt * (rising ? 6 : 9)));
    if (Math.abs(this.target - this.level) < 0.002) this.level = this.target;
    const L = this.level;
    const scale = rising ? easeOutBack(Math.min(1, L)) : 1 + (1 - L) * 0.35;
    this.rot += dt * spin;
    this.outer.set(x, y, size * scale, size * scale, this.rot);
    this.inner.set(x, y, size * scale, size * scale, -this.rot * 1.6);
    this.outer.param(this.charge, 0.975, 0.022, 0);
    this.outer.intensity = L * 1.1;
    this.inner.intensity = L * 0.95;
    this.outer.tick(time);
    this.inner.tick(time);
  }
  dispose() { this.outer.dispose(); this.inner.dispose(); }
}

// ---------- Ribbon trail ----------

export class Trail {
  constructor(scene, { max = 36, width = 26, life = 0.28, fire = true, a = [1, 1, 1], b = [1, 1, 1] } = {}) {
    this.scene = scene; this.max = max; this.width = width; this.life = life;
    this.pos = new Float32Array(max * 2 * 3);
    this.uv = new Float32Array(max * 2 * 2);
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3));
    this.geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(max * 2), 1));
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.u = {
      uTime: { value: 0 }, uIntensity: { value: 1 }, uSeed: { value: Math.random() * 40 },
      uFire: { value: fire ? 1 : 0 }, uColorA: { value: v3(a) }, uColorB: { value: v3(b) },
    };
    this.mat = additive({ uniforms: this.u, vertexShader: STRIP_VERT, fragmentShader: TRAIL_FRAG });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.pts = [];
  }
  push(x, y, time) {
    const h = this.pts[0];
    if (h && Math.hypot(h.x - x, h.y - y) < 3) { h.t = time; return; }
    this.pts.unshift({ x, y, t: time });
    if (this.pts.length > this.max) this.pts.pop();
  }
  set intensity(v) { this.u.uIntensity.value = v; }
  update(time) {
    this.u.uTime.value = time;
    while (this.pts.length && time - this.pts[this.pts.length - 1].t > this.life) this.pts.pop();
    const n = this.pts.length;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.max(0, i - 1)], r = this.pts[Math.min(n - 1, i + 1)];
      let dx = q.x - r.x, dy = q.y - r.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const along = i / (n - 1);
      const w = this.width * Math.pow(1 - along, 0.7) * 0.5 + 1;
      const j = i * 6;
      this.pos[j] = p.x - dy * w; this.pos[j + 1] = p.y + dx * w; this.pos[j + 2] = 0;
      this.pos[j + 3] = p.x + dy * w; this.pos[j + 4] = p.y - dx * w; this.pos[j + 5] = 0;
      const k = i * 4;
      this.uv[k] = along; this.uv[k + 1] = 0; this.uv[k + 2] = along; this.uv[k + 3] = 1;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aUv.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

// ---------- Glowing hand skeleton ----------

export class EnergyHands {
  constructor(scene, bones) {
    this.bones = bones;
    const quadsPerHand = bones.length + 21;
    const quads = quadsPerHand * 2;
    this.qph = quadsPerHand;
    this.pos = new Float32Array(quads * 4 * 3);
    const uv = new Float32Array(quads * 4 * 2);
    const kind = new Float32Array(quads * 4);
    const col = new Float32Array(quads * 4 * 3);
    const idx = [];
    for (let q = 0; q < quads; q++) {
      const hand = q >= quadsPerHand ? 1 : 0;
      const isJoint = (q % quadsPerHand) >= bones.length ? 1 : 0;
      uv.set([0, 0, 0, 1, 1, 0, 1, 1], q * 8);
      for (let v = 0; v < 4; v++) { kind[q * 4 + v] = isJoint; col[(q * 4 + v) * 3] = hand; }
      const b = q * 4;
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.u = {
      uTime: { value: 0 }, uLevel: { value: new THREE.Vector2(0, 0) },
      uColorA: { value: v3([1, 1, 1]) }, uColorB: { value: v3([1, 1, 1]) },
    };
    this.mat = additive({ uniforms: this.u, vertexShader: STRIP_VERT, fragmentShader: BONES_FRAG });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  setColors(a, b) { this.u.uColorA.value.set(...a); this.u.uColorB.value.set(...b); }
  update(hands, levels, time) {
    this.u.uTime.value = time;
    this.u.uLevel.value.set(levels[0], levels[1]);
    const P = this.pos;
    hands.forEach((h, hi) => {
      let base = hi * this.qph * 12;
      if (!h.present) { P.fill(0, base, base + this.qph * 12); return; }
      const w = h.scale * 0.1;
      for (const [a, b] of this.bones) {
        const pa = h.pts[a], pb = h.pts[b];
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * w * 0.5, ny = (dx / len) * w * 0.5;
        P[base] = pa.x + nx; P[base + 1] = pa.y + ny; P[base + 2] = 0;
        P[base + 3] = pa.x - nx; P[base + 4] = pa.y - ny; P[base + 5] = 0;
        P[base + 6] = pb.x + nx; P[base + 7] = pb.y + ny; P[base + 8] = 0;
        P[base + 9] = pb.x - nx; P[base + 10] = pb.y - ny; P[base + 11] = 0;
        base += 12;
      }
      for (let i = 0; i < 21; i++) {
        const p = h.pts[i];
        const s = h.scale * (i % 4 === 0 && i ? 0.26 : 0.17) * 0.5;
        P[base] = p.x - s; P[base + 1] = p.y - s; P[base + 2] = 0;
        P[base + 3] = p.x - s; P[base + 4] = p.y + s; P[base + 5] = 0;
        P[base + 6] = p.x + s; P[base + 7] = p.y - s; P[base + 8] = 0;
        P[base + 9] = p.x + s; P[base + 10] = p.y + s; P[base + 11] = 0;
        base += 12;
      }
    });
    this.geo.attributes.position.needsUpdate = true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
