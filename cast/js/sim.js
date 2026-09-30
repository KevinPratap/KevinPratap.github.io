// Demo mode: scripted synthetic hands (and a painted backdrop) drive the real
// gesture engine, so the effects can be previewed without a camera.

const FINGERS = [
  [5, -0.3, -0.93, -0.14, [0.42, 0.25, 0.2]],
  [9, -0.04, -1.0, 0.0, [0.46, 0.28, 0.21]],
  [13, 0.2, -0.95, 0.12, [0.43, 0.26, 0.2]],
  [17, 0.4, -0.84, 0.26, [0.33, 0.2, 0.18]],
];

// Hand model in units of wrist-to-knuckle length. y is down, -z faces the camera.
const POSES = {
  point: [1, 0.02, 0.02, 0.02], two: [1, 1, 0.02, 0.02], pinch: [0.55, 0.85, 0.85, 0.85],
  cross: [1, 1, 0.02, 0.02], horns: [1, 0.02, 0.02, 1], fist: [0.02, 0.02, 0.02, 0.02],
  claw: [0.5, 0.5, 0.5, 0.5], snapped: [1, 0.05, 0.6, 0.6], snapset: [1, 0.75, 0.6, 0.6],
};

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
  if (pose === 'cross') {
    // middle finger laid over the index: tips swap sides
    const sh = P[8][0] - P[12][0] - 0.08;
    for (const j of [11, 12]) P[j] = [P[j][0] + sh * (j === 12 ? 1 : 0.6), P[j][1], P[j][2] - 0.05];
  }
  if (pose === 'fist' || pose === 'claw') {
    // thumb wraps over the curled fingers
    P[4] = [-0.2, -0.7, -0.35]; P[3] = [-0.42, -0.55, -0.22];
  }
  if (pose === 'snapset') { P[4] = [P[12][0] - 0.02, P[12][1] + 0.02, P[12][2]]; P[3] = [(P[2][0] + P[4][0]) / 2, (P[2][1] + P[4][1]) / 2, P[2][2]]; }
  if (pose === 'snapped') { P[4] = [-0.95, -0.55, -0.1]; P[3] = [-0.75, -0.45, -0.1]; }
  if (pose === 'horns') { P[4] = [-0.95, -0.7, -0.2]; P[3] = [-0.72, -0.55, -0.15]; }
  if (pose === 'pinch') {
    // thumb tip meets the index tip
    P[4] = [P[8][0] - 0.03, P[8][1] + 0.03, P[8][2]];
    P[3] = [(P[2][0] + P[4][0]) / 2, (P[2][1] + P[4][1]) / 2, (P[2][2] + P[4][2]) / 2];
  }
  return P;
}

// [time, x, y, size, openness, pose?, roll?] in display-normalized coords;
// null = hand absent. pose: 'point' | 'two'. roll tilts the hand (radians).
const SCRIPTS = {
  ember: {
    len: 20.4,
    R: [[0, null], [0.3, 0.7, 0.64, 0.16, 0.45], [2.2, 0.68, 0.62, 0.16, 0.45], [2.34, 0.98, 0.48, 0.16, 0.5],
      [2.8, 0.66, 0.6, 0.16, 0.45], [4.4, 0.66, 0.6, 0.16, 0.45], [4.55, 0.64, 0.58, 0.27, 0.5],
      [4.9, 0.7, 0.56, 0.16, 0.05], [5.1, 0.72, 0.55, 0.16, 0.05], [5.35, 0.25, 0.5, 0.16, 0.05],
      [5.6, 0.72, 0.56, 0.16, 0.05], [5.85, 0.25, 0.5, 0.16, 0.05], [6.2, 0.65, 0.55, 0.16, 0.5],
      [7.2, 0.65, 0.55, 0.16, 0.5], [7.6, 0.53, 0.55, 0.16, 0.4], [8.4, 0.53, 0.55, 0.16, 0.4],
      [8.52, 0.88, 0.5, 0.16, 0.4], [9.2, 0.8, 0.55, 0.16, 0.95], [12.0, 0.8, 0.55, 0.16, 0.95], [12.3, null],
      [12.6, 0.74, 0.62, 0.16, 0.5, 'point', -1.1], [13.2, 0.74, 0.62, 0.16, 0.5, 'point', -1.1],
      [14.8, 0.72, 0.5, 0.16, 0.5, 'point', -0.5], [15.0, null],
      [15.8, 0.5, 0.42, 0.16, 0.5, 'two'], [17.0, 0.5, 0.42, 0.16, 0.5, 'two'], [18.2, 0.7, 0.42, 0.16, 0.5, 'two'], [19.6, 0.3, 0.4, 0.16, 0.5, 'two'], [19.8, null], [20.4, null]],
    L: [[0, null], [6.2, null], [6.3, 0.35, 0.55, 0.16, 0.5], [7.2, 0.35, 0.55, 0.16, 0.5],
      [7.6, 0.47, 0.55, 0.16, 0.4], [8.4, 0.47, 0.55, 0.16, 0.4], [8.52, 0.12, 0.5, 0.16, 0.4],
      [9.2, 0.2, 0.55, 0.16, 0.95], [12.0, 0.2, 0.55, 0.16, 0.95], [12.3, null], [20.4, null]],
  },
  nyx: {
    len: 19.2,
    R: [[0, null], [0.3, 0.66, 0.6, 0.16, 0.35], [2.6, 0.66, 0.6, 0.16, 0.35], [2.9, 0.66, 0.6, 0.16, 0.95],
      [3.3, 0.66, 0.6, 0.16, 0.95], [3.42, 0.4, 0.56, 0.16, 0.95], [4.2, 0.62, 0.58, 0.16, 0.95],
      [4.5, 0.62, 0.58, 0.16, 0.95], [4.62, 0.6, 0.56, 0.27, 0.95], [5.3, 0.6, 0.55, 0.16, 0.6],
      [5.8, 0.53, 0.55, 0.16, 0.6], [10.2, 0.53, 0.55, 0.16, 0.6], [10.32, 0.85, 0.5, 0.16, 0.6],
      [11.0, 0.85, 0.5, 0.16, 0.6], [11.2, null],
      [11.6, 0.8, 0.28, 0.16, 0.5, 'point', -0.6], [12.1, 0.8, 0.28, 0.16, 0.5, 'point', -0.6],
      [12.36, 0.22, 0.74, 0.16, 0.5, 'point', -0.6], [12.9, 0.22, 0.74, 0.16, 0.5, 'point', -0.6], [13.1, null],
      [14.4, 0.72, 0.5, 0.16, 0.95], [17.0, 0.72, 0.5, 0.16, 0.95], [17.25, 0.72, 0.3, 0.16, 0.05], [17.4, 0.72, 0.3, 0.16, 0.05], [17.6, 0.72, 0.78, 0.16, 0.05], [18.2, 0.72, 0.78, 0.16, 0.05], [18.4, null], [19.2, null]],
    L: [[0, null], [5.2, null], [5.3, 0.4, 0.55, 0.16, 0.6], [5.8, 0.47, 0.55, 0.16, 0.6],
      [10.2, 0.47, 0.55, 0.16, 0.6], [10.32, 0.15, 0.5, 0.16, 0.6], [11.0, 0.15, 0.5, 0.16, 0.6], [11.2, null],
      [14.4, 0.28, 0.5, 0.16, 0.95], [17.0, 0.28, 0.5, 0.16, 0.95], [17.25, 0.28, 0.3, 0.16, 0.05], [17.4, 0.28, 0.3, 0.16, 0.05], [17.6, 0.28, 0.78, 0.16, 0.05], [18.2, 0.28, 0.78, 0.16, 0.05], [18.4, null], [19.2, null]],
  },
  raiju: {
    len: 20.6,
    R: [[0, null], [0.3, 0.68, 0.6, 0.16, 0.45], [2.4, 0.68, 0.6, 0.16, 0.45], [2.55, 0.98, 0.46, 0.16, 0.5],
      [3.0, 0.66, 0.62, 0.16, 0.5, 'point', -1.0], [4.7, 0.66, 0.62, 0.16, 0.5, 'point', -1.0],
      [5.0, 0.75, 0.55, 0.16, 0.95], [7.3, 0.75, 0.55, 0.16, 0.95], [7.45, 0.54, 0.55, 0.16, 0.95], [8.0, 0.54, 0.55, 0.16, 0.95],
      [8.4, 0.6, 0.22, 0.16, 0.05], [9.0, 0.6, 0.22, 0.16, 0.05], [9.14, 0.6, 0.72, 0.16, 0.05], [9.8, 0.6, 0.72, 0.16, 0.05],
      [10.0, null],
      [11.4, 0.6, 0.6, 0.16, 0.5, 'point', 0], [12.5, 0.6, 0.6, 0.16, 0.5, 'point', 0],
      [12.8, 0.62, 0.55, 0.16, 0.5, 'point', 1.15], [14.3, 0.62, 0.55, 0.16, 0.5, 'point', 1.15],
      [14.6, 0.62, 0.55, 0.16, 0.5, 'point', -1.2], [15.5, 0.62, 0.55, 0.16, 0.5, 'point', -1.2], [15.6, null],
      [16.1, 0.75, 0.6, 0.16, 0.95], [18.2, 0.75, 0.6, 0.16, 0.95], [18.45, 0.75, 0.25, 0.16, 0.95],
      [19.0, 0.75, 0.25, 0.16, 0.95], [19.15, 0.54, 0.25, 0.16, 0.95], [19.6, 0.54, 0.25, 0.16, 0.95], [19.7, null], [20.6, null]],
    L: [[0, null], [4.9, null], [5.0, 0.25, 0.55, 0.16, 0.95], [7.3, 0.25, 0.55, 0.16, 0.95], [7.45, 0.46, 0.55, 0.16, 0.95],
      [8.0, 0.46, 0.55, 0.16, 0.95], [8.1, null], [16.0, null],
      [16.1, 0.25, 0.6, 0.16, 0.95], [18.2, 0.25, 0.6, 0.16, 0.95], [18.45, 0.25, 0.25, 0.16, 0.95],
      [19.0, 0.25, 0.25, 0.16, 0.95], [19.15, 0.46, 0.25, 0.16, 0.95], [19.6, 0.46, 0.25, 0.16, 0.95], [19.7, null], [20.6, null]],
  },
  kai: {
    len: 29.4,
    R: [[0, null], [0.3, 0.52, 0.62, 0.16, 0.55], [3.0, 0.52, 0.62, 0.16, 0.55], [3.15, 0.72, 0.6, 0.16, 0.55],
      [5.6, 0.72, 0.6, 0.16, 0.55], [5.8, null],
      [6.2, 0.7, 0.25, 0.16, 0.95], [10.5, 0.7, 0.25, 0.16, 0.95], [10.65, 0.7, 0.6, 0.16, 0.95], [11.2, 0.7, 0.6, 0.16, 0.95], [11.3, null],
      [12.0, 0.72, 0.6, 0.16, 0.95], [12.5, 0.72, 0.6, 0.16, 0.95], [12.62, 0.45, 0.55, 0.16, 0.95], [12.9, 0.72, 0.6, 0.16, 0.95],
      [13.02, 0.45, 0.5, 0.16, 0.95], [13.3, 0.72, 0.6, 0.16, 0.95], [13.42, 0.45, 0.6, 0.16, 0.95], [13.8, 0.72, 0.6, 0.16, 0.95], [14.0, null],
      [14.5, 0.62, 0.6, 0.16, 0.05], [17.2, 0.62, 0.6, 0.16, 0.05], [17.5, 0.64, 0.6, 0.16, 0.9], [18.5, 0.64, 0.6, 0.16, 0.9], [18.6, null],
      [19.0, 0.53, 0.5, 0.16, 0.5, 'two'], [20.1, 0.53, 0.5, 0.16, 0.5, 'two'], [20.3, null],
      [20.8, 0.53, 0.62, 0.16, 0.55], [23.2, 0.53, 0.62, 0.16, 0.55], [23.35, 0.52, 0.6, 0.27, 0.55], [24.8, 0.52, 0.6, 0.27, 0.55], [25.0, null],
      [26.2, 0.62, 0.24, 0.16, 0.95], [28.0, 0.62, 0.24, 0.16, 0.95], [28.15, 0.95, 0.62, 0.16, 0.95], [28.6, null], [29.4, null]],
    L: [[0, null], [0.3, 0.44, 0.62, 0.16, 0.55], [3.0, 0.44, 0.62, 0.16, 0.55], [3.15, 0.64, 0.6, 0.16, 0.55],
      [5.6, 0.64, 0.6, 0.16, 0.55], [5.8, null],
      [6.2, 0.3, 0.25, 0.16, 0.95], [10.5, 0.3, 0.25, 0.16, 0.95], [10.65, 0.3, 0.6, 0.16, 0.95], [11.2, 0.3, 0.6, 0.16, 0.95], [11.3, null],
      [14.5, 0.38, 0.6, 0.16, 0.05], [17.2, 0.38, 0.6, 0.16, 0.05], [17.5, 0.36, 0.6, 0.16, 0.9], [18.5, 0.36, 0.6, 0.16, 0.9], [18.6, null],
      [20.8, 0.45, 0.62, 0.16, 0.55], [23.2, 0.45, 0.62, 0.16, 0.55], [23.35, 0.44, 0.6, 0.27, 0.55], [24.8, 0.44, 0.6, 0.27, 0.55], [25.0, null], [29.4, null]],
  },
};


// ---- generated scripts for the newer characters ----

// One hand-sign chain: single-hand signs use the right hand, 'clap' both.
function signChain(list, t0, out) {
  const SIGN = {
    fist: [0.05], two: [0.5, 'two'], point: [0.5, 'point'], open: [0.95],
  };
  let t = t0;
  for (const s of list) {
    if (s === 'clap') {
      out.R.push([t, 0.53, 0.56, 0.16, 0.6], [t + 0.9, 0.53, 0.56, 0.16, 0.6]);
      out.L.push([t, 0.47, 0.56, 0.16, 0.6], [t + 0.9, 0.47, 0.56, 0.16, 0.6]);
      t += 0.9;
    } else {
      const [open, pose] = SIGN[s];
      out.R.push([t, 0.62, 0.55, 0.16, open, pose], [t + 0.55, 0.62, 0.55, 0.16, open, pose]);
      t += 0.7;
    }
  }
  out.R.push([t, null]);
  out.L.push([t, null]);
  return t;
}

function kageScript() {
  const R = [[0, null]], L = [[0, null]];
  const k = (arr, t, x, y, sz, open, pose, roll) => arr.push([t, x, y, sz, open, pose || null, roll || 0]);
  // clone seal: right hand's two fingers vertical, left hand's horizontal, crossed
  k(R, 0.8, 0.54, 0.56, 0.16, 0.5, 'two', 0); k(R, 2.2, 0.54, 0.56, 0.16, 0.5, 'two', 0); R.push([2.3, null]);
  k(L, 0.8, 0.49, 0.58, 0.16, 0.5, 'two', 1.5); k(L, 2.2, 0.49, 0.58, 0.16, 0.5, 'two', 1.5); L.push([2.3, null]);
  // rasengan: left hand hovering over the right, swirling
  let t = 3.4;
  k(R, t, 0.6, 0.7, 0.16, 0.6); k(L, t, 0.6, 0.45, 0.16, 0.6);
  for (let i = 1; i <= 8; i++) { const a = i * 1.6; k(L, t + i * 0.2, 0.6 + Math.cos(a) * 0.03, 0.45 + Math.sin(a) * 0.02, 0.16, 0.6); k(R, t + i * 0.2, 0.6, 0.7, 0.16, 0.6); }
  t += 1.8;
  L.push([t + 0.1, null]);
  k(R, t + 0.6, 0.6, 0.66, 0.16, 0.6); k(R, t + 0.72, 0.62, 0.64, 0.3, 0.6); k(R, t + 1.6, 0.62, 0.64, 0.16, 0.6); R.push([t + 1.7, null]);
  t += 3.2;
  // chidori: left hand grips the right wrist, right hand clawed down
  k(R, t, 0.62, 0.62, 0.16, 0.5, 'claw', 3.1); k(R, t + 1.4, 0.62, 0.62, 0.16, 0.5, 'claw', 3.1);
  k(L, t, 0.62, 0.5, 0.16, 0.3); k(L, t + 1.4, 0.62, 0.5, 0.16, 0.3); L.push([t + 1.5, null]);
  k(R, t + 1.8, 0.62, 0.6, 0.16, 0.5, 'claw', 3.1); k(R, t + 1.95, 0.32, 0.5, 0.16, 0.5, 'claw', 3.1); k(R, t + 2.6, 0.32, 0.5, 0.16, 0.5, 'claw', 3.1); R.push([t + 2.7, null]);
  t += 4.2;
  // tiger seal: both hands two fingers up, side by side
  k(R, t, 0.53, 0.62, 0.16, 0.5, 'two', 0); k(R, t + 1.2, 0.53, 0.62, 0.16, 0.5, 'two', 0); R.push([t + 1.3, null]);
  k(L, t, 0.47, 0.62, 0.16, 0.5, 'two', 0); k(L, t + 1.2, 0.47, 0.62, 0.16, 0.5, 'two', 0); L.push([t + 1.3, null]);
  t += 4;
  R.push([t, null]); L.push([t, null]);
  return { len: t, R, L };
}

function circleKeys(cx, cy, rpx, t0, dur, turns) {
  const keys = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2 * turns;
    keys.push([t0 + (i / N) * dur, cx + Math.cos(a) * rpx / 1280, cy + Math.sin(a) * rpx / 720, 0.16, 0.5, 'point', -0.5]);
  }
  return keys;
}

function mystralScript() {
  const R = [[0, null],
    [0.3, 0.66, 0.56, 0.16, 0.5, 'horns'], [1.3, 0.66, 0.56, 0.16, 0.5, 'horns'], [1.5, 0.66, 0.56, 0.16, 0.95], [3.0, 0.66, 0.56, 0.16, 0.95], [3.14, 0.64, 0.54, 0.27, 0.95], [3.5, 0.64, 0.54, 0.27, 0.95], [3.6, null],
    ...circleKeys(0.6, 0.52, 150, 5.0, 1.5, 1.25), [6.6, 0.6, 0.52, 0.16, 0.5, 'point', -0.5], [7.0, null],
    [10.0, 0.6, 0.5, 0.16, 0.5, 'two', -0.2], [13.2, 0.6, 0.5, 0.16, 0.5, 'two', -0.2], [13.3, null],
    [14.5, 0.3, 0.64, 0.16, 0.5, 'two', -0.3], [15.2, 0.3, 0.64, 0.16, 0.5, 'two', -0.3], [15.4, 0.86, 0.3, 0.16, 0.5, 'two', -0.3], [16.0, 0.86, 0.3, 0.16, 0.5, 'two', -0.3], [16.1, null],
    [18.0, 0.53, 0.56, 0.16, 0.6], [23.0, 0.53, 0.56, 0.16, 0.6], [23.2, null],
    // eldritch whip: pinch, swing, snap
    [24.4, 0.6, 0.4, 0.16, 0.5, 'pinch'], [25.4, 0.45, 0.42, 0.16, 0.5, 'pinch'], [26.0, 0.7, 0.34, 0.16, 0.5, 'pinch'],
    [26.12, 0.36, 0.48, 0.16, 0.5, 'pinch'], [26.8, 0.55, 0.4, 0.16, 0.5, 'pinch'], [27.4, 0.55, 0.4, 0.16, 0.5, 'pinch'], [27.5, null],
    // singularity: fist held still, sweep it across, then open to release
    [29.0, 0.55, 0.5, 0.16, 0.05], [30.4, 0.55, 0.5, 0.16, 0.05], [31.4, 0.4, 0.42, 0.16, 0.05], [34.0, 0.4, 0.42, 0.16, 0.05],
    [34.2, 0.4, 0.42, 0.16, 0.95], [36.0, 0.4, 0.42, 0.16, 0.95], [36.1, null],
  ];
  const L = [[0, null],
    [0.5, 0.34, 0.56, 0.16, 0.95], [3.0, 0.34, 0.56, 0.16, 0.95], [3.1, null],
    [10.0, 0.4, 0.5, 0.16, 0.5, 'two', 0.2], [13.2, 0.4, 0.5, 0.16, 0.5, 'two', 0.2], [13.3, null],
    [18.0, 0.47, 0.56, 0.16, 0.6], [23.0, 0.47, 0.56, 0.16, 0.6], [23.2, null],
  ];
  return { len: 38, R, L };
}

function ferrumScript() {
  const R = [[0, null],
    [0.3, 0.66, 0.56, 0.16, 0.95], [2.0, 0.66, 0.56, 0.16, 0.95], [2.12, 0.95, 0.4, 0.16, 0.95], [2.5, 0.95, 0.4, 0.16, 0.95], [2.6, null],
    [3.4, 0.6, 0.56, 0.16, 0.95], [4.9, 0.6, 0.56, 0.16, 0.95], [5.05, 0.58, 0.54, 0.27, 0.95], [5.5, 0.58, 0.54, 0.27, 0.95], [5.6, null],
    [6.5, 0.6, 0.55, 0.16, 0.05], [7.7, 0.6, 0.55, 0.16, 0.05], [7.8, null],
    [8.6, 0.5, 0.62, 0.16, 0.5, 'two', -0.2], [9.5, 0.5, 0.62, 0.16, 0.5, 'two', -0.2], [9.63, 0.85, 0.3, 0.16, 0.5, 'two', -0.2], [10.2, 0.85, 0.3, 0.16, 0.5, 'two', -0.2], [10.3, null],
    [12.0, 0.62, 0.34, 0.16, 0.95, null, Math.PI], [15.0, 0.62, 0.34, 0.16, 0.95, null, Math.PI], [15.1, null],
    [16.5, 0.53, 0.58, 0.17, 0.05], [19.0, 0.53, 0.58, 0.17, 0.05], [19.1, null],
    [21.6, 0.66, 0.56, 0.16, 0.95], [22.9, 0.66, 0.56, 0.16, 0.95], [23.02, 0.95, 0.4, 0.16, 0.95], [23.5, 0.95, 0.4, 0.16, 0.95], [23.6, null],
    // unibeam: both palms side by side, then sweep
    [24.5, 0.6, 0.45, 0.16, 0.95], [26.3, 0.6, 0.45, 0.16, 0.95], [27.3, 0.74, 0.4, 0.16, 0.95], [28.4, 0.46, 0.4, 0.16, 0.95], [28.8, 0.46, 0.4, 0.16, 0.95], [28.9, null],
    [31.0, 0.58, 0.5, 0.16, 0.5, 'pinch'], [32.2, 0.58, 0.5, 0.16, 0.5, 'pinch'], [34.0, 0.73, 0.46, 0.16, 0.5, 'pinch'], [37.0, 0.73, 0.4, 0.16, 0.5, 'pinch'], [37.1, null],
  ];
  const L = [[0, null],
    [12.0, 0.38, 0.34, 0.16, 0.95, null, Math.PI], [15.0, 0.38, 0.34, 0.16, 0.95, null, Math.PI], [15.1, null],
    [16.5, 0.47, 0.58, 0.17, 0.05], [19.0, 0.47, 0.58, 0.17, 0.05], [19.1, null],
    [24.5, 0.4, 0.45, 0.16, 0.95], [26.3, 0.4, 0.45, 0.16, 0.95], [27.3, 0.54, 0.4, 0.16, 0.95], [28.4, 0.26, 0.4, 0.16, 0.95], [28.8, 0.26, 0.4, 0.16, 0.95], [28.9, null],
    // holo schematic: pinch with both, pull apart, tilt
    [31.0, 0.42, 0.5, 0.16, 0.5, 'pinch'], [32.2, 0.42, 0.5, 0.16, 0.5, 'pinch'], [34.0, 0.27, 0.54, 0.16, 0.5, 'pinch'], [37.0, 0.27, 0.58, 0.16, 0.5, 'pinch'], [37.1, null],
  ];
  return { len: 39, R, L };
}

function forceScript() {
  const R = [[0, null]], L = [[0, null]];
  const k = (arr, t, x, y, sz, open, pose, roll) => arr.push([t, x, y, sz, open, pose || null, roll || 0]);
  // ignite, then fence with the drones' bolts
  k(R, 0.3, 0.66, 0.66, 0.16, 0.05, 'fist', 1.3);
  k(R, 1.4, 0.66, 0.64, 0.16, 0.05, 'fist', 1.3);
  let t = 1.4;
  for (let i = 0; i < 18; i++) {
    t += 0.42;
    const r = i % 2 ? 0.55 : 2.3;
    k(R, t, 0.6 + (i % 3) * 0.05, 0.6 - (i % 2) * 0.05, 0.16, 0.05, 'fist', r);
    k(R, t + 0.25, 0.6 + (i % 3) * 0.05, 0.6 - (i % 2) * 0.05, 0.16, 0.05, 'fist', r);
    t += 0.25;
  }
  // open to retract, then Force Push at the camera
  k(R, t + 0.3, 0.64, 0.6, 0.16, 0.95); k(R, t + 1.0, 0.64, 0.6, 0.16, 0.95);
  k(R, t + 1.12, 0.62, 0.58, 0.28, 0.95); k(R, t + 1.6, 0.62, 0.58, 0.16, 0.95);
  t += 2.2;
  // grip a drone, drag it, crush it
  k(R, t, 0.62, 0.5, 0.16, 0.5, 'claw'); k(R, t + 0.8, 0.62, 0.5, 0.16, 0.5, 'claw');
  k(R, t + 1.6, 0.45, 0.4, 0.16, 0.5, 'claw'); k(R, t + 2.3, 0.7, 0.45, 0.16, 0.5, 'claw');
  k(R, t + 2.5, 0.7, 0.45, 0.16, 0.05, 'fist'); k(R, t + 3.2, 0.7, 0.45, 0.16, 0.05, 'fist');
  k(R, t + 3.4, 0.7, 0.45, 0.16, 0.95); k(R, t + 3.6, null);
  t += 4.2;
  // grip the rubble and throw it
  k(R, t, 0.66, 0.72, 0.16, 0.5, 'claw'); k(R, t + 1.2, 0.66, 0.62, 0.16, 0.5, 'claw');
  k(R, t + 1.3, 0.66, 0.6, 0.16, 0.5, 'claw'); k(R, t + 1.38, 0.3, 0.45, 0.16, 0.5, 'claw');
  k(R, t + 1.8, 0.3, 0.45, 0.16, 0.95); k(R, t + 2.0, null);
  t += 2.6;
  // levitate, then slam
  for (const [arr, x] of [[R, 0.74], [L, 0.26]]) {
    arr.push([t - 0.01, null]);
    k(arr, t, x, 0.74, 0.16, 0.95); k(arr, t + 1.0, x, 0.74, 0.16, 0.95);
    k(arr, t + 2.6, x, 0.42, 0.16, 0.95); k(arr, t + 3.6, x, 0.42, 0.16, 0.95);
    k(arr, t + 3.75, x, 0.86, 0.16, 0.95); k(arr, t + 4.3, x, 0.86, 0.16, 0.95); arr.push([t + 4.4, null]);
  }
  t += 5.2;
  // lightning from both claws
  for (const [arr, x] of [[R, 0.66], [L, 0.34]]) {
    k(arr, t, x, 0.56, 0.16, 0.5, 'claw'); k(arr, t + 3.2, x + (x > 0.5 ? 0.04 : -0.04), 0.52, 0.16, 0.5, 'claw'); arr.push([t + 3.3, null]);
  }
  t += 3.8;
  // dual red blades
  for (const [arr, x, r] of [[R, 0.68, 1.1], [L, 0.32, 1.1]]) {
    k(arr, t, x, 0.64, 0.16, 0.05, 'fist', r); k(arr, t + 1.2, x, 0.64, 0.16, 0.05, 'fist', r);
    k(arr, t + 1.6, x + (x > 0.5 ? -0.12 : 0.12), 0.58, 0.16, 0.05, 'fist', 0.4); k(arr, t + 2.6, x, 0.6, 0.16, 0.05, 'fist', 1.8);
    k(arr, t + 3.4, x, 0.6, 0.16, 0.05, 'fist', 1.1); arr.push([t + 3.5, null]);
  }
  t += 4.5;
  R.push([t, null]); L.push([t, null]);
  return { len: t, R, L };
}

SCRIPTS.kage = kageScript();
SCRIPTS.force = forceScript();

function nyxScript() {
  const R = [[0, null]], L = [[0, null]];
  const k = (arr, t, x, y, sz, open, pose, roll) => arr.push([t, x, y, sz, open, pose || null, roll || 0]);
  // blue: point and hold, drag it around, then let go
  k(R, 0.5, 0.64, 0.56, 0.16, 0.5, 'point', -0.4); k(R, 1.8, 0.64, 0.56, 0.16, 0.5, 'point', -0.4);
  k(R, 3.0, 0.5, 0.5, 0.16, 0.5, 'point', -0.4); k(R, 3.6, 0.5, 0.5, 0.16, 0.5, 'point', -0.4);
  k(R, 3.8, 0.5, 0.52, 0.16, 0.95); k(R, 4.2, 0.5, 0.52, 0.16, 0.95); R.push([4.3, null]);
  // red: pinch, hold, snap open
  let t = 5.0;
  k(R, t, 0.66, 0.56, 0.16, 0.5, 'pinch', -0.5); k(R, t + 1.2, 0.66, 0.56, 0.16, 0.5, 'pinch', -0.5);
  k(R, t + 1.3, 0.68, 0.54, 0.16, 0.95); k(R, t + 1.8, 0.68, 0.54, 0.16, 0.95); R.push([t + 1.9, null]);
  t += 3.2;
  // hollow purple: blue in the left, red in the right, bring them in, fling
  k(L, t, 0.3, 0.52, 0.16, 0.5, 'point', 0.5); k(L, t + 1.4, 0.3, 0.52, 0.16, 0.5, 'point', 0.5);
  k(R, t + 0.3, 0.7, 0.52, 0.16, 0.5, 'pinch', -0.5); k(R, t + 1.4, 0.7, 0.52, 0.16, 0.5, 'pinch', -0.5);
  k(L, t + 2.4, 0.46, 0.52, 0.16, 0.5, 'point', 0.5); k(R, t + 2.4, 0.54, 0.52, 0.16, 0.5, 'pinch', -0.5);
  k(L, t + 4.0, 0.46, 0.52, 0.16, 0.5, 'point', 0.5); k(R, t + 4.0, 0.54, 0.52, 0.16, 0.5, 'pinch', -0.5);
  k(R, t + 4.08, 0.9, 0.5, 0.16, 0.9); k(R, t + 4.6, 0.9, 0.5, 0.16, 0.9); R.push([t + 4.7, null]);
  L.push([t + 4.1, null]);
  t += 6.4;
  // domain expansion: crossed fingers held up
  k(R, t, 0.6, 0.44, 0.17, 0.5, 'cross', -0.15); k(R, t + 2.2, 0.6, 0.44, 0.17, 0.5, 'cross', -0.15); R.push([t + 2.3, null]);
  t += 11;
  R.push([t, null]); L.push([t, null]);
  return { len: t, R, L };
}
SCRIPTS.nyx = nyxScript();

function emberScript() {
  const R = [[0, null]], L = [[0, null]];
  const k = (arr, t, x, y, sz, open, pose, roll) => arr.push([t, x, y, sz, open, pose || null, roll || 0]);
  // flame alchemy: set the snap, pointing up-left, then snap
  for (const [t0, roll] of [[0.4, -0.5], [2.4, -0.9]]) {
    k(R, t0, 0.68, 0.6, 0.16, 0.5, 'snapset', roll); k(R, t0 + 0.9, 0.68, 0.6, 0.16, 0.5, 'snapset', roll);
    k(R, t0 + 0.95, 0.68, 0.6, 0.16, 0.5, 'snapped', roll); k(R, t0 + 1.6, 0.68, 0.6, 0.16, 0.5, 'snapped', roll);
  }
  R.push([4.1, null]);
  // fire fist: punch at the camera
  k(R, 4.6, 0.6, 0.6, 0.15, 0.05, 'fist'); k(R, 5.4, 0.6, 0.6, 0.15, 0.05, 'fist');
  k(R, 5.52, 0.56, 0.56, 0.29, 0.05, 'fist'); k(R, 6.2, 0.56, 0.56, 0.29, 0.05, 'fist'); R.push([6.3, null]);
  // palm orb: cup, charge, flick
  k(R, 6.8, 0.7, 0.64, 0.16, 0.45); k(R, 8.7, 0.68, 0.62, 0.16, 0.45); k(R, 8.84, 0.98, 0.48, 0.16, 0.5); R.push([9.0, null]);
  // dragon fire and fire tornado
  k(R, 9.6, 0.74, 0.62, 0.16, 0.5, 'point', -1.1); k(R, 10.2, 0.74, 0.62, 0.16, 0.5, 'point', -1.1);
  k(R, 11.8, 0.72, 0.5, 0.16, 0.5, 'point', -0.5); R.push([12.0, null]);
  k(R, 12.8, 0.5, 0.42, 0.16, 0.5, 'two'); k(R, 14.0, 0.5, 0.42, 0.16, 0.5, 'two'); k(R, 15.2, 0.7, 0.42, 0.16, 0.5, 'two'); k(R, 16.6, 0.3, 0.4, 0.16, 0.5, 'two'); R.push([16.8, null]);
  R.push([18, null]); L.push([18, null]);
  return { len: 18, R, L };
}
SCRIPTS.ember = emberScript();
SCRIPTS.mystral = mystralScript();
SCRIPTS.ferrum = ferrumScript();

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
    // matching silhouette mask for the body aura
    const m = document.createElement('canvas');
    m.width = 320; m.height = 180;
    const mg = m.getContext('2d');
    mg.fillStyle = '#000'; mg.fillRect(0, 0, 320, 180);
    mg.scale(0.25, 0.25);
    mg.fillStyle = '#fff';
    mg.beginPath(); mg.arc(640, 330, 72, 0, Math.PI * 2); mg.fill();
    mg.fillRect(612, 390, 56, 40);
    mg.beginPath(); mg.ellipse(640, 600, 270, 190, 0, Math.PI, 0); mg.fill();
    mg.fillRect(370, 600, 540, 130);
    this.mask = m;
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
