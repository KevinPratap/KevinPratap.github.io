import { CONFIG } from './config.js';
import { clamp } from './util.js';

const TASKS_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
export const FINGERTIPS = [4, 8, 12, 16, 20];
const TIPS = [8, 12, 16, 20];
const MCPS = [5, 9, 13, 17];

// Maps camera-space landmarks to CSS pixels on screen (top-left origin),
// matching an object-fit: cover, selfie-mirrored video.
export const Projector = {
  vw: 1280, vh: 720, cw: 1, ch: 1, s: 1, ox: 0, oy: 0,
  setVideo(vw, vh) { this.vw = vw || 1280; this.vh = vh || 720; this.resize(); },
  resize() {
    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    this.s = Math.max(this.cw / this.vw, this.ch / this.vh);
    this.ox = (this.cw - this.vw * this.s) / 2;
    this.oy = (this.ch - this.vh * this.s) / 2;
  },
  toScreen(nx, ny, out) {
    out.x = (1 - nx) * this.vw * this.s + this.ox;
    out.y = ny * this.vh * this.s + this.oy;
    return out;
  },
};

// Per-finger extension (index..pinky), 0 = curled, 1 = straight. Uses 3D
// world landmarks when available so it doesn't care about hand size.
function extensions(p, out, is3d) {
  const w = p[0];
  for (let i = 0; i < 4; i++) {
    const t = p[TIPS[i]], m = p[MCPS[i]];
    const dz = is3d ? (t.z - w.z) : 0, mz = is3d ? (m.z - w.z) : 0;
    const dt = Math.hypot(t.x - w.x, t.y - w.y, dz);
    const dm = Math.hypot(m.x - w.x, m.y - w.y, mz) || 1e-4;
    out[i] = clamp((dt / dm - 1.0) / 0.85, 0, 1);
  }
  return (out[0] + out[1] + out[2] + out[3]) / 4;
}

const pt = () => ({ x: 0, y: 0 });

// One Euro filter: heavy smoothing when a point is slow (kills camera
// jitter), almost none when it moves fast (no lag on flicks).
class OneEuro {
  constructor(minCutoff, beta) { this.minCutoff = minCutoff; this.beta = beta; this.x = null; this.dx = 0; }
  static alpha(cutoff, dt) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  reset(x) { this.x = x; this.dx = 0; }
  filter(x, dt) {
    if (this.x === null || dt <= 0) { this.x = x; return x; }
    const dx = (x - this.x) / dt;
    this.dx += (dx - this.dx) * OneEuro.alpha(1.0, dt);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += (x - this.x) * OneEuro.alpha(cutoff, dt);
    return this.x;
  }
}

// A boolean that has to hold for `hold` seconds before it flips, so one
// noisy frame never starts or cancels a move.
class Debounced {
  constructor(on = 0.07, off = 0.1) { this.v = false; this.t = 0; this.on = on; this.off = off; }
  update(raw, dt) {
    if (raw === this.v) { this.t = 0; return this.v; }
    this.t += dt;
    if (this.t >= (raw ? this.on : this.off)) { this.v = raw; this.t = 0; }
    return this.v;
  }
  set(v) { this.v = v; this.t = 0; }
}

export class HandState {
  constructor(slot) {
    this.slot = slot;
    this.present = false;
    this.target = Array.from({ length: 21 }, pt);
    this.pts = Array.from({ length: 21 }, pt);
    this.filters = Array.from({ length: 42 }, () => new OneEuro(CONFIG.euroMinCutoff, CONFIG.euroBeta));
    this.cx = 0; this.cy = 0;
    this.vx = 0; this.vy = 0;
    this.speed = 0;
    this.scale = 80; this.scaleRate = 0;
    this.detCx = 0; this.detCy = 0; this.detScale = 80; this.sinceDet = 0;
    this.open = 0.5; this.openTarget = 0.5;
    this.ext = [0.5, 0.5, 0.5, 0.5]; this.extT = [0.5, 0.5, 0.5, 0.5];
    this.point = false; this.pointTime = 0; this.two = false; this.twoTime = 0;
    this.tipX = 0; this.tipY = 0; this.pdx = 0; this.pdy = -1;
    this.fist = false; this.isOpen = false; this.cupped = false; this.still = false;
    this.stillTime = 0; this.lostTime = 0;
    this.flick = false; this.thrust = false;
    this.justAppeared = false; this._appeared = false; this._fresh = true;
    this.prevSpeed = 0; this.prevRate = 0; this.flickCool = 0; this.thrustCool = 0;
    this.db = { fist: new Debounced(), open: new Debounced(), cup: new Debounced(0.06, 0.12),
      point: new Debounced(0.08, 0.12), two: new Debounced(0.08, 0.12) };
  }

  // Palm center of a raw detection, for matching detections to slots.
  static palm(lm) {
    const o = { x: 0, y: 0 }, t = { x: 0, y: 0 };
    for (const i of [0, 5, 9, 13, 17]) { Projector.toScreen(lm[i].x, lm[i].y, t); o.x += t.x / 5; o.y += t.y / 5; }
    return o;
  }

  ingest(lm, wl, dtDet) {
    const fresh = !this.present;
    for (let i = 0; i < 21; i++) {
      Projector.toScreen(lm[i].x, lm[i].y, this.target[i]);
      const fx = this.filters[i * 2], fy = this.filters[i * 2 + 1];
      if (fresh) { fx.reset(this.target[i].x); fy.reset(this.target[i].y); }
      else { this.target[i].x = fx.filter(this.target[i].x, dtDet); this.target[i].y = fy.filter(this.target[i].y, dtDet); }
    }
    this.openTarget = wl ? extensions(wl, this.extT, true) : extensions(this.target, this.extT, false);

    // Motion is measured once per detection on filtered points, not per
    // render frame, so speed is steady and "still" really means still.
    const T = this.target;
    const cx = (T[0].x + T[5].x + T[9].x + T[13].x + T[17].x) / 5;
    const cy = (T[0].y + T[5].y + T[9].y + T[13].y + T[17].y) / 5;
    const sc = Math.max(Math.hypot(T[0].x - T[9].x, T[0].y - T[9].y), Math.hypot(T[5].x - T[17].x, T[5].y - T[17].y) * 1.45, 12);
    if (fresh) {
      for (let i = 0; i < 21; i++) { this.pts[i].x = T[i].x; this.pts[i].y = T[i].y; }
      this.open = this.openTarget;
      for (let i = 0; i < 4; i++) this.ext[i] = this.extT[i];
      this.vx = 0; this.vy = 0; this.scaleRate = 0;
      this.scale = sc; this.cx = cx; this.cy = cy;
      this.prevSpeed = 0; this.prevRate = 0;
      for (const d of Object.values(this.db)) d.set(false);
      this._appeared = true;
    } else if (dtDet > 0) {
      const k = 1 - Math.exp(-CONFIG.velSmooth * dtDet);
      this.vx += ((cx - this.detCx) / dtDet - this.vx) * k;
      this.vy += ((cy - this.detCy) / dtDet - this.vy) * k;
      const rate = (sc - this.detScale) / (this.detScale * dtDet);
      this.scaleRate += (rate - this.scaleRate) * k;
    }
    this.detCx = cx; this.detCy = cy; this.detScale = sc;
    this.sinceDet = 0;
    this.present = true;
    this.lostTime = 0;
  }

  miss(dt) {
    if (!this.present) return;
    this.lostTime += dt;
    if (this.lostTime > CONFIG.lostGrace) {
      this.present = false;
      this.speed = 0; this.vx = 0; this.vy = 0; this.scaleRate = 0;
      this.fist = this.isOpen = this.cupped = this.still = this.point = this.two = false;
      this.stillTime = 0; this.pointTime = 0; this.twoTime = 0;
    }
  }

  update(dt) {
    this.flick = false;
    this.thrust = false;
    this.justAppeared = this._appeared;
    this._appeared = false;
    if (!this.present || dt <= 0) return;

    // Between detections, lead the target along the measured velocity so
    // motion stays fluid at 60fps; during a dropout, coast and slow down.
    this.sinceDet += dt;
    const lead = Math.min(this.sinceDet, 0.05);
    const coast = this.lostTime > 0 ? Math.exp(-this.lostTime * 8) : 1;
    const ox = this.vx * lead * coast, oy = this.vy * lead * coast;
    const k = 1 - Math.exp(-CONFIG.follow * dt);
    for (let i = 0; i < 21; i++) {
      this.pts[i].x += (this.target[i].x + ox - this.pts[i].x) * k;
      this.pts[i].y += (this.target[i].y + oy - this.pts[i].y) * k;
    }
    const p = this.pts;
    this.cx = (p[0].x + p[5].x + p[9].x + p[13].x + p[17].x) / 5;
    this.cy = (p[0].y + p[5].y + p[9].y + p[13].y + p[17].y) / 5;
    this.scale += (this.detScale - this.scale) * k;

    this.speed = Math.hypot(this.vx, this.vy) / this.scale;
    const ko = 1 - Math.exp(-14 * dt);
    this.open += (this.openTarget - this.open) * ko;
    const E = this.ext;
    for (let i = 0; i < 4; i++) E[i] += (this.extT[i] - E[i]) * ko;

    // Pointing: index straight, the other three curled.
    const others = Math.max(E[1], E[2], E[3]);
    const rawPoint = this.point
      ? E[0] > CONFIG.pointExit && others < CONFIG.curlMax + 0.1
      : E[0] > CONFIG.pointEnter && others < CONFIG.curlMax;
    this.point = this.db.point.update(rawPoint, dt);
    this.pointTime = this.point ? this.pointTime + dt : 0;
    // Two-finger sign: index and middle straight, ring and pinky curled.
    const rp = Math.max(E[2], E[3]);
    const rawTwo = !rawPoint && (this.two
      ? E[0] > CONFIG.pointExit && E[1] > CONFIG.pointExit && rp < CONFIG.curlMax + 0.1
      : E[0] > CONFIG.pointEnter && E[1] > CONFIG.pointEnter && rp < CONFIG.curlMax);
    this.two = !this.point && this.db.two.update(rawTwo, dt);
    this.twoTime = this.two ? this.twoTime + dt : 0;
    {
      const a = p[5], b = p[8];
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1;
      this.pdx += (dx / m - this.pdx) * ko;
      this.pdy += (dy / m - this.pdy) * ko;
      const n = Math.hypot(this.pdx, this.pdy) || 1;
      this.pdx /= n; this.pdy /= n;
      this.tipX = b.x; this.tipY = b.y;
    }

    const sign = this.point || this.two;
    this.fist = !sign && this.db.fist.update(this.fist ? this.open < CONFIG.fistExit : this.open < CONFIG.fistEnter, dt);
    this.isOpen = this.db.open.update(this.isOpen ? this.open > CONFIG.openExit : this.open > CONFIG.openEnter, dt);
    this.cupped = !sign && !this.fist && !this.isOpen
      && this.db.cup.update(this.open > CONFIG.cupMin && this.open < CONFIG.cupMax, dt);
    // hysteresis on stillness too: settle below stillSpeed, break above 1.5x
    this.still = this.still ? this.speed < CONFIG.stillSpeed * 1.5 : this.speed < CONFIG.stillSpeed;
    this.stillTime = this.still ? this.stillTime + dt : 0;

    this.flickCool -= dt;
    this.thrustCool -= dt;
    if (this.speed > CONFIG.flickSpeed && this.prevSpeed <= CONFIG.flickSpeed && this.flickCool <= 0) {
      this.flick = true;
      this.flickCool = 0.35;
    }
    if (this.scaleRate > CONFIG.thrustRate && this.prevRate <= CONFIG.thrustRate && this.thrustCool <= 0) {
      this.thrust = true;
      this.thrustCool = 0.5;
    }
    this.prevSpeed = this.speed;
    this.prevRate = this.scaleRate;
  }

  dir() {
    const m = Math.hypot(this.vx, this.vy) || 1;
    return { x: this.vx / m, y: this.vy / m };
  }
}

export class Tracker {
  constructor() {
    this.hands = { L: new HandState('L'), R: new HandState('R') };
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.lastDetect = 0;
  }

  async init() {
    // Loaded on demand so the demo mode never needs the tracking bundle.
    const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(TASKS_WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: CONFIG.maxHands,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch (err) {
      console.warn('GPU hand tracking unavailable, falling back to CPU', err);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU'));
    }
  }

  detect(video, nowMs) {
    if (!this.landmarker || video.readyState < 2) return false;
    if (video.currentTime === this.lastVideoTime) return false;
    this.lastVideoTime = video.currentTime;
    const res = this.landmarker.detectForVideo(video, nowMs);
    this.apply(res.landmarks || [], res.worldLandmarks || [], res.handedness || res.handednesses || [], nowMs);
    return true;
  }

  // Shared by the camera path and the simulated-hands demo.
  apply(lms, wls, hds, nowMs) {
    const gap = (nowMs - this.lastDetect) / 1000;
    const dt = this.lastDetect && gap > 0 ? Math.min(gap, 0.2) : 1 / 30;
    this.lastDetect = nowMs;
    const dets = lms.map((lm, i) => ({ lm, wl: wls[i], label: hds[i]?.[0]?.categoryName || '', c: HandState.palm(lm) }));
    const assigned = { L: null, R: null };
    const H = this.hands;
    const d2 = (a, h) => (a.c.x - h.cx) ** 2 + (a.c.y - h.cy) ** 2;

    if (dets.length >= 2) {
      const a = dets[0], b = dets[1];
      if (H.L.present && H.R.present) {
        // Keep each hand in the slot it already owns (labels can flip).
        const keep = d2(a, H.L) + d2(b, H.R), swap = d2(a, H.R) + d2(b, H.L);
        assigned.L = keep <= swap ? a : b;
        assigned.R = keep <= swap ? b : a;
      } else {
        // Fresh pair: whoever is on the left of the screen is L.
        assigned.L = a.c.x < b.c.x ? a : b;
        assigned.R = a.c.x < b.c.x ? b : a;
      }
    } else if (dets.length === 1) {
      const d = dets[0];
      let slot = null, best = Infinity;
      for (const s of ['L', 'R']) {
        const h = H[s];
        if (!h.present) continue;
        const dist = d2(d, h);
        if (dist < (h.scale * 3.5) ** 2 && dist < best) { best = dist; slot = s; }
      }
      if (!slot) {
        if (H.L.present && !H.R.present) slot = 'R';
        else if (H.R.present && !H.L.present) slot = 'L';
        else slot = d.c.x < window.innerWidth / 2 ? 'L' : 'R';
      }
      assigned[slot] = d;
    }

    for (const s of ['L', 'R']) {
      if (assigned[s]) this.hands[s].ingest(assigned[s].lm, assigned[s].wl, dt);
      else this.hands[s].miss(dt);
    }
  }

  update(dt) {
    this.hands.L.update(dt);
    this.hands.R.update(dt);
  }
}
