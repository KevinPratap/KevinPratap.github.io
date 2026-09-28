import * as THREE from 'three';
import { POINTS_VERT, POINTS_FRAG, STRIP_VERT, STREAK_FRAG } from './shaders.js';

export function additive(opts) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    ...opts,
  });
}

function dyn(arr, size) {
  const a = new THREE.BufferAttribute(arr, size);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

// Shared motion step. Screen space: +y is down, so positive grav falls.
function step(p, dt) {
  if (p.fn) p.fn(p, dt);
  p.vy += p.grav * dt;
  if (p.drag) {
    const k = Math.exp(-p.drag * dt);
    p.vx *= k;
    p.vy *= k;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
}

function fill(p, o) {
  p.x = o.x; p.y = o.y;
  p.vx = o.vx || 0; p.vy = o.vy || 0;
  p.grav = o.grav || 0; p.drag = o.drag || 0;
  p.life = p.maxLife = o.life || 1;
  const c = o.c || [1, 1, 1];
  const b = o.bright ?? 1;
  p.r = c[0] * b; p.g = c[1] * b; p.b = c[2] * b;
  p.fade = o.fade ?? 1;
  p.flicker = o.flicker || 0;
  p.fn = o.fn || null;
  p.tag = o.tag || null;
  return p;
}

// Soft glowing dots.
export class Particles {
  constructor(scene, max, pr) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('aColor', dyn(this.col, 3));
    this.geo.setAttribute('aSize', dyn(this.size, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = additive({ uniforms: { uPR: { value: pr } }, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG });
    this.obj = new THREE.Points(this.geo, this.mat);
    this.obj.frustumCulled = false;
    scene.add(this.obj);
    this.list = [];
    this.free = [];
  }

  setPR(pr) { this.mat.uniforms.uPR.value = pr; }

  spawn(o) {
    if (this.list.length >= this.max) {
      const idx = this.list.findIndex((q) => q.tag !== 'keep');
      if (idx < 0) return null;
      this.free.push(this.list.splice(idx, 1)[0]);
    }
    const p = fill(this.free.pop() || {}, o);
    p.size0 = o.size || 8;
    p.size1 = o.size1 ?? p.size0;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      step(p, dt);
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        this.free.push(p);
      }
    }
    const n = L.length;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      const t = Math.max(0, p.life / p.maxLife);
      let f = Math.pow(t, p.fade);
      if (p.flicker) f *= 1 - p.flicker * Math.random();
      const j = i * 3;
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = 0;
      this.col[j] = p.r * f; this.col[j + 1] = p.g * f; this.col[j + 2] = p.b * f;
      this.size[i] = p.size1 + (p.size0 - p.size1) * t;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  clear() {
    while (this.list.length) this.free.push(this.list.pop());
  }
}

// Velocity-stretched spark streaks (motion-blurred lines).
export class Streaks {
  constructor(scene, max) {
    this.max = max;
    const v = max * 4;
    this.pos = new Float32Array(v * 3);
    this.col = new Float32Array(v * 3);
    const uv = new Float32Array(v * 2);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      uv.set([1, 0, 1, 1, 0, 0, 0, 1], i * 8);
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('aColor', dyn(this.col, 3));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(v), 1));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = additive({ vertexShader: STRIP_VERT, fragmentShader: STREAK_FRAG });
    this.obj = new THREE.Mesh(this.geo, this.mat);
    this.obj.frustumCulled = false;
    scene.add(this.obj);
    this.list = [];
    this.free = [];
  }

  spawn(o) {
    if (this.list.length >= this.max) this.free.push(this.list.shift());
    const p = fill(this.free.pop() || {}, o);
    p.width = o.width || 2.5;
    p.stretch = o.stretch ?? 0.035;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      step(p, dt);
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        this.free.push(p);
      }
    }
    const n = L.length;
    const P = this.pos, C = this.col;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      let dx = p.vx * p.stretch, dy = p.vy * p.stretch;
      let len = Math.hypot(dx, dy);
      if (len < p.width) {
        const s = len > 0.001 ? p.width / len : 0;
        dx = len > 0.001 ? dx * s : p.width; dy = len > 0.001 ? dy * s : 0;
        len = p.width;
      }
      const nx = (-dy / len) * p.width * 0.5, ny = (dx / len) * p.width * 0.5;
      const hx = p.x, hy = p.y, tx = p.x - dx, ty = p.y - dy;
      const j = i * 12;
      P[j] = hx + nx; P[j + 1] = hy + ny; P[j + 2] = 0;
      P[j + 3] = hx - nx; P[j + 4] = hy - ny; P[j + 5] = 0;
      P[j + 6] = tx + nx; P[j + 7] = ty + ny; P[j + 8] = 0;
      P[j + 9] = tx - nx; P[j + 10] = ty - ny; P[j + 11] = 0;
      const t = Math.max(0, p.life / p.maxLife);
      let f = Math.pow(t, p.fade);
      if (p.flicker) f *= 1 - p.flicker * Math.random();
      const r = p.r * f, g = p.g * f, b = p.b * f;
      for (let k = 0; k < 4; k++) { C[j + k * 3] = r; C[j + k * 3 + 1] = g; C[j + k * 3 + 2] = b; }
    }
    this.geo.setDrawRange(0, n * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }

  clear() {
    while (this.list.length) this.free.push(this.list.pop());
  }
}
