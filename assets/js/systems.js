// Live system diagrams. Packets move through real pipelines Kevin built;
// gates reject some of them, the way the real quality gates do.

const C = ['#ff4d1a', '#ff2e88', '#8a63ff', '#18e0ff', '#d4ff3a'];

export const SYSTEMS = {
  lead: {
    title: 'Lead pipeline',
    desc: 'Scrape local businesses, generate a site per business, deploy it, then outreach with rate limiting and an audit pass before anything sends. It shipped 290+ sites.',
    stack: 'Python · Playwright · WhatsApp API',
    nodes: [
      { id: 'scrape', t: 'Scrape', s: 'Playwright', x: 0.1, y: 0.3 },
      { id: 'gen', t: 'Generate', s: 'site per business', x: 0.36, y: 0.3 },
      { id: 'deploy', t: 'Deploy', s: '290+ live', x: 0.64, y: 0.3 },
      { id: 'audit', t: 'Audit pass', s: 'gate', x: 0.9, y: 0.5, gate: 0.18 },
      { id: 'rate', t: 'Rate limiter', s: 'queue', x: 0.64, y: 0.72 },
      { id: 'send', t: 'Outreach', s: 'WhatsApp API', x: 0.36, y: 0.72 },
    ],
    edges: [['scrape', 'gen'], ['gen', 'deploy'], ['deploy', 'audit'], ['audit', 'rate'], ['rate', 'send']],
    back: { audit: 'gen' },
  },
  agents: {
    title: 'Agentic workflows',
    desc: 'Production multi agent architecture. A strategy agent hands work to workers that call MCP tools on a cron schedule, and quality gates sit between stages so weak output goes back instead of forward.',
    stack: 'Python · MCP · orchestration',
    nodes: [
      { id: 'cron', t: 'Cron', s: 'schedule', x: 0.08, y: 0.5 },
      { id: 'strat', t: 'Strategy agent', s: 'plans the run', x: 0.3, y: 0.5 },
      { id: 'w1', t: 'Worker', s: 'MCP tools', x: 0.54, y: 0.2 },
      { id: 'w2', t: 'Worker', s: 'MCP tools', x: 0.54, y: 0.5 },
      { id: 'w3', t: 'Worker', s: 'MCP tools', x: 0.54, y: 0.8 },
      { id: 'gate', t: 'Quality gate', s: 'pass or return', x: 0.76, y: 0.5, gate: 0.28 },
      { id: 'out', t: 'Output', s: 'shipped', x: 0.93, y: 0.5 },
    ],
    edges: [['cron', 'strat'], ['strat', 'w1'], ['strat', 'w2'], ['strat', 'w3'], ['w1', 'gate'], ['w2', 'gate'], ['w3', 'gate'], ['gate', 'out']],
    back: { gate: 'strat' },
  },
  nebula: {
    title: 'Nebula',
    desc: 'Real time interview assistant. Speech is transcribed offline through Whisper, questions are picked out of the stream, and answers land in a frameless overlay on top of the call.',
    stack: 'Electron · Python · Whisper',
    nodes: [
      { id: 'mic', t: 'Audio in', s: 'system + mic', x: 0.1, y: 0.5 },
      { id: 'whisper', t: 'Whisper', s: 'offline transcription', x: 0.32, y: 0.3 },
      { id: 'detect', t: 'Question detect', s: 'from the stream', x: 0.54, y: 0.5 },
      { id: 'model', t: 'Model', s: 'answer draft', x: 0.74, y: 0.3 },
      { id: 'overlay', t: 'Overlay', s: 'frameless window', x: 0.9, y: 0.62 },
    ],
    edges: [['mic', 'whisper'], ['whisper', 'detect'], ['detect', 'model'], ['model', 'overlay']],
    back: {},
  },
  cast: {
    title: 'Cast',
    desc: 'Hand tracking in the browser. MediaPipe landmarks become per finger state, poses and two hand seals, and each sign drives physics and screen space effects. Nothing leaves your device.',
    stack: 'MediaPipe · Three.js · ES modules',
    nodes: [
      { id: 'cam', t: 'Webcam', s: 'on device', x: 0.08, y: 0.32 },
      { id: 'mp', t: 'MediaPipe', s: '21 points per hand', x: 0.3, y: 0.32 },
      { id: 'track', t: 'Tracking', s: 'fingers, speed, flick', x: 0.52, y: 0.32 },
      { id: 'signs', t: 'Signs', s: 'poses and seals', x: 0.74, y: 0.32, gate: 0.12 },
      { id: 'engine', t: 'Hero engine', s: 'eight heroes', x: 0.86, y: 0.7 },
      { id: 'phys', t: 'Physics', s: 'debris, wells, wind', x: 0.6, y: 0.72 },
      { id: 'render', t: 'Render', s: 'bloom, lensing', x: 0.34, y: 0.72 },
    ],
    edges: [['cam', 'mp'], ['mp', 'track'], ['track', 'signs'], ['signs', 'engine'], ['engine', 'phys'], ['phys', 'render']],
    back: { signs: 'track' },
  },
};

export function createSystems(canvas, { onArrive, onReject } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, visible = false, portrait = false;
  let sys = null, nodes = [], edges = [], packets = [], appear = 0, count = 0, lastSpawn = 0, lastT = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(r.width * dpr);
    H = canvas.height = Math.round(r.height * dpr);
    portrait = r.width / r.height < 0.95;
    layout();
  }

  function layout() {
    if (!sys) return;
    const padX = W * 0.1, padY = H * 0.14;
    nodes.forEach((n) => {
      const x = portrait ? n.def.y : n.def.x, y = portrait ? n.def.x : n.def.y;
      n.x = padX + x * (W - padX * 2);
      n.y = padY + y * (H - padY * 2);
    });
  }

  function set(key) {
    sys = SYSTEMS[key];
    nodes = sys.nodes.map((d, i) => ({ def: d, id: d.id, c: C[i % C.length], pulse: 0, rej: 0, x: 0, y: 0 }));
    const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
    edges = sys.edges.map(([a, b]) => ({ a: by[a], b: by[b] }));
    nodes.forEach((n) => (n.out = edges.filter((e) => e.a === n)));
    nodes.forEach((n) => (n.backTo = sys.back[n.id] ? by[sys.back[n.id]] : null));
    packets = []; appear = 0; count = 0;
    layout();
    return sys;
  }

  // a quadratic curve that bows away from the straight line
  function curve(a, b, k = 0.18) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    return { cx: mx - dy * k, cy: my + dx * k };
  }
  function at(a, b, t, k) {
    const { cx, cy } = curve(a, b, k);
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y };
  }

  function spawn() {
    const src = nodes.find((n) => !edges.some((e) => e.b === n)) || nodes[0];
    const e = src.out[0];
    if (e) packets.push({ e, t: 0, speed: 0.01 + Math.random() * 0.006, back: false, trail: [] });
  }

  function step(time) {
    const dt = Math.min(0.1, (time - (lastT || time)) / 1000); lastT = time;
    if (time - lastSpawn > 420) { lastSpawn = time; spawn(); }
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.t += p.speed * 60 * dt;
      if (p.t >= 1) {
        const n = p.back ? p.e.target : p.e.b;
        n.pulse = 1;
        count++;
        onArrive && onArrive(nodes.indexOf(n), nodes.length, count);
        if (!p.back && n.def.gate && Math.random() < n.def.gate && n.backTo) {
          n.rej = 1;
          onReject && onReject();
          packets[i] = { e: { a: n, b: n.backTo, target: n.backTo, k: -0.35 }, t: 0, speed: 0.014, back: true, trail: [] };
          continue;
        }
        const outs = n.out;
        if (!outs.length) { packets.splice(i, 1); continue; }
        p.e = outs[Math.floor(Math.random() * outs.length)];
        p.t = 0; p.back = false;
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(time) {
    requestAnimationFrame(draw);
    if (!visible || !sys) return;
    appear = Math.min(1, appear + 0.025);
    step(time);
    ctx.clearRect(0, 0, W, H);

    // edges
    edges.forEach((e, i) => {
      const show = Math.max(0, Math.min(1, appear * edges.length - i * 0.6));
      if (!show) return;
      const { cx, cy } = curve(e.a, e.b);
      ctx.save();
      ctx.globalAlpha = show;
      const g = ctx.createLinearGradient(e.a.x, e.a.y, e.b.x, e.b.y);
      g.addColorStop(0, e.a.c); g.addColorStop(1, e.b.c);
      ctx.strokeStyle = g; ctx.globalAlpha = show * 0.45;
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([4 * dpr, 6 * dpr]);
      ctx.lineDashOffset = -time * 0.02 * dpr;
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.quadraticCurveTo(cx, cy, e.b.x, e.b.y); ctx.stroke();
      ctx.restore();
    });

    // packets with tails
    packets.forEach((p) => {
      const pos = at(p.e.a, p.e.b, p.t, p.e.k ?? 0.18);
      p.trail.push(pos); if (p.trail.length > 12) p.trail.shift();
      const col = p.back ? '#ff3b30' : p.e.a.c;
      for (let j = 0; j < p.trail.length; j++) {
        const q = p.trail[j], a = j / p.trail.length;
        ctx.fillStyle = col; ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, (1 + a * 2.5) * dpr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = col; ctx.shadowBlur = 16 * dpr;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 3.2 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    // nodes
    const fsT = Math.max(12, Math.min(17, W / dpr / 52)) * dpr;
    const fsS = fsT * 0.7;
    nodes.forEach((n, i) => {
      const show = Math.max(0, Math.min(1, appear * nodes.length * 0.9 - i * 0.7));
      if (!show) return;
      n.pulse *= 0.92; n.rej *= 0.93;
      ctx.font = `600 ${fsT}px Geist, sans-serif`;
      const tw = ctx.measureText(n.def.t).width;
      ctx.font = `500 ${fsS}px "Geist Mono", monospace`;
      const sw = ctx.measureText(n.def.s).width;
      const w = Math.max(tw, sw) + 28 * dpr, h = fsT + fsS + 26 * dpr;
      const sc = (0.8 + 0.2 * show) * (1 + n.pulse * 0.06);
      ctx.save();
      ctx.translate(n.x, n.y); ctx.scale(sc, sc);
      ctx.globalAlpha = show;
      if (n.pulse > 0.02) { ctx.shadowColor = n.c; ctx.shadowBlur = 40 * dpr * n.pulse; }
      roundRect(-w / 2, -h / 2, w, h, 10 * dpr);
      ctx.fillStyle = '#121216'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = (1.2 + n.pulse * 1.5) * dpr;
      ctx.strokeStyle = n.rej > 0.05 ? `rgba(255,59,48,${0.4 + n.rej})` : n.c;
      ctx.stroke();
      if (n.def.gate) {
        ctx.fillStyle = n.c;
        ctx.beginPath(); ctx.arc(w / 2 - 10 * dpr, -h / 2 + 10 * dpr, 3 * dpr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2efe9';
      ctx.font = `600 ${fsT}px Geist, sans-serif`;
      ctx.fillText(n.def.t, 0, -h / 2 + 12 * dpr + fsT * 0.82);
      ctx.fillStyle = 'rgba(242,239,233,.55)';
      ctx.font = `500 ${fsS}px "Geist Mono", monospace`;
      ctx.fillText(n.def.s, 0, h / 2 - 12 * dpr);
      ctx.restore();
    });
  }

  new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.05 }).observe(canvas);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  resize();
  requestAnimationFrame(draw);
  return { set, get count() { return count; } };
}
