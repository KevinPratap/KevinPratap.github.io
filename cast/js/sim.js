// Demo mode: scripted synthetic hands (and a painted backdrop) drive the real
// gesture engine, so the effects can be previewed without a camera.

const FINGERS = [
  [5, -0.3, -0.93, -0.14, [0.42, 0.25, 0.2]],
  [9, -0.04, -1.0, 0.0, [0.46, 0.28, 0.21]],
  [13, 0.2, -0.95, 0.12, [0.43, 0.26, 0.2]],
  [17, 0.4, -0.84, 0.26, [0.33, 0.2, 0.18]],
];

// Hand model in units of wrist-to-knuckle length. y is down, -z faces the camera.
const POSES = { point: [1, 0.02, 0.02, 0.02], two: [1, 1, 0.02, 0.02], pinch: [0.55, 0.85, 0.85, 0.85] };

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
      [19.0, 0.6, 0.55, 0.16, 0.5, 'two'], [20.1, 0.6, 0.55, 0.16, 0.5, 'two'], [20.3, null],
      [20.8, 0.53, 0.62, 0.16, 0.55], [23.2, 0.53, 0.62, 0.16, 0.55], [23.35, 0.52, 0.6, 0.27, 0.55], [24.8, 0.52, 0.6, 0.27, 0.55], [25.0, null],
      [26.2, 0.5, 0.55, 0.16, 0.5, 'point'], [28.0, 0.5, 0.55, 0.16, 0.5, 'point'], [28.2, 0.9, 0.4, 0.16, 0.5, 'point'], [28.6, null], [29.4, null]],
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
  const out = { len: 30, R: [[0, null]], L: [[0, null]] };
  let t = 1.0;
  t = signChain(['two', 'fist', 'clap'], t, out) + 2.6;
  t = signChain(['open', 'fist', 'point'], t, out) + 2.2;
  t = signChain(['point', 'two', 'open'], t, out) + 2.2;
  t = signChain(['fist', 'point', 'two', 'clap'], t, out) + 3.0;
  t = signChain(['fist', 'two', 'point', 'open', 'clap'], t, out) + 5.0;
  // the clone sign: two fingers up on both hands, crossed together
  out.R.push([t, 0.53, 0.55, 0.16, 0.5, 'two', -0.5], [t + 1.0, 0.53, 0.55, 0.16, 0.5, 'two', -0.5], [t + 1.1, null]);
  out.L.push([t, 0.47, 0.55, 0.16, 0.5, 'two', 0.5], [t + 1.0, 0.47, 0.55, 0.16, 0.5, 'two', 0.5], [t + 1.1, null]);
  t += 2.2;
  // windmill shuriken: open palm held, flick, then catch it on its way back
  out.R.push([t, 0.62, 0.56, 0.16, 0.95], [t + 1.5, 0.62, 0.56, 0.16, 0.95], [t + 1.58, 0.85, 0.36, 0.16, 0.95], [t + 4.6, 0.85, 0.36, 0.16, 0.95], [t + 4.7, null]);
  // substitution: clap, then fist
  t += 6.0;
  t = signChain(['clap', 'fist'], t, out);
  out.len = Math.ceil(t + 4.5);
  out.R.push([out.len, null]); out.L.push([out.len, null]);
  return out;
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
    [0.3, 0.66, 0.56, 0.16, 0.95], [3.0, 0.66, 0.56, 0.16, 0.95], [3.14, 0.64, 0.54, 0.27, 0.95], [3.5, 0.64, 0.54, 0.27, 0.95], [3.6, null],
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

SCRIPTS.kage = kageScript();
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
