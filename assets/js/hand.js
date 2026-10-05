// A 21-point hand, the same topology MediaPipe returns, cycling through the
// signs Cast actually reads. Each pose drives its own small effect.

const FINGERS = [
  // mcp x, mcp y, splay, segment lengths
  { x: -0.37, y: -0.90, s: -0.15, L: [0.40, 0.24, 0.19] }, // index
  { x: -0.12, y: -0.96, s: -0.04, L: [0.45, 0.28, 0.20] }, // middle
  { x: 0.13, y: -0.92, s: 0.06, L: [0.42, 0.26, 0.19] },   // ring
  { x: 0.35, y: -0.80, s: 0.18, L: [0.32, 0.20, 0.17] },   // pinky
];
const THUMB = { x: -0.30, y: -0.26, L: [0.30, 0.26, 0.22] };

export const POSES = [
  { id: 'hilt', c: [1, 1, 1, 1, 0.85], spread: 0, glyph: '念', sign: 'Grip a hilt', move: 'A blade ignites', hero: 'Orin' },
  { id: 'push', c: [0, 0, 0, 0, 0], spread: 0.12, glyph: '念', sign: 'Open palm, shove', move: 'Push', hero: 'Orin' },
  { id: 'point', c: [0, 1, 1, 1, 0.75], spread: 0, glyph: '無', sign: 'Point', move: 'Blue', hero: 'Nyx' },
  { id: 'claw', c: [0.62, 0.6, 0.62, 0.66, 0.4], spread: 0.16, glyph: '念', sign: 'Claw a hand', move: 'Grip, then crush', hero: 'Orin' },
  { id: 'snap', c: [0.2, 0.52, 0.88, 0.92, 0.62], spread: 0.02, glyph: '炎', sign: 'Finger snap', move: 'Flame alchemy', hero: 'Ember' },
];

const BONE = 'rgba(235,231,222,';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createHand(canvas, { onPose } = {}) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, visible = false, raf = 0;
  let idx = 0, from = POSES[0], to = POSES[0], tStart = 0, holdStart = 0;
  const HOLD = 2900, MORPH = 650;
  const parts = [];

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = Math.round(r.width * dpr);
    h = canvas.height = Math.round(r.height * dpr);
  }

  function pose(t) {
    const k = ease(Math.min(1, t));
    const c = from.c.map((v, i) => v + (to.c[i] - v) * k);
    const spread = from.spread + (to.spread - from.spread) * k;
    return { c, spread };
  }

  // returns 21 projected points + per-point depth
  function solve(p, time) {
    const pts = [];
    const yaw = Math.sin(time * 0.0007) * 0.28 + 0.12;
    const roll = Math.sin(time * 0.0005 + 1) * 0.07;
    const bob = Math.sin(time * 0.0011) * 0.025;
    const push = (to.id === 'push' ? 0.12 : 0) * Math.max(0, Math.sin(time * 0.004));
    const proj = (x, y, z) => {
      // yaw around vertical axis, roll in screen plane
      const cx = x * Math.cos(yaw) + z * Math.sin(yaw);
      const cz = -x * Math.sin(yaw) + z * Math.cos(yaw) + push;
      const rx = cx * Math.cos(roll) - y * Math.sin(roll);
      const ry = cx * Math.sin(roll) + y * Math.cos(roll) + bob;
      const s = 2.6 / (2.6 - cz);
      return { x: rx * s, y: ry * s, z: cz };
    };
    pts.push(proj(0, 0, 0)); // 0 wrist
    // thumb 1-4: swings across the palm and towards camera as it curls
    {
      const k = p.c[4];
      let a = -1.05 + k * 1.05;
      let x = THUMB.x, y = THUMB.y, z = 0.02;
      pts.push(proj(x, y, z));
      THUMB.L.forEach((L, j) => {
        a += k * 0.42;
        const lift = k * (0.35 + j * 0.25);
        x += Math.sin(a) * L * Math.cos(lift);
        y += -Math.cos(a) * L * Math.cos(lift);
        z += L * Math.sin(lift);
        pts.push(proj(x, y, z));
      });
    }
    FINGERS.forEach((f, i) => {
      const k = p.c[i];
      const sp = f.s * (1 + p.spread * 6);
      const dx = Math.sin(sp), dy = -Math.cos(sp);
      let x = f.x, y = f.y, z = 0, a = 0;
      pts.push(proj(x, y, z));
      const bend = [1.5, 1.75, 1.25];
      f.L.forEach((L, j) => {
        a += k * bend[j];
        x += dx * L * Math.cos(a);
        y += dy * L * Math.cos(a);
        z += L * Math.sin(a);
        pts.push(proj(x, y, z));
      });
    });
    return pts;
  }

  const EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
  ];

  function spawn(x, y, vx, vy, life, size) { if (parts.length < 420) parts.push({ x, y, vx, vy, life, max: life, size }); }

  function draw(time) {
    raf = requestAnimationFrame(draw);
    if (!visible) return;
    const since = time - tStart;
    if (since > HOLD + MORPH) {
      idx = (idx + 1) % POSES.length;
      from = to; to = POSES[idx]; tStart = time;
      onPose && onPose(to);
    }
    const p = pose(since / MORPH);
    const pts = solve(p, time);

    ctx.clearRect(0, 0, w, h);
    const S = Math.min(w, h) * 0.36;
    const ox = w * 0.5, oy = h * 0.78;
    const X = (q) => ox + q.x * S, Y = (q) => oy + q.y * S;

    // tracking frame
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    pts.forEach((q) => { minx = Math.min(minx, X(q)); maxx = Math.max(maxx, X(q)); miny = Math.min(miny, Y(q)); maxy = Math.max(maxy, Y(q)); });
    const pad = 18 * dpr;
    minx -= pad; miny -= pad; maxx += pad; maxy += pad;
    ctx.strokeStyle = BONE + '0.35)'; ctx.lineWidth = 1 * dpr;
    const cl = 14 * dpr;
    ctx.beginPath();
    [[minx, miny, 1, 1], [maxx, miny, -1, 1], [minx, maxy, 1, -1], [maxx, maxy, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.moveTo(x + sx * cl, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * cl);
    });
    ctx.stroke();
    ctx.fillStyle = BONE + '0.5)';
    ctx.font = `${10.5 * dpr}px "Geist Mono", monospace`;
    ctx.fillText(`R  21 pts  ${to.id.toUpperCase()}`, minx, miny - 8 * dpr);

    const settled = since > MORPH;
    const palm = { x: (X(pts[0]) + X(pts[5]) + X(pts[17])) / 3, y: (Y(pts[0]) + Y(pts[9]) * 2) / 3 };

    // effects, behind the skeleton
    if (settled) {
      const life = Math.min(1, (since - MORPH) / 400);
      if (to.id === 'hilt') {
        const bx = palm.x, by = palm.y - 10 * dpr;
        const len = S * 1.9 * ease(life);
        const g = ctx.createLinearGradient(bx, by, bx, by - len);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0.6)');
        ctx.save();
        ctx.shadowColor = 'rgba(200,210,255,0.9)'; ctx.shadowBlur = 30 * dpr;
        ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.lineWidth = (7 + Math.sin(time * 0.05) * 0.8) * dpr;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.sin(time * 0.002) * 6 * dpr, by - len); ctx.stroke();
        ctx.restore();
        if (Math.random() < 0.5) spawn(bx, by - Math.random() * len, (Math.random() - 0.5) * 1.2, -Math.random(), 30, 1.4);
      } else if (to.id === 'push') {
        const k = ((time * 0.0012) % 1);
        for (let r = 0; r < 3; r++) {
          const kk = (k + r / 3) % 1;
          ctx.strokeStyle = BONE + (0.5 * (1 - kk)).toFixed(3) + ')';
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath(); ctx.ellipse(palm.x, palm.y - S * 0.35, S * (0.3 + kk * 1.1), S * (0.3 + kk * 1.1) * 0.85, 0, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (to.id === 'point') {
        const tip = { x: X(pts[8]), y: Y(pts[8]) - 26 * dpr };
        const rr = (16 + Math.sin(time * 0.01) * 2) * dpr * ease(life);
        const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, rr * 3.2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(160,180,255,0.75)'); g.addColorStop(1, 'rgba(90,110,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip.x, tip.y, rr * 3.2, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2, d = S * (0.5 + Math.random() * 0.5);
          // particles fall inward: the orb pulls
          spawn(tip.x + Math.cos(a) * d, tip.y + Math.sin(a) * d, -Math.cos(a) * d / 40, -Math.sin(a) * d / 40, 40, 1.3);
        }
      } else if (to.id === 'claw') {
        ctx.strokeStyle = BONE + '0.75)'; ctx.lineWidth = 1.2 * dpr;
        const tips = [8, 12, 16, 20, 4].map((i) => ({ x: X(pts[i]), y: Y(pts[i]) }));
        const c = { x: palm.x, y: palm.y - S * 0.65 };
        tips.forEach((tp) => {
          if (Math.random() < 0.6) {
            ctx.beginPath(); ctx.moveTo(tp.x, tp.y);
            for (let s = 1; s <= 5; s++) {
              const k = s / 5;
              ctx.lineTo(tp.x + (c.x - tp.x) * k + (Math.random() - 0.5) * 14 * dpr, tp.y + (c.y - tp.y) * k + (Math.random() - 0.5) * 14 * dpr);
            }
            ctx.stroke();
          }
        });
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(c.x, c.y, 3 * dpr, 0, Math.PI * 2); ctx.fill();
      } else if (to.id === 'snap') {
        const pp = { x: (X(pts[4]) + X(pts[12])) / 2, y: (Y(pts[4]) + Y(pts[12])) / 2 };
        if (((time * 0.0012) % 1) < 0.04) {
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
            spawn(pp.x, pp.y, Math.cos(a) * v, Math.sin(a) * v - 1.5, 38 + Math.random() * 20, 2);
          }
          onPose && onPose(to, true);
        }
        if (Math.random() < 0.3) spawn(pp.x, pp.y, (Math.random() - 0.5), -1 - Math.random(), 30, 1.2);
      }
    }

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.x += q.vx * dpr; q.y += q.vy * dpr; q.vy -= 0.02; q.vx *= 0.98; q.life--;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      const a = q.life / q.max;
      ctx.fillStyle = `rgba(255,255,255,${(a * 0.9).toFixed(3)})`;
      ctx.fillRect(q.x, q.y, q.size * dpr, q.size * dpr);
    }

    // skeleton: nearer bones are brighter and thicker
    EDGES.forEach(([a, b]) => {
      const za = (pts[a].z + pts[b].z) / 2;
      ctx.strokeStyle = BONE + (0.55 + za * 0.8).toFixed(3) + ')';
      ctx.lineWidth = (1.6 + za * 3) * dpr;
      ctx.beginPath(); ctx.moveTo(X(pts[a]), Y(pts[a])); ctx.lineTo(X(pts[b]), Y(pts[b])); ctx.stroke();
    });
    pts.forEach((q, i) => {
      const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const r = (tip ? 4.2 : 3) * dpr * (1 + q.z * 0.6);
      ctx.fillStyle = '#0c0c0b';
      ctx.beginPath(); ctx.arc(X(q), Y(q), r + 1.5 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tip ? '#ffffff' : BONE + '0.95)';
      ctx.beginPath(); ctx.arc(X(q), Y(q), r, 0, Math.PI * 2); ctx.fill();
    });
  }

  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.05 });
  io.observe(canvas);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  resize();
  tStart = performance.now(); holdStart = tStart;
  raf = requestAnimationFrame(draw);
  return { get pose() { return to; } };
}
