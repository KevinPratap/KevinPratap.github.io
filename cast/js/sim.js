// Demo mode: scripted synthetic hands (and a painted backdrop) drive the real
// gesture engine, so the effects can be previewed without a camera.

const FINGERS = [
  [5, -0.3, -0.93, -0.14, [0.42, 0.25, 0.2]],
  [9, -0.04, -1.0, 0.0, [0.46, 0.28, 0.21]],
  [13, 0.2, -0.95, 0.12, [0.43, 0.26, 0.2]],
  [17, 0.4, -0.84, 0.26, [0.33, 0.2, 0.18]],
];

// Hand model in units of wrist-to-knuckle length. y is down, -z faces the camera.
const POSES = { point: [1, 0.02, 0.02, 0.02], two: [1, 1, 0.02, 0.02] };

function buildHand(open, pose) {
  const P = new Array(21);
  const per = POSES[pose] ? POSES[pose].map((f) => f) : [open, open, open, open];
  const tc = 1 - (POSES[pose] ? 0.1 : open);
  P[0] = [0, 0, 0];
  P[1] = [-0.3, -0.28, -0.05];
  P[2] = [-0.55 + tc * 0.25, -0.48, -0.1 - tc * 0.1];
  P[3] = [-0.75 + tc * 0.45, -0.65 + tc * 0.05, -0.15 - tc * 0.15];
  P[4] = [-0.9 + tc * 0.7, -0.8 + tc * 0.15, -0.2 - tc * 0.2];
  FINGERS.forEach(([m, bx, by, fan, lens], fi) => {
    P[m] = [bx, by, 0];
    const fo = per[fi];
    const ftc = 1 - fo;
    const f = fan * (0.5 + fo);
    let th = 0;
    let p = P[m];
    const bends = [1.25, 1.45, 1.0];
    for (let j = 0; j < 3; j++) {
      th += bends[j] * ftc;
      const d = [Math.sin(f) * Math.cos(th), -Math.cos(f) * Math.cos(th), -Math.sin(th)];
      p = [p[0] + d[0] * lens[j], p[1] + d[1] * lens[j], p[2] + d[2] * lens[j]];
      P[m + 1 + j] = p;
    }
  });
  return P;
}

// [time, x, y, size, openness, pose?, roll?] in display-normalized coords;
// null = hand absent. pose: 'point' | 'two'. roll tilts the hand (radians).
const SCRIPTS = {
  ember: {
    len: 15.6,
    R: [[0, null], [0.3, 0.7, 0.64, 0.16, 0.45], [2.2, 0.68, 0.62, 0.16, 0.45], [2.34, 0.98, 0.48, 0.16, 0.5],
      [2.8, 0.66, 0.6, 0.16, 0.45], [4.4, 0.66, 0.6, 0.16, 0.45], [4.55, 0.64, 0.58, 0.27, 0.5],
      [4.9, 0.7, 0.56, 0.16, 0.05], [5.1, 0.72, 0.55, 0.16, 0.05], [5.35, 0.25, 0.5, 0.16, 0.05],
      [5.6, 0.72, 0.56, 0.16, 0.05], [5.85, 0.25, 0.5, 0.16, 0.05], [6.2, 0.65, 0.55, 0.16, 0.5],
      [7.2, 0.65, 0.55, 0.16, 0.5], [7.6, 0.53, 0.55, 0.16, 0.4], [8.4, 0.53, 0.55, 0.16, 0.4],
      [8.52, 0.88, 0.5, 0.16, 0.4], [9.2, 0.8, 0.55, 0.16, 0.95], [12.0, 0.8, 0.55, 0.16, 0.95], [12.3, null],
      [12.6, 0.74, 0.62, 0.16, 0.5, 'point', -1.1], [13.2, 0.74, 0.62, 0.16, 0.5, 'point', -1.1],
      [14.8, 0.72, 0.5, 0.16, 0.5, 'point', -0.5], [15.0, null], [15.6, null]],
    L: [[0, null], [6.2, null], [6.3, 0.35, 0.55, 0.16, 0.5], [7.2, 0.35, 0.55, 0.16, 0.5],
      [7.6, 0.47, 0.55, 0.16, 0.4], [8.4, 0.47, 0.55, 0.16, 0.4], [8.52, 0.12, 0.5, 0.16, 0.4],
      [9.2, 0.2, 0.55, 0.16, 0.95], [12.0, 0.2, 0.55, 0.16, 0.95], [12.3, null], [15.6, null]],
  },
  nyx: {
    len: 14,
    R: [[0, null], [0.3, 0.66, 0.6, 0.16, 0.35], [2.6, 0.66, 0.6, 0.16, 0.35], [2.9, 0.66, 0.6, 0.16, 0.95],
      [3.3, 0.66, 0.6, 0.16, 0.95], [3.42, 0.4, 0.56, 0.16, 0.95], [4.2, 0.62, 0.58, 0.16, 0.95],
      [4.5, 0.62, 0.58, 0.16, 0.95], [4.62, 0.6, 0.56, 0.27, 0.95], [5.3, 0.6, 0.55, 0.16, 0.6],
      [5.8, 0.53, 0.55, 0.16, 0.6], [10.2, 0.53, 0.55, 0.16, 0.6], [10.32, 0.85, 0.5, 0.16, 0.6],
      [11.0, 0.85, 0.5, 0.16, 0.6], [11.2, null],
      [11.6, 0.8, 0.28, 0.16, 0.5, 'point', -0.6], [12.1, 0.8, 0.28, 0.16, 0.5, 'point', -0.6],
      [12.36, 0.22, 0.74, 0.16, 0.5, 'point', -0.6], [12.9, 0.22, 0.74, 0.16, 0.5, 'point', -0.6], [13.1, null], [14, null]],
    L: [[0, null], [5.2, null], [5.3, 0.4, 0.55, 0.16, 0.6], [5.8, 0.47, 0.55, 0.16, 0.6],
      [10.2, 0.47, 0.55, 0.16, 0.6], [10.32, 0.15, 0.5, 0.16, 0.6], [11.0, 0.15, 0.5, 0.16, 0.6], [11.2, null], [14, null]],
  },
  raiju: {
    len: 11,
    R: [[0, null], [0.3, 0.68, 0.6, 0.16, 0.45], [2.4, 0.68, 0.6, 0.16, 0.45], [2.55, 0.98, 0.46, 0.16, 0.5],
      [3.0, 0.66, 0.62, 0.16, 0.5, 'point', -1.0], [4.7, 0.66, 0.62, 0.16, 0.5, 'point', -1.0],
      [5.0, 0.75, 0.55, 0.16, 0.95], [7.3, 0.75, 0.55, 0.16, 0.95], [7.45, 0.54, 0.55, 0.16, 0.95], [8.0, 0.54, 0.55, 0.16, 0.95],
      [8.4, 0.6, 0.22, 0.16, 0.05], [9.0, 0.6, 0.22, 0.16, 0.05], [9.14, 0.6, 0.72, 0.16, 0.05], [9.8, 0.6, 0.72, 0.16, 0.05],
      [10.0, null], [11, null]],
    L: [[0, null], [4.9, null], [5.0, 0.25, 0.55, 0.16, 0.95], [7.3, 0.25, 0.55, 0.16, 0.95], [7.45, 0.46, 0.55, 0.16, 0.95],
      [8.0, 0.46, 0.55, 0.16, 0.95], [8.1, null], [11, null]],
  },
  kai: {
    len: 26,
    R: [[0, null], [0.3, 0.52, 0.62, 0.16, 0.55], [3.0, 0.52, 0.62, 0.16, 0.55], [3.15, 0.72, 0.6, 0.16, 0.55],
      [5.6, 0.72, 0.6, 0.16, 0.55], [5.8, null],
      [6.2, 0.7, 0.25, 0.16, 0.95], [10.5, 0.7, 0.25, 0.16, 0.95], [10.65, 0.7, 0.6, 0.16, 0.95], [11.2, 0.7, 0.6, 0.16, 0.95], [11.3, null],
      [12.0, 0.72, 0.6, 0.16, 0.95], [12.5, 0.72, 0.6, 0.16, 0.95], [12.62, 0.45, 0.55, 0.16, 0.95], [12.9, 0.72, 0.6, 0.16, 0.95],
      [13.02, 0.45, 0.5, 0.16, 0.95], [13.3, 0.72, 0.6, 0.16, 0.95], [13.42, 0.45, 0.6, 0.16, 0.95], [13.8, 0.72, 0.6, 0.16, 0.95], [14.0, null],
      [14.5, 0.62, 0.6, 0.16, 0.05], [17.2, 0.62, 0.6, 0.16, 0.05], [17.5, 0.64, 0.6, 0.16, 0.9], [18.5, 0.64, 0.6, 0.16, 0.9], [18.6, null],
      [19.0, 0.6, 0.55, 0.16, 0.5, 'two'], [20.1, 0.6, 0.55, 0.16, 0.5, 'two'], [20.3, null],
      [20.8, 0.53, 0.62, 0.16, 0.55], [23.2, 0.53, 0.62, 0.16, 0.55], [23.35, 0.52, 0.6, 0.27, 0.55], [24.8, 0.52, 0.6, 0.27, 0.55], [25.0, null], [26, null]],
    L: [[0, null], [0.3, 0.44, 0.62, 0.16, 0.55], [3.0, 0.44, 0.62, 0.16, 0.55], [3.15, 0.64, 0.6, 0.16, 0.55],
      [5.6, 0.64, 0.6, 0.16, 0.55], [5.8, null],
      [6.2, 0.3, 0.25, 0.16, 0.95], [10.5, 0.3, 0.25, 0.16, 0.95], [10.65, 0.3, 0.6, 0.16, 0.95], [11.2, 0.3, 0.6, 0.16, 0.95], [11.3, null],
      [14.5, 0.38, 0.6, 0.16, 0.05], [17.2, 0.38, 0.6, 0.16, 0.05], [17.5, 0.36, 0.6, 0.16, 0.9], [18.5, 0.36, 0.6, 0.16, 0.9], [18.6, null],
      [20.8, 0.45, 0.62, 0.16, 0.55], [23.2, 0.45, 0.62, 0.16, 0.55], [23.35, 0.44, 0.6, 0.27, 0.55], [24.8, 0.44, 0.6, 0.27, 0.55], [25.0, null], [26, null]],
  },
};

const ss = (t) => t * t * (3 - 2 * t);

function sample(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a[0] && t < b[0]) {
      if (a[1] === null || b[1] === null) return null;
      const k = ss((t - a[0]) / (b[0] - a[0]));
      const v = [1, 2, 3, 4].map((j) => a[j] + (b[j] - a[j]) * k);
      v.push(a[5] || null, (a[6] || 0) + ((b[6] || 0) - (a[6] || 0)) * k);
      return v;
    }
  }
  return null;
}

export class SimHands {
  constructor(tracker) {
    this.tracker = tracker;
    this.script = SCRIPTS.ember;
    this.clock = 0;
    this.offset = 0;
    this.last = -1000;
    this.canvas = this.paintBackdrop();
  }

  setCharacter(name) {
    this.script = SCRIPTS[name] || SCRIPTS.ember;
    this.offset = this.clock;
  }

  paintBackdrop() {
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 720);
    bg.addColorStop(0, '#262a3b'); bg.addColorStop(1, '#0d0e15');
    g.fillStyle = bg; g.fillRect(0, 0, 1280, 720);
    const win = g.createLinearGradient(0, 60, 0, 300);
    win.addColorStop(0, '#9fb4d6'); win.addColorStop(1, '#55668a');
    g.fillStyle = win; g.fillRect(90, 60, 300, 230);
    g.strokeStyle = '#1b1e29'; g.lineWidth = 10;
    g.strokeRect(90, 60, 300, 230);
    g.beginPath(); g.moveTo(240, 60); g.lineTo(240, 290); g.moveTo(90, 175); g.lineTo(390, 175); g.stroke();
    const spines = ['#7a3b3b', '#3b5a7a', '#6b6440', '#44614a', '#5a3b6b', '#7a5a3b'];
    for (let i = 0; i < 26; i++) {
      g.fillStyle = spines[i % spines.length];
      const h = 90 + ((i * 37) % 50);
      g.fillRect(900 + i * 13, 250 - h, 11, h);
      g.fillRect(900 + i * 13, 420 - h * 0.8, 11, h * 0.8);
    }
    g.fillStyle = '#15171f'; g.fillRect(880, 250, 360, 10); g.fillRect(880, 420, 360, 10);
    const lamp = g.createRadialGradient(760, 150, 0, 760, 150, 220);
    lamp.addColorStop(0, 'rgba(255,214,150,0.55)'); lamp.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = lamp; g.fillRect(500, 0, 520, 400);
    g.fillStyle = '#08090d';
    g.beginPath(); g.arc(640, 330, 72, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(640, 600, 270, 190, 0, Math.PI, 0); g.fill();
    g.fillRect(370, 600, 540, 130);
    g.strokeStyle = 'rgba(255,214,150,0.25)'; g.lineWidth = 3;
    g.beginPath(); g.arc(640, 330, 72, -2.4, -0.7); g.stroke();
    return c;
  }

  handFrame(slot, st, t) {
    const [x, y, s, open, pose, roll] = st;
    const vw = 1280, vh = 720;
    const L = s * vh;
    const P = buildHand(open, pose);
    const mir = slot === 'L' ? -1 : 1;
    const pc = [0, 5, 9, 13, 17].reduce((acc, i) => [acc[0] + P[i][0] / 5, acc[1] + P[i][1] / 5], [0, 0]);
    const rot = Math.sin(t * 1.3 + (slot === 'L' ? 1 : 0)) * 0.06 + (roll || 0) * mir;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const lm = [], wl = [];
    for (const p of P) {
      const lx = (p[0] - pc[0]) * mir, ly = p[1] - pc[1];
      const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr;
      const dx = x * vw + rx * L, dy = y * vh + ry * L;
      lm.push({ x: 1 - dx / vw, y: dy / vh, z: (p[2] * L) / vw });
      wl.push({ x: p[0] * mir * 0.09, y: p[1] * 0.09, z: p[2] * 0.09 });
    }
    return { lm, wl, label: slot === 'L' ? 'Left' : 'Right' };
  }

  // Runs on the engine's clock so the script plays the same at any frame rate.
  get elapsed() { return (this.clock - this.offset) / 1000; }
  get time() { return this.elapsed % this.script.len; }

  update(dt) {
    this.clock += dt * 1000;
    if (this.clock - this.last < 33) return;
    this.last = this.clock;
    const nowMs = this.clock;
    const t = this.time;
    const frames = [];
    for (const slot of ['L', 'R']) {
      const st = sample(this.script[slot], t);
      if (st) frames.push(this.handFrame(slot, st, t));
    }
    this.tracker.apply(
      frames.map((f) => f.lm),
      frames.map((f) => f.wl),
      frames.map((f) => [{ categoryName: f.label }]),
      nowMs,
    );
  }
}
