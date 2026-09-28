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

function opennessFromWorld(wl) {
  const w = wl[0];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const t = wl[TIPS[i]], m = wl[MCPS[i]];
    const dt = Math.hypot(t.x - w.x, t.y - w.y, t.z - w.z);
    const dm = Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z) || 1e-4;
    sum += clamp((dt / dm - 1.0) / 0.85, 0, 1);
  }
  return sum / 4;
}

function opennessFrom2D(p) {
  const w = p[0];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const t = p[TIPS[i]], m = p[MCPS[i]];
    const dt = Math.hypot(t.x - w.x, t.y - w.y);
    const dm = Math.hypot(m.x - w.x, m.y - w.y) || 1e-4;
    sum += clamp((dt / dm - 1.0) / 0.85, 0, 1);
  }
  return sum / 4;
}

const pt = () => ({ x: 0, y: 0 });

export class HandState {
  constructor(slot) {
    this.slot = slot;
    this.present = false;
    this.target = Array.from({ length: 21 }, pt);
    this.pts = Array.from({ length: 21 }, pt);
    this.cx = 0; this.cy = 0;
    this.vx = 0; this.vy = 0;
    this.speed = 0;
    this.scale = 80; this.scalePrev = 80; this.scaleRate = 0;
    this.open = 0.5; this.openTarget = 0.5;
    this.fist = false; this.isOpen = false; this.cupped = false; this.still = false;
    this.stillTime = 0; this.lostTime = 0;
    this.flick = false; this.thrust = false;
    this.justAppeared = false; this._appeared = false; this._fresh = true;
    this.prevSpeed = 0; this.prevRate = 0; this.flickCool = 0; this.thrustCool = 0;
  }

  ingest(lm, wl) {
    for (let i = 0; i < 21; i++) Projector.toScreen(lm[i].x, lm[i].y, this.target[i]);
    this.openTarget = wl ? opennessFromWorld(wl) : opennessFrom2D(this.target);
    if (!this.present) {
      for (let i = 0; i < 21; i++) { this.pts[i].x = this.target[i].x; this.pts[i].y = this.target[i].y; }
      this.open = this.openTarget;
      this._appeared = true;
      this._fresh = true;
    }
    this.present = true;
    this.lostTime = 0;
  }

  miss(dt) {
    if (!this.present) return;
    this.lostTime += dt;
    if (this.lostTime > 0.22) {
      this.present = false;
      this.speed = 0; this.vx = 0; this.vy = 0; this.scaleRate = 0;
      this.fist = this.isOpen = this.cupped = this.still = false;
      this.stillTime = 0;
    }
  }

  update(dt) {
    this.flick = false;
    this.thrust = false;
    this.justAppeared = this._appeared;
    this._appeared = false;
    if (!this.present || dt <= 0) return;

    const k = 1 - Math.exp(-CONFIG.follow * dt);
    for (let i = 0; i < 21; i++) {
      this.pts[i].x += (this.target[i].x - this.pts[i].x) * k;
      this.pts[i].y += (this.target[i].y - this.pts[i].y) * k;
    }
    const p = this.pts;
    const cx = (p[0].x + p[5].x + p[9].x + p[13].x + p[17].x) / 5;
    const cy = (p[0].y + p[5].y + p[9].y + p[13].y + p[17].y) / 5;
    const sc = Math.max(
      Math.hypot(p[0].x - p[9].x, p[0].y - p[9].y),
      Math.hypot(p[5].x - p[17].x, p[5].y - p[17].y) * 1.45,
      12,
    );

    if (this._fresh) {
      this.cx = cx; this.cy = cy;
      this.vx = 0; this.vy = 0;
      this.scale = sc; this.scalePrev = sc; this.scaleRate = 0;
      this.prevSpeed = 0; this.prevRate = 0;
      this._fresh = false;
    } else {
      const kv = 1 - Math.exp(-CONFIG.velSmooth * dt);
      this.vx += ((cx - this.cx) / dt - this.vx) * kv;
      this.vy += ((cy - this.cy) / dt - this.vy) * kv;
      const rate = (sc - this.scalePrev) / (this.scalePrev * dt);
      this.scaleRate += (rate - this.scaleRate) * kv;
      this.cx = cx; this.cy = cy;
      this.scalePrev = sc;
      this.scale += (sc - this.scale) * kv;
    }

    this.speed = Math.hypot(this.vx, this.vy) / this.scale;
    this.open += (this.openTarget - this.open) * (1 - Math.exp(-14 * dt));

    this.fist = this.fist ? this.open < CONFIG.fistExit : this.open < CONFIG.fistEnter;
    this.isOpen = this.isOpen ? this.open > CONFIG.openExit : this.open > CONFIG.openEnter;
    this.cupped = !this.fist && !this.isOpen && this.open > CONFIG.cupMin && this.open < CONFIG.cupMax;
    this.still = this.speed < CONFIG.stillSpeed;
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
    const dets = lms.map((lm, i) => ({ lm, wl: wls[i], label: hds[i]?.[0]?.categoryName || '' }));
    const assigned = { L: null, R: null };

    if (dets.length >= 2) {
      const a = dets[0], b = dets[1];
      if (a.label && b.label && a.label !== b.label) {
        assigned[a.label === 'Left' ? 'L' : 'R'] = a;
        assigned[b.label === 'Left' ? 'L' : 'R'] = b;
      } else {
        const ax = 1 - a.lm[0].x, bx = 1 - b.lm[0].x;
        assigned.L = ax < bx ? a : b;
        assigned.R = ax < bx ? b : a;
      }
    } else if (dets.length === 1) {
      const d = dets[0];
      const tmp = Projector.toScreen(d.lm[9].x, d.lm[9].y, { x: 0, y: 0 });
      let slot = null;
      for (const s of ['L', 'R']) {
        const h = this.hands[s];
        if (h.present && Math.hypot(tmp.x - h.cx, tmp.y - h.cy) < h.scale * 3) slot = s;
      }
      if (!slot) slot = d.label === 'Right' ? 'R' : 'L';
      assigned[slot] = d;
    }

    for (const s of ['L', 'R']) {
      if (assigned[s]) this.hands[s].ingest(assigned[s].lm, assigned[s].wl);
      else this.hands[s].miss(dt);
    }
  }

  update(dt) {
    this.hands.L.update(dt);
    this.hands.R.update(dt);
  }
}
