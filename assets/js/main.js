import { createParticles } from './particles.js';
import * as SH from './shapes.js';
import { sound, soundWanted } from './audio.js';

const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(pointer: fine)').matches;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

// ───────────────────────── smooth scroll
let lenis = null;
if (!RM && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.3 });
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const t = $(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    lenis.scrollTo(t, { duration: 2.2, easing: (x) => 1 - Math.pow(1 - x, 4) });
  }));
}

// ───────────────────────── text: split headings into words, reveal on arrival
$$('[data-words]').forEach((el) => {
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'wd';
          const inner = document.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', i++);
          w.appendChild(inner); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(el);
});
$$('section, .work-intro').forEach((sec) => $$('[data-reveal]', sec).forEach((el, k) => el.style.setProperty('--d', (0.12 + k * 0.08).toFixed(2))));
const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
$$('[data-reveal], [data-words], .list li').forEach((el) => io.observe(el));

// ───────────────────────── particles
const W0 = innerWidth;
const N = W0 > 1200 ? 110000 : W0 > 760 ? 80000 : 46000;
const canvas = $('.gl');
let P = null;
try { P = createParticles(canvas, N); } catch (e) { P = null; }
if (!P) html.classList.add('no-gl'); else html.classList.add('gl-on');

const META = {
  chaos: { mot: [0.06, 0, 0.2, 0.3], look: [1.8, 0.9, 0.75, 1], add: 1, fit: 'view', uni: true, k: 1, bg: [0.027, 0.027, 0.043] },
  name: { mot: [0, 0, 0, 0], look: [2.1, 0.6, 1, 1.05], add: 0.6, bg: [0.027, 0.027, 0.043] },
  constellation: { mot: [0.08, 0, 0.25, 0.9], look: [2.3, 0.85, 0.95, 1.25], add: 1, uni: true, k: 1, bg: [0.03, 0.028, 0.055] },
  image: { mot: [0, 0, 0, 0], look: [0, 0, 1, 1], add: 0, image: true, bg: [0.03, 0.03, 0.045] },
  images: { mot: [0, 0, 0, 0], look: [0, 0, 1, 1], add: 0, image: true, bg: [0.035, 0.028, 0.04] },
  ribbon: { mot: [0, 0.045, 0, 0.25], look: [2.1, 0.85, 0.8, 0.85], add: 1, bg: [0.025, 0.03, 0.05] },
  hand: { mot: [0, 0, 0, 0.7], look: [2.4, 0.85, 1, 1.3], add: 1, uni: true, k: 1, bg: [0.04, 0.025, 0.055] },
  galaxy: { mot: [0.03, 0, 1.08, 0.4], look: [1.7, 0.9, 0.7, 1.1], add: 1, fit: 'view', uni: true, k: 1.3, bg: [0.027, 0.027, 0.045] },
  ring: { mot: [0.07, 0, 1.3, 0.5], look: [1.8, 0.85, 0.7, 0.75], add: 1, uni: true, k: 1.5, bg: [0.027, 0.027, 0.043] },
};

const anchors = $$('[data-anchor]').map((el) => ({ el, key: el.dataset.anchor, type: el.dataset.shape, shape: null, rect: null, c: 0, settled: -1, imgs: $$('img', el) }));
const chaosShape = P ? SH.chaos(N) : null;

function bake(a) {
  const r = a.el.getBoundingClientRect();
  switch (a.type) {
    case 'name': return SH.text(N, a.el);
    case 'constellation': return SH.constellation(N);
    case 'ribbon': return SH.ribbon(N, P.rnd);
    case 'hand': return SH.hand(N);
    case 'galaxy': return SH.galaxy(N);
    case 'ring': return SH.ring(N);
    case 'image': return SH.images(N, [{ img: a.imgs[0], x: 0, y: 0, w: 1, h: 1, boxAspect: r.width / r.height }]);
    case 'images': return SH.images(N, a.imgs.map((im) => {
      const q = im.getBoundingClientRect();
      return { img: im, x: (q.left - r.left) / r.width, y: (q.top - r.top) / r.height, w: q.width / r.width, h: q.height / r.height, boxAspect: r.width / r.height };
    }));
  }
  return chaosShape;
}

// bake in small slices so nothing stutters
let bakeQueue = [];
function scheduleBakes(list) {
  bakeQueue = list.slice();
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 16));
  const step = () => {
    const a = bakeQueue.shift();
    if (!a) return;
    a.shape = bake(a);
    idle(step, { timeout: 120 });
  };
  idle(step, { timeout: 120 });
}
const ensure = (a) => (a.shape || (a.shape = bake(a)));

// ───────────────────────── input
const mouse = { x: innerWidth / 2, y: innerHeight / 2, wx: 0, wy: 0, f: 0, ft: 0, r: 0.5, rt: 0.5 };
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.ft = e.pointerType === 'touch' ? 0.8 : 0.65;
}, { passive: true });
addEventListener('pointerdown', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.ft = 0.9; }, { passive: true });
addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') mouse.ft = 0; });
document.addEventListener('pointerleave', () => (mouse.ft = 0));

// ───────────────────────── cursor
const cursor = FINE && !RM ? $('.cursor') : null;
const cDot = $('.c-dot'), cRing = $('.c-ring');
let rx = innerWidth / 2, ry = innerHeight / 2;
if (cursor) {
  html.classList.add('cur');
  addEventListener('pointerover', (e) => {
    const l = e.target.closest && e.target.closest('a, button');
    cursor.classList.toggle('link', !!l);
    if (l) sound.tick(0.012);
  });
}

// image slots: a hole follows the cursor and shows the particles underneath
$$('.slot').forEach((s) => {
  s.addEventListener('pointermove', (e) => {
    const r = s.getBoundingClientRect();
    s.style.setProperty('--mx', `${e.clientX - r.left}px`);
    s.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
  s.addEventListener('pointerenter', () => { mouse.rt = 0.95; sound.tick(0.025); cursor && cursor.classList.add('peek'); });
  s.addEventListener('pointerleave', () => { mouse.rt = 0.5; cursor && cursor.classList.remove('peek'); });
});

// ───────────────────────── sound controls
$$('.sound, .sound-cta').forEach((b) => b.addEventListener('click', () => sound.toggle()));
sound.onChange((on) => {
  html.classList.toggle('sound-on', on);
  $('.sound').setAttribute('aria-pressed', String(on));
  $('.sound-label').textContent = on ? 'Sound on' : 'Sound';
});
if (soundWanted()) {
  const once = () => { if (!sound.on) sound.enable(true); removeEventListener('pointerdown', once); removeEventListener('keydown', once); };
  addEventListener('pointerdown', once); addEventListener('keydown', once);
}

// ───────────────────────── email
const mail = $('.mail');
mail.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(mail.dataset.mail);
    mail.classList.add('copied'); $('.mail-c', mail).textContent = 'Copied';
    sound.bell(880, 0.06);
    setTimeout(() => { mail.classList.remove('copied'); $('.mail-c', mail).textContent = 'Copy'; }, 2200);
  } catch (e) { location.href = 'mailto:' + mail.dataset.mail; }
});

// ───────────────────────── HUD
const hfIdx = $('.hf-idx'), hfLabel = $('.hf-label'), hfLine = $('.hf-line');
const navLinks = $$('.hud-nav a');
const CHORD = { Hello: 'hello', 'Selected work': 'work', About: 'about', LedgerDesk: 'ld', 'Tripp’in AI': 'trip', 'God’s Eye View': 'gods', 'AI Tools Directory': 'tools', 'Client work': 'clients', Systems: 'systems', Cast: 'cast', 'Everything else': 'more', Contact: 'contact' };
const NAV = { 'Selected work': '#work', LedgerDesk: '#work', 'Tripp’in AI': '#work', 'God’s Eye View': '#work', 'AI Tools Directory': '#work', 'Client work': '#work', Systems: '#systems', Cast: '#cast', Contact: '#contact' };
const labelled = $$('main > section[data-label]');
let curLabel = '';
function hud() {
  const vc = innerHeight / 2;
  let sec = labelled[0];
  for (const s of labelled) { const r = s.getBoundingClientRect(); if (r.top <= vc && r.bottom > vc) { sec = s; break; } }
  const label = sec.dataset.label;
  if (label !== curLabel) {
    curLabel = label;
    hfIdx.textContent = String(labelled.indexOf(sec) + 1).padStart(2, '0');
    hfLabel.textContent = label;
    navLinks.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === NAV[label]));
    sound.chord(CHORD[label] || 'hello');
  }
  const max = document.documentElement.scrollHeight - innerHeight;
  hfLine.style.transform = `scaleX(${max > 0 ? clamp(scrollY / max, 0, 1) : 0})`;
  html.classList.toggle('past', scrollY > innerHeight * 0.5);
}

// ───────────────────────── the frame
const intro = { on: !!P, start: 0 };
const bg = [0.027, 0.027, 0.043], tilt = [0, 0];
let velS = 0;
const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 987.77];

function uniformsFor(a, shape) {
  const m = META[a ? a.type : 'chaos'];
  const v = P.view, k = v.pxToWorld;
  let cen, sca, size = m.look[0];
  if (!a || m.fit === 'view') {
    const s = (a ? Math.max(v.w, v.h) : Math.min(v.w, v.h)) * k * (m.k || 1);
    cen = [0, 0, 0]; sca = [s, s, s];
  } else {
    const r = a.rect;
    cen = [(r.left + r.width / 2 - v.w / 2) * k, -(r.top + r.height / 2 - v.h / 2) * k, 0];
    if (m.uni) { const s = Math.min(r.width, r.height) * k * (m.k || 1); sca = [s, s, s]; }
    else sca = [r.width * k, r.height * k, Math.min(r.width, r.height) * k];
    if (m.image) size = Math.max(1.5, r.width * (shape.cellFrac || 0.003) * 1.28);
    if (a.type === 'name') size = clamp((a.fs || (a.fs = parseFloat(getComputedStyle(a.el).fontSize))) / 62, 1.8, 3.4);
  }
  return { cen, sca, mot: m.mot, look: [size, m.look[1], m.look[2], m.look[3]], add: m.add, bg: m.bg };
}

function frame(now) {
  requestAnimationFrame(frame);
  if (lenis) lenis.raf(now);
  hud();
  const time = now / 1000;

  if (cursor) {
    rx += (mouse.x - rx) * 0.2; ry += (mouse.y - ry) * 0.2;
    cDot.style.transform = `translate3d(${mouse.x}px,${mouse.y}px,0)`;
    cRing.style.transform = `translate3d(${rx}px,${ry}px,0)`;
  }
  if (!P) return;

  const vh = innerHeight, vc = vh / 2;
  anchors.forEach((a) => {
    const r = (a.rect = a.el.getBoundingClientRect());
    // tall anchors count as centred for as long as the viewport is inside them
    a.c = r.height > vh ? clamp(vc, r.top + vh / 2, r.bottom - vh / 2) : r.top + r.height / 2;
  });

  let ia = 0, ib = 1, t;
  if (intro.on) {
    if (!intro.start) intro.start = now;
    const k = clamp((now - intro.start) / (RM ? 1 : 2900), 0, 1);
    t = 1 - Math.pow(1 - k, 3);
    if (k >= 1) { intro.on = false; lenis && lenis.start(); }
  } else {
    const j = anchors.findIndex((a) => a.c > vc + 0.5);
    if (j === 0) { ia = 0; ib = 1; t = 0; }
    else if (j === -1) { ia = anchors.length - 2; ib = anchors.length - 1; t = 1; }
    else { ia = j - 1; ib = j; t = (vc - anchors[ia].c) / Math.max(1, anchors[ib].c - anchors[ia].c); }
    t = smooth(0.08, 0.92, t);
  }

  const aA = intro.on ? null : anchors[ia];
  const aB = intro.on ? anchors[0] : anchors[ib];
  const sA = intro.on ? chaosShape : ensure(aA);
  const sB = ensure(aB);
  P.setPair(sA, sB);

  const uA = uniformsFor(aA, sA), uB = uniformsFor(aB, sB);
  const flight = Math.sin(Math.PI * clamp(t, 0, 1));
  const vel = lenis ? lenis.velocity : 0;
  velS += (clamp(vel * 0.025, -1, 1) - velS) * 0.1;

  // the DOM images condense once their particles have arrived
  anchors.forEach((a, i) => {
    if (!META[a.type].image) return;
    const d = intro.on ? 1 : i === ia ? t : i === ib ? 1 - t : 1;
    const s = 1 - smooth(0.0, 0.14, d);
    if (Math.abs(s - a.settled) > 0.002) {
      a.imgs.forEach((im) => (im.style.opacity = s.toFixed(3)));
      if (s > 0.98 && a.settled <= 0.98 && a.settled >= 0) sound.bell(NOTES[i % NOTES.length], 0.03);
      a.settled = s;
    }
  });

  const k = P.view.pxToWorld;
  const tx = (mouse.x - P.view.w / 2) * k, ty = -(mouse.y - P.view.h / 2) * k;
  mouse.wx += (tx - mouse.wx) * 0.18; mouse.wy += (ty - mouse.wy) * 0.18;
  mouse.f += (mouse.ft - mouse.f) * 0.06;
  mouse.r += (mouse.rt - mouse.r) * 0.08;
  const nx = (mouse.x / P.view.w - 0.5) * 2, ny = (mouse.y / P.view.h - 0.5) * 2;
  tilt[0] += (nx * 0.45 - tilt[0]) * 0.05; tilt[1] += (ny * 0.3 - tilt[1]) * 0.05;

  const tb = smooth(0, 1, t);
  for (let c = 0; c < 3; c++) bg[c] += ((uA.bg[c] + (uB.bg[c] - uA.bg[c]) * tb) - bg[c]) * 0.05;

  const threeD = META[aA ? aA.type : 'chaos'].uni || META[aB.type].uni;
  P.draw({
    t, time, swirl: RM ? 0 : intro.on ? 1.4 : threeD ? 0.95 : 0.65, vel: velS,
    A: uA, B: uB, mouse: [mouse.wx, mouse.wy], mouseR: mouse.r, mouseF: RM ? 0 : mouse.f,
    tilt, bg,
  });

  sound.wind(intro.on ? 0 : flight, vel);
}

// ───────────────────────── start
async function start() {
  lenis && lenis.stop();
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
  await Promise.all($$('[data-anchor] img').map((im) => (im.complete && im.naturalWidth ? Promise.resolve() : im.decode().catch(() => {}))));
  if (P) {
    anchors.forEach((a) => (a.rect = a.el.getBoundingClientRect()));
    anchors[0].shape = bake(anchors[0]);
    scheduleBakes(anchors.slice(1));
  } else if (lenis) lenis.start();
  html.classList.add('ready');
  requestAnimationFrame(frame);
}
start();

let rt;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    if (!P) return;
    P.resize();
    anchors.forEach((a) => { a.rect = a.el.getBoundingClientRect(); a.fs = 0; });
    anchors[0].shape = bake(anchors[0]);
    scheduleBakes(anchors.slice(1));
  }, 250);
});
