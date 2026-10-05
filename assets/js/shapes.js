// Shape bakers. Each returns { pos, col } in local space: x and y in -0.5..0.5
// across the anchor box (y up), z for depth. The engine places and scales them.

const SPEC = [[1.0, 0.30, 0.10], [1.0, 0.18, 0.53], [0.42, 0.24, 1.0], [0.09, 0.88, 1.0]];
export function spectrum(t) {
  t = Math.min(1, Math.max(0, t)) * 3;
  const i = Math.min(2, Math.floor(t)), f = t - i;
  const a = SPEC[i], b = SPEC[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const alloc = (N) => ({ pos: new Float32Array(N * 3), col: new Float32Array(N * 3) });
const put = (s, i, x, y, z, r, g, b) => { s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z; s.col[i * 3] = r; s.col[i * 3 + 1] = g; s.col[i * 3 + 2] = b; };

// a loose cloud everywhere, used for the first frame before anything has formed
export function chaos(N) {
  const s = alloc(N);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 0.55 + Math.random() * 0.9;
    const q = Math.sqrt(1 - u * u);
    const c = spectrum(Math.random());
    put(s, i, Math.cos(th) * q * r, u * r * 0.7, Math.sin(th) * q * r, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
  }
  return s;
}

// real type, sampled from the element's own layout so the particles sit exactly on it
export function text(N, el) {
  const host = el.getBoundingClientRect();
  const S = 2;
  const W = Math.max(2, Math.ceil(host.width * S)), H = Math.max(2, Math.ceil(host.height * S));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d', { willReadFrequently: true });
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || size;
  x.font = `${cs.fontWeight} ${size * S}px ${cs.fontFamily}`;
  if ('letterSpacing' in x) x.letterSpacing = `${(parseFloat(cs.letterSpacing) || 0) * S}px`;
  x.fillStyle = '#fff';
  const words = el.querySelectorAll('.w');
  (words.length ? words : [el]).forEach((w) => {
    // measure the glyphs, not the box: a block-level word box spans the whole line
    const range = document.createRange(); range.selectNodeContents(w);
    const r = range.getBoundingClientRect();
    const str = w.textContent;
    const m = x.measureText(str);
    const A = m.fontBoundingBoxAscent ?? size * S * 0.92, D = m.fontBoundingBoxDescent ?? size * S * 0.24;
    const lineTop = (r.top - host.top) * S + (r.height * S - lh * S) / 2;
    x.fillText(str, (r.left - host.left) * S, lineTop + (lh * S - (A + D)) / 2 + A);
  });
  const data = x.getImageData(0, 0, W, H).data;
  const cand = [];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (data[(yy * W + xx) * 4 + 3] > 140) cand.push(xx, yy);
  const n = cand.length / 2;
  const s = alloc(N);
  for (let i = 0; i < N; i++) {
    const k = (Math.random() * n) | 0;
    const px = (cand[k * 2] + Math.random()) / W, py = (cand[k * 2 + 1] + Math.random()) / H;
    const c = spectrum(px * 0.95 + py * 0.1);
    const lift = 0.75 + Math.random() * 0.25;
    put(s, i, px - 0.5, 0.5 - py, (Math.random() - 0.5) * 0.01, 0.55 + c[0] * 0.45 * lift, 0.55 + c[1] * 0.45 * lift, 0.55 + c[2] * 0.45 * lift);
  }
  return s;
}

// screenshots as a grid of their own pixels. parts: [{ img, x, y, w, h }] as fractions of the anchor box
export function images(N, parts) {
  const s = alloc(N);
  const area = parts.reduce((a, p) => a + p.w * p.h, 0);
  let i = 0, cellFrac = 1;
  parts.forEach((p, pi) => {
    const share = pi === parts.length - 1 ? N - i : Math.round(N * (p.w * p.h) / area);
    const asp = (p.w * (p.boxAspect || 1)) / p.h; // width/height of this part on screen
    const cols = Math.max(1, Math.round(Math.sqrt(share * asp)));
    const rows = Math.max(1, Math.floor(share / cols));
    if (pi === 0) cellFrac = p.w / cols;
    const cv = document.createElement('canvas'); cv.width = cols; cv.height = rows;
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(p.img, 0, 0, cols, rows);
    const d = x.getImageData(0, 0, cols, rows).data;
    for (let k = 0; k < share && i < N; k++, i++) {
      let c = k, r;
      if (k < cols * rows) { r = Math.floor(c / cols); c = c % cols; }
      else { r = (Math.random() * rows) | 0; c = (Math.random() * cols) | 0; }
      const o = (r * cols + c) * 4;
      put(s, i,
        p.x + (c + 0.5) / cols * p.w - 0.5,
        0.5 - (p.y + (r + 0.5) / rows * p.h),
        0,
        d[o] / 255, d[o + 1] / 255, d[o + 2] / 255);
    }
  });
  s.cellFrac = cellFrac;
  return s;
}

// a neural constellation: nodes, the links between them, and dust
export function constellation(N) {
  const s = alloc(N);
  const nodes = [];
  for (let k = 0; k < 96; k++) {
    let x, y, z;
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
    nodes.push([x * 0.46, y * 0.46, z * 0.46]);
  }
  const links = [];
  nodes.forEach((a, ai) => {
    const near = nodes.map((b, bi) => [bi, (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2]).sort((p, q) => p[1] - q[1]).slice(1, 4);
    near.forEach(([bi]) => { if (ai < bi || !links.some((l) => l[0] === bi && l[1] === ai)) links.push([ai, bi]); });
  });
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    let p, c;
    if (r < 0.3) {
      const n = nodes[(Math.random() * nodes.length) | 0];
      p = [n[0] + gauss() * 0.009, n[1] + gauss() * 0.009, n[2] + gauss() * 0.009];
      c = [0.85, 0.95, 1];
    } else if (r < 0.88) {
      const l = links[(Math.random() * links.length) | 0], a = nodes[l[0]], b = nodes[l[1]], t = Math.random();
      p = [a[0] + (b[0] - a[0]) * t + gauss() * 0.002, a[1] + (b[1] - a[1]) * t + gauss() * 0.002, a[2] + (b[2] - a[2]) * t + gauss() * 0.002];
      c = spectrum(0.45 + (p[1] + 0.5) * 0.55);
    } else {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 0.3 + Math.random() * 0.35, q = Math.sqrt(1 - u * u);
      p = [Math.cos(th) * q * rr, u * rr, Math.sin(th) * q * rr];
      c = spectrum(0.6).map((v) => v * 0.35);
    }
    put(s, i, p[0], p[1], p[2], c[0], c[1], c[2]);
  }
  return s;
}

// a data pipeline: a ribbon of flowing particles through four stations
export function ribbon(N, rnd) {
  const s = alloc(N);
  const stations = [-0.36, -0.12, 0.12, 0.36];
  for (let i = 0; i < N; i++) {
    const flowing = rnd[i * 4 + 3] < 0.8;
    if (flowing) {
      const x = Math.random() - 0.5;
      const c = spectrum(x + 0.5);
      // y is stored as an offset from the wave; the shader adds the wave
      put(s, i, x, gauss() * 0.022, gauss() * 0.03, c[0], c[1], c[2]);
    } else {
      const sx = stations[(Math.random() * 4) | 0];
      const x = sx + gauss() * 0.012;
      put(s, i, x, gauss() * 0.018, gauss() * 0.02, 0.95, 0.97, 1);
    }
  }
  return s;
}

// an open hand, 21 joints like MediaPipe returns, drawn as bones of light
export function hand(N) {
  const F = [
    { x: -0.37, y: 0.90, s: -0.17, L: [0.40, 0.24, 0.19], c: 0.08 },
    { x: -0.12, y: 0.96, s: -0.05, L: [0.45, 0.28, 0.20], c: 0.05 },
    { x: 0.13, y: 0.92, s: 0.07, L: [0.42, 0.26, 0.19], c: 0.1 },
    { x: 0.35, y: 0.80, s: 0.2, L: [0.32, 0.20, 0.17], c: 0.16 },
  ];
  const joints = [[0, 0, 0]];
  const bones = [];
  // thumb
  {
    let a = -1.0, x = -0.30, y = 0.26, z = 0.05;
    joints.push([x, y, z]); bones.push([0, joints.length - 1]);
    [0.30, 0.26, 0.22].forEach((L) => {
      a += 0.18;
      const px = x, py = y, pz = z;
      x += Math.sin(a) * L; y += Math.cos(a) * L; z += L * 0.15;
      joints.push([x, y, z]); bones.push([joints.length - 2, joints.length - 1]);
      void px; void py; void pz;
    });
  }
  const mcp = [];
  F.forEach((f) => {
    let x = f.x, y = f.y, z = 0, a = 0;
    joints.push([x, y, z]); mcp.push(joints.length - 1);
    bones.push([0, joints.length - 1]);
    f.L.forEach((L, j) => {
      a += f.c * (1 + j * 0.5);
      x += Math.sin(f.s) * L * Math.cos(a); y += Math.cos(f.s) * L * Math.cos(a); z += L * Math.sin(a);
      joints.push([x, y, z]); bones.push([joints.length - 2, joints.length - 1]);
    });
  });
  for (let k = 0; k < mcp.length - 1; k++) bones.push([mcp[k], mcp[k + 1]]);
  // normalise into the box
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  joints.forEach(([x, y]) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); });
  const sc = 0.92 / Math.max(maxx - minx, maxy - miny), cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const J = joints.map(([x, y, z]) => [(x - cx) * sc, (y - cy) * sc, z * sc]);
  const palm = [J[0], J[mcp[0]], J[mcp[3]]];
  const s = alloc(N);
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    let p, c;
    if (r < 0.18) {
      const j = J[(Math.random() * J.length) | 0];
      p = [j[0] + gauss() * 0.012, j[1] + gauss() * 0.012, j[2] + gauss() * 0.012];
      c = [1, 1, 1];
    } else if (r < 0.93) {
      const [ia, ib] = bones[(Math.random() * bones.length) | 0], a = J[ia], b = J[ib], t = Math.random();
      p = [a[0] + (b[0] - a[0]) * t + gauss() * 0.006, a[1] + (b[1] - a[1]) * t + gauss() * 0.006, a[2] + (b[2] - a[2]) * t + gauss() * 0.006];
      c = spectrum(0.05 + (0.5 - p[1]) * 0.6);
    } else {
      // a faint web across the palm
      let u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const a = palm[0], b = palm[1], cc = palm[2];
      p = [a[0] + (b[0] - a[0]) * u + (cc[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (cc[1] - a[1]) * v, gauss() * 0.01];
      c = spectrum(0.3).map((x) => x * 0.14);
    }
    put(s, i, p[0], p[1], p[2], c[0], c[1], c[2]);
  }
  return s;
}

// a slow galaxy behind the long list
export function galaxy(N) {
  const s = alloc(N);
  for (let i = 0; i < N; i++) {
    const arm = (Math.random() * 3) | 0;
    const r = Math.pow(Math.random(), 0.7) * 0.5;
    const th = arm * (Math.PI * 2 / 3) + r * 9 + gauss() * 0.25 * (0.3 + r);
    const c = spectrum(0.35 + r * 1.3);
    const dim = 0.35 + (1 - r * 2) * 0.4;
    put(s, i, Math.cos(th) * r, gauss() * 0.012 * (1 - r), Math.sin(th) * r, c[0] * dim, c[1] * dim, c[2] * dim);
  }
  return s;
}

// a ring around the email address
export function ring(N) {
  const s = alloc(N);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2;
    const band = Math.random() < 0.85;
    const R = band ? 0.44 + gauss() * 0.012 : 0.3 + Math.random() * 0.3;
    const y = band ? gauss() * 0.01 : gauss() * 0.06;
    const t = (Math.sin(th * 2) + 1) / 2;
    const c = band ? [0.83 + 0.17 * t, 1, 0.23 + 0.77 * t] : [0.4, 0.45, 0.3];
    put(s, i, Math.cos(th) * R, y, Math.sin(th) * R, c[0], c[1], c[2]);
  }
  return s;
}
