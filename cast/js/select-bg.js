// Ambient backdrop for the character select screen: embers drift up on the
// left, void motes orbit on the right.
export function selectBackground(canvas) {
  const g = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 1, h = 1, pr = 1, raf = 0, running = false;
  const parts = [];
  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    pr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * pr);
    canvas.height = Math.round(h * pr);
  }

  function spawn(kind, fresh) {
    if (kind === 'ember') {
      return { kind, x: rand(-0.05, 0.6) * w, y: fresh ? rand(0, h) : h + rand(0, 40), vy: -rand(18, 70), sway: rand(0, 6.28), r: rand(0.8, 2.6), a: rand(0.4, 1) };
    }
    if (kind === 'ki') {
      return { kind, x: rand(0, 0.4) * w, y: fresh ? rand(h * 0.5, h) : h + rand(0, 30), vy: -rand(40, 120), r: rand(0.8, 2.2), a: rand(0.4, 0.9) };
    }
    return { kind, ang: rand(0, 6.28), rad: rand(0.08, 0.55) * Math.min(w, h), sp: rand(0.08, 0.35), r: rand(0.8, 2.4), a: rand(0.3, 0.9) };
  }

  function init() {
    parts.length = 0;
    for (let i = 0; i < 180; i++) parts.push(spawn(['ember', 'void', 'ki'][i % 3], true));
  }

  function frame(dt, t) {
    g.setTransform(pr, 0, 0, pr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const cx = w * 0.8, cy = h * 0.66;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let x, y, col;
      if (p.kind === 'ember') {
        p.y += p.vy * dt;
        p.sway += dt * 1.5;
        x = p.x + Math.sin(p.sway) * 10;
        y = p.y;
        col = `rgba(255,${120 + ((p.r * 40) | 0)},60,${p.a * Math.min(1, (p.y / h) * 1.4)})`;
        if (p.y < -20) parts[i] = spawn('ember');
      } else if (p.kind === 'ki') {
        p.y += p.vy * dt;
        x = p.x; y = p.y;
        col = `rgba(90,170,255,${p.a * Math.min(1, (p.y - h * 0.4) / (h * 0.3))})`;
        if (p.y < h * 0.4) parts[i] = spawn('ki');
      } else {
        p.ang += p.sp * dt * (120 / (p.rad + 60));
        x = cx + Math.cos(p.ang) * p.rad;
        y = cy + Math.sin(p.ang) * p.rad * 0.55;
        col = `rgba(170,130,255,${p.a})`;
      }
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, p.r * (1 + 0.3 * Math.sin(t * 3 + i)), 0, 6.283);
      g.fill();
    }
    // occasional lightning flicker in the top right
    if (Math.random() < dt * 1.2) {
      let x = w * (0.72 + Math.random() * 0.25), y = -10;
      g.strokeStyle = 'rgba(255,214,90,0.55)';
      g.lineWidth = 1.6;
      g.shadowColor = 'rgba(255,200,60,0.9)';
      g.shadowBlur = 12;
      g.beginPath();
      g.moveTo(x, y);
      const end = h * (0.15 + Math.random() * 0.25);
      while (y < end) { x += rand(-18, 18); y += rand(10, 26); g.lineTo(x, y); }
      g.stroke();
      g.shadowBlur = 0;
    }
    g.globalCompositeOperation = 'source-over';
  }

  let last = 0;
  function loop(now) {
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    frame(dt, now / 1000);
    raf = requestAnimationFrame(loop);
  }

  resize();
  init();
  window.addEventListener('resize', () => { resize(); init(); if (reduce) frame(0, 0); });

  return {
    start() {
      if (reduce) { frame(0, 0); return; }
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
