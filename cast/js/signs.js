// Hand signs. Every move in Cast is keyed to a real, recognisable sign
// instead of a generic "open palm" or "fist", so moves stop colliding and
// each one reads instantly on camera.
//
// One-hand poses come from per-finger extension (3D, so orientation doesn't
// matter), the thumb, and how the index/middle tips sit relative to each
// other. Two-hand seals come from the geometry between the hands, and they
// survive one hand vanishing for a moment, because pressing your hands
// together is exactly when the tracker loses one of them.

// Finger extension thresholds (0 = curled, 1 = straight).
const UP = 0.55, DOWN = 0.42;

export const POSE_LABEL = {
  fist: 'FIST', open: 'OPEN PALM', point: 'POINT', V: 'TWO FINGERS', together: 'FINGERS CROSSED',
  horns: 'SORCERER SIGN', claw: 'CLAW', pinch: 'PINCH', raised: 'PALM RAISED',
};

// Loose "index + middle up, ring + pinky down", for seals where the other
// hand hides half the fingers.
export function twoish(h) {
  const E = h.ext;
  return E[0] > 0.45 && E[1] > 0.4 && Math.max(E[2], E[3]) < 0.55;
}

// The single-hand pose, or null when the hand is between signs.
export function pose(h) {
  if (!h.present) return null;
  const E = h.ext;
  if (h.point) return 'point';
  if (h.two) return h.crossed || h.gap < 0.28 ? 'together' : 'V';
  // index + pinky up, middle + ring folded: the sorcerer / web-shooter sign
  if (E[0] > UP && E[3] > UP && E[1] < DOWN && E[2] < DOWN) return 'horns';
  if (h.pinch) return 'pinch';
  if (h.fist) return 'fist';
  if (h.isOpen) return 'open';
  if (h.cupped) return 'claw';
  return null;
}

// Two-hand seals, remembered across a short dropout.
export class Seals {
  constructor() {
    this.last = null; this.lastT = -9; this.sticky = 0.5;
    this.info = null;
  }

  // Returns { sign, ... } or null. Signs:
  //  clone    both hands two-fingered, crossed at an angle (the shadow-clone seal)
  //  tiger    both hands two-fingered, fingers parallel and pointing up
  //  clap     palms pressed together
  //  stack    one hand held over the other (Rasengan)
  //  grab     one hand gripping the other's wrist (Chidori)
  read(L, R, time) {
    let out = null;
    if (L.present && R.present) {
      const sc = (L.scale + R.scale) / 2;
      const dx = R.cx - L.cx, dy = R.cy - L.cy;
      const d = Math.hypot(dx, dy) / sc;
      if (twoish(L) && twoish(R) && d < 2.8) {
        const c = Math.abs(L.pdx * R.pdx + L.pdy * R.pdy);
        const up = L.pdy < -0.45 && R.pdy < -0.45;
        out = { sign: c > 0.8 && up ? 'tiger' : c < 0.72 ? 'clone' : (up ? 'tiger' : 'clone'), x: (L.cx + R.cx) / 2, y: (L.cy + R.cy) / 2, sc };
      }
      if (!out) {
        // wrist grab: one palm sits on the other hand's wrist, and that hand
        // points its fingers away from the grip
        for (const [A, B] of [[L, R], [R, L]]) {
          const w = B.pts[0];
          const dw = Math.hypot(A.cx - w.x, A.cy - w.y) / sc;
          const dc = Math.hypot(A.cx - B.cx, A.cy - B.cy) / sc;
          if (dw < 1.05 && dc > dw * 1.45 && dc > 1.1 && !A.point && !A.two) {
            out = { sign: 'grab', holder: A, held: B, x: B.cx, y: B.cy, sc };
            break;
          }
        }
      }
      if (!out) {
        // one hand hovering over the other: stacked vertically, not touching
        const top = L.cy < R.cy ? L : R, bot = top === L ? R : L;
        const hx = Math.abs(dx) / sc, vy = (bot.cy - top.cy) / sc;
        if (hx < 1.5 && vy > 0.9 && vy < 3.4 && !top.fist && !bot.fist && !top.point && !bot.point) {
          out = { sign: 'stack', top, bot, x: (top.cx + bot.cx) / 2, y: (top.cy + bot.cy) / 2, sc, gap: vy };
        }
      }
      if (!out && d < 1.4 && !twoish(L) && !twoish(R) && !L.fist && !R.fist) {
        out = { sign: 'clap', x: (L.cx + R.cx) / 2, y: (L.cy + R.cy) / 2, sc };
      }
    } else if (this.last && time - this.lastT < this.sticky) {
      // Hands pressed together often hide one from the tracker. If the other
      // is still in a compatible shape, the seal holds.
      const h = L.present ? L : R.present ? R : null;
      const s = this.last.sign;
      if (h && ((s === 'clone' || s === 'tiger') && twoish(h))) out = { ...this.last, x: h.cx, y: h.cy };
      else if (h && s === 'clap' && !h.fist && !h.point) out = { ...this.last, x: h.cx, y: h.cy };
      if (out) { this.info = out; return out; }
    }
    if (out) { this.last = out; this.lastT = time; }
    this.info = out;
    return out;
  }
}

// A sign has to be held for `need` seconds before it counts; the progress
// feeds the on-screen ring so you can see it registering.
export class Hold {
  constructor(need = 0.3) { this.need = need; this.t = 0; this.fired = false; this.key = null; }
  update(key, dt) {
    if (key !== this.key) { this.key = key; this.t = 0; this.fired = false; }
    if (key) this.t += dt; else this.t = 0;
    return this;
  }
  get p() { return Math.min(1, this.t / this.need); }
  // true exactly once per continuous hold
  get ready() { if (this.key && !this.fired && this.t >= this.need) { this.fired = true; return true; } return false; }
  get held() { return !!this.key && this.t >= this.need; }
  reset() { this.t = 0; this.fired = false; this.key = null; }
}
