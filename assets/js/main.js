import { audio, soundWanted } from './audio.js';
import { createSignal } from './signal.js';
import { createHand } from './hand.js';
import { createReel } from './reel.js';
import { createSystems, SYSTEMS } from './systems.js';

const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(pointer: fine)').matches;
const NARROW = () => innerWidth <= 900;
if (RM) html.classList.add('rm');

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) scrollTo(0, 0);

// ───────────────────────────────── smooth scroll
let lenis = null;
if (!RM && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.105, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const t = $(a.getAttribute('href'));
    if (t) { e.preventDefault(); lenis.scrollTo(t, { duration: 1.6 }); }
  }));
}

// ───────────────────────────────── text scramble, used by several chapters
const GLYPHS = '▚▞▙▟▛▜░▒▓#%&/\\<>=+*·:';
const h1 = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
function scrambler(el) {
  const src = el.textContent;
  let last = -1;
  return (amt, seed = 0) => {
    const q = Math.round(amt * 60) / 60;
    if (q === last && !seed) return;
    last = q;
    let out = '';
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === ' ' || h1(i) >= q) out += c;
      else out += GLYPHS[(Math.floor(h1(i, seed) * 997) + Math.floor(performance.now() / 70)) % GLYPHS.length];
    }
    el.textContent = out;
  };
}

// ───────────────────────────────── hero signal + gate
const canvas = $('#signal');
const nameEl = $('.hero-name');
let signal = null;
try { signal = createSignal(canvas, { nameEl }); } catch (e) { signal = null; }
if (signal) html.classList.add('gl'); else canvas.style.display = 'none';

const gate = $('#gate');
const dialProg = $('.dial-prog');
const grFreq = $('.gr-freq'), grSnr = $('.gr-snr');
const gateStatus = $('.gate-status');
const ticks = $('.dial-ticks');
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * Math.PI * 2, r1 = 94, r2 = i % 5 ? 97 : 100;
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', 100 + Math.cos(a) * r1); l.setAttribute('y1', 100 + Math.sin(a) * r1);
  l.setAttribute('x2', 100 + Math.cos(a) * r2); l.setAttribute('y2', 100 + Math.sin(a) * r2);
  ticks.appendChild(l);
}

let tune = 0, holding = false, locked = false, wantSound = true, lastT = performance.now();
const STATION = 92.4;
html.classList.add('gated');
lenis && lenis.stop();

function showTune(x) {
  if (signal) signal.tune = x;
  dialProg.style.strokeDashoffset = String(1 - x);
  grFreq.textContent = (87.5 + x * (STATION - 87.5) + (x < 1 ? Math.sin(performance.now() / 60) * (1 - x) * 0.3 : 0)).toFixed(1);
  grSnr.textContent = String(Math.round(-24 + x * 62)).replace('-', '−');
}

function gateLoop(now) {
  if (locked) return;
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (holding) tune = clamp(tune + dt * (0.42 + tune * 0.9), 0, 1);
  else tune = clamp(tune - dt * 0.5, 0, 1);
  showTune(tune);
  if (audio.on) audio.tuning(tune);
  gateStatus.textContent = holding ? (tune > 0.82 ? 'Locking' : 'Searching') : tune > 0 ? 'Drifting' : 'No signal';
  gate.classList.toggle('locking', tune > 0.82);
  if (tune >= 1) { lock(true); return; }
  requestAnimationFrame(gateLoop);
}

function press(e) {
  if (locked || (e && e.target.closest && e.target.closest('.gate-skip'))) return;
  if (e && e.cancelable) e.preventDefault();
  if (!holding && wantSound && !audio.on) audio.enable(true).then(() => audio.bed(0.16, 900, 0.4, 0.1));
  holding = true;
}
function release() { holding = false; }

function lock(withSound) {
  if (locked) return;
  locked = true; holding = false;
  try { sessionStorage.setItem('kps-tuned', '1'); } catch (e) {}
  showTune(1);
  gateStatus.textContent = 'Locked';
  if (audio.on) {
    audio.carrierOff(1.6);
    audio.bed(0, 2000, 0.5, 1.2);
    audio.thump(0.3);
    audio.chime(523.25, 0.11);
  }
  if (signal) {
    gsap.to(signal.state, { lock: 1, duration: 1.4, ease: 'power2.out' });
  }
  html.classList.add('tuned');
  if (FINE && !RM) html.classList.add('cur-on');
  html.classList.remove('gated');
  gsap.to(gate, { autoAlpha: 0, duration: 0.6, delay: 0.15, ease: 'power2.out', onComplete: () => gate.remove() });
  revealHero();
  lenis && lenis.start();
  setSurface();
  requestAnimationFrame(() => ScrollTrigger.refresh());
}

function revealHero() {
  const items = $$('.hero-foot > *');
  if (RM) { gsap.set(items, { opacity: 1 }); return; }
  gsap.fromTo(items, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.09, delay: 0.25, ease: 'expo.out' });
  gsap.fromTo('.hud, .hud-rail', { opacity: 0 }, { opacity: 1, duration: 1, delay: 0.5, clearProps: 'opacity' });
}

function autoTune() {
  // returning visitors in the same session skip the ritual
  wantSound = false;
  gsap.to({ v: tune }, {
    v: 1, duration: RM ? 0.01 : 1.1, ease: 'power2.inOut',
    onUpdate() { tune = this.targets()[0].v; showTune(tune); },
    onComplete: () => lock(false),
  });
}

gate.addEventListener('pointerdown', press);
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
gate.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (locked) return;
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && !e.target.closest('.gate-skip')) { e.preventDefault(); press(); }
  if (e.code === 'Escape') autoTune();
});
addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') release(); });
$('.gate-skip').addEventListener('click', autoTune);

let already = false;
try { already = sessionStorage.getItem('kps-tuned') === '1'; } catch (e) {}
if (RM) {
  // no hold ritual with reduced motion: one press tunes in
  $('.gate-hint-main').textContent = 'Press to tune in';
  gate.addEventListener('pointerdown', () => { if (!locked) { audio.enable(true); lock(true); } });
  showTune(0);
} else if (already) {
  autoTune();
} else {
  requestAnimationFrame(gateLoop);
}

// any later gesture restores a sound preference from earlier in the session
if (soundWanted() === '1') {
  const once = () => { if (!audio.on) audio.enable(true); removeEventListener('pointerdown', once); };
  addEventListener('pointerdown', once);
}

// ───────────────────────────────── HUD
const hudBtn = $('.hud-sound');
const hudLabel = $('.hud-sound-label');
const scope = $('.hud-scope'), sctx = scope.getContext('2d');
const hudNum = $('.hud-ch-num'), hudLabelCh = $('.hud-ch-label');
const freqVal = $('.hud-freq-val');
const railFill = $('.hud-rail-fill');
hudBtn.addEventListener('click', () => audio.toggle());
audio.onChange((on) => {
  hudBtn.setAttribute('aria-pressed', String(on));
  hudLabel.textContent = on ? 'Sound on' : 'Sound off';
  if (on) audio.setChord(currentChord, true);
});

(function drawScope() {
  requestAnimationFrame(drawScope);
  const W = scope.width = 88 * 2, H = scope.height = 28 * 2;
  sctx.clearRect(0, 0, W, H);
  sctx.strokeStyle = getComputedStyle(hudBtn).color;
  sctx.lineWidth = 2;
  sctx.beginPath();
  const data = audio.scope();
  if (data) {
    const step = data.length / W;
    for (let x = 0; x < W; x++) {
      const v = (data[Math.floor(x * step)] - 128) / 128;
      const y = H / 2 + v * H * 1.6;
      x ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
    }
  } else {
    sctx.moveTo(8, H / 2); sctx.lineTo(W - 8, H / 2);
  }
  sctx.stroke();
})();

const BLOCKS = [['.block-flare', 'flare'], ['.block-magenta', 'magenta'], ['.block-acid', 'acid']].flatMap(([sel, name]) => $$(sel).map((el) => [el, name]));
function setSurface() {
  const y = 30;
  let surf = 'dark';
  if (locked) for (const [el, name] of BLOCKS) {
    const r = el.getBoundingClientRect();
    if (r.top <= y && r.bottom >= y) { surf = name; break; }
  }
  html.dataset.surface = surf;
}
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
  freqVal.textContent = (87.5 + p * 20.5).toFixed(1);
  railFill.style.transform = `scaleY(${p})`;
  html.classList.toggle('past-hero', scrollY > innerHeight * 0.6);
  setSurface();
}
lenis ? lenis.on('scroll', onScroll) : addEventListener('scroll', onScroll, { passive: true });
onScroll();

let currentChord = 'hero';
const SECTIONS = $$('main > section');
let currentSec = null;
function channel() {
  const mid = innerHeight * 0.5;
  for (const sec of SECTIONS) {
    const r = sec.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) {
      if (sec !== currentSec) {
        currentSec = sec;
        hudNum.textContent = `CH ${sec.dataset.ch}`;
        hudLabelCh.textContent = sec.dataset.label;
        currentChord = sec.dataset.chord;
        audio.setChord(currentChord);
      }
      return;
    }
  }
}
lenis ? lenis.on('scroll', channel) : addEventListener('scroll', channel, { passive: true });
channel();

// ───────────────────────────────── CH 02 noise
{
  const lines = $$('.noise-lines li');
  const scr = lines.map(scrambler);
  const verdict = $$('.noise-verdict span');
  const bar = $('.nm-bar b'), val = $('.nm-val');
  const shown = new Set();
  const render = (p) => {
    // 0 → .55: lines arrive one at a time, decoding in
    // .55 → .72: everything jams back into noise
    // .72 → 1: the verdict
    const per = 0.55 / lines.length;
    const jam = clamp((p - 0.55) / 0.15, 0, 1);
    lines.forEach((li, i) => {
      const a = clamp((p - i * per) / (per * 0.9), 0, 1);
      li.style.opacity = String(a * (1 - jam * 0.7));
      li.style.transform = `translateY(${(1 - a) * 18}px)`;
      scr[i](Math.max(1 - a, jam * 0.82), jam > 0 ? 1 : 0);
      li.classList.toggle('jam', jam > 0.2);
      if (a > 0.5 && !shown.has(i)) { shown.add(i); audio.tick(1800 + i * 180, 0.05, 'nl' + i); }
      if (a < 0.2) shown.delete(i);
    });
    verdict.forEach((v, i) => {
      const a = clamp((p - 0.72 - i * 0.07) / 0.1, 0, 1);
      v.style.opacity = String(a);
      v.style.transform = `translateY(${(1 - a) * 26}px)`;
      v.style.filter = a < 1 ? `blur(${(1 - a) * 8}px)` : 'none';
    });
    const noiseAmt = p < 0.55 ? lerp(0.9, 1, p / 0.55) : p < 0.72 ? 1 : lerp(1, 0.08, clamp((p - 0.72) / 0.28, 0, 1));
    bar.style.transform = `scaleX(${noiseAmt})`;
    val.textContent = `${Math.round(lerp(-48, -6, noiseAmt))} dB`.replace('-', '−');
    if (audio.on) {
      const bed = p > 0.02 && p < 0.98 ? 0.06 * noiseAmt * (jam > 0 && p < 0.72 ? 1.8 : 1) : 0;
      audio.bed(bed, 1200 + (1 - noiseAmt) * 2400, 0.6 + (1 - noiseAmt) * 4, 0.3);
      if (jam > 0.05 && jam < 0.95) audio.staticBurst(0.09, 0.05, 'jam');
    }
  };
  if (RM) {
    lines.forEach((li) => (li.style.opacity = '1'));
    verdict.forEach((v) => (v.style.opacity = '1'));
  } else {
    ScrollTrigger.create({
      trigger: '.noise', pin: '.noise-pin', start: 'top top', end: '+=260%', scrub: true,
      onUpdate: (s) => render(s.progress),
      onLeave: () => audio.on && audio.bed(0, 2000, 0.5, 0.6),
      onLeaveBack: () => audio.on && audio.bed(0, 2000, 0.5, 0.6),
    });
    render(0);
  }
}

// ───────────────────────────────── CH 03 filters
{
  const demo = $('.demo');
  const rules = $$('.rule');
  const stepEl = $('.dr-step'), snrEl = $('.dr-snr');
  const SNR = [3, 9, 15, 21, 27, 33, 41];
  let step = -1;
  const set = (n, quiet) => {
    if (n === step) return;
    const up = n > step;
    step = n;
    for (let i = 1; i <= 6; i++) demo.classList.toggle('f' + i, i <= n);
    rules.forEach((r, i) => {
      r.classList.toggle('on', i === n - 1 || (n === 0 && i === 0 && false));
      r.classList.toggle('done', i < n - 1);
    });
    if (n === 0) rules[0].classList.add('on');
    stepEl.textContent = n;
    snrEl.textContent = SNR[n];
    if (!quiet && audio.on) {
      if (up) { audio.sweepDown(0.08); audio.tick(900 + n * 260, 0.05, 'rule'); }
      else audio.staticBurst(0.14, 0.05, 'ruleback');
    }
  };
  if (RM) {
    set(6, true);
    rules.forEach((r) => r.classList.add('on'));
  } else {
    set(0, true);
    ScrollTrigger.create({
      trigger: '.filters-pin', pin: true, start: 'top top', end: '+=330%', scrub: true,
      onUpdate: (s) => {
        set(clamp(Math.floor(s.progress * 7.4), 0, 6));
        if (audio.on) audio.bed(0.022 * (1 - step / 6) * (s.progress < 0.99 ? 1 : 0), 2600 - step * 300, 0.5, 0.4);
      },
      onLeave: () => audio.on && audio.bed(0, 2000, 0.5, 0.5),
      onLeaveBack: () => audio.on && audio.bed(0, 2000, 0.5, 0.5),
    });
  }
}

// ───────────────────────────────── image reveals: clip opens, image settles
if (!RM) {
  $$('.reveal').forEach((fig) => {
    const frame = fig.querySelector('.frame, .split-frame, .loupe-frame');
    const img = fig.matches('.split, .loupe') ? null : frame.querySelector(':scope > img');
    gsap.fromTo(frame, { clipPath: 'inset(16% 22% 16% 22% round 28px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 14px)', ease: 'none',
      scrollTrigger: { trigger: fig, start: 'top 92%', end: 'top 30%', scrub: 0.7, onEnter: () => audio.whoosh(0.9, 0.05) },
    });
    if (img) gsap.fromTo(img, { scale: 1.35, yPercent: -4 }, {
      scale: 1, yPercent: 4, ease: 'none',
      scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: 0.7 },
    });
  });
}

// ───────────────────────────────── CH 04 case choreography
if (!RM) {
  // big titles slide up out of a mask as each case arrives
  $$('.case-title').forEach((t) => {
    const text = t.textContent;
    t.setAttribute('aria-label', text);
    t.innerHTML = [...text].map((c) => `<span class="ch" aria-hidden="true">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
    gsap.from(t.children, {
      yPercent: 115, rotate: 8, duration: 1.1, ease: 'expo.out', stagger: 0.025,
      scrollTrigger: { trigger: t, start: 'top 88%', onEnter: () => audio.whoosh(0.5, 0.04) },
    });
  });
  $$('.case-intro, .pdr > div').forEach((el) => {
    gsap.from(el, { y: 30, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });

  // LedgerDesk: sweep from the light build to the dark build with scroll
  const frame = $('.split-frame');
  gsap.fromTo(frame, { '--split': '94%' }, {
    '--split': '6%', ease: 'none',
    scrollTrigger: {
      trigger: frame, start: 'top 70%', end: 'bottom 20%', scrub: 0.6,
      onUpdate: (s) => { if (Math.abs(s.progress - 0.5) < 0.02) audio.tick(1400, 0.04, 'split'); },
    },
  });

  // Tripp'in: phones start stacked and fan out
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    gsap.from('.phone:nth-child(1)', { xPercent: 45, rotate: 0, y: 40, ease: 'none', scrollTrigger: { trigger: '.trip-phones', start: 'top 85%', end: 'top 25%', scrub: 0.8 } });
    gsap.from('.phone:nth-child(3)', { xPercent: -45, rotate: 0, y: 40, ease: 'none', scrollTrigger: { trigger: '.trip-phones', start: 'top 85%', end: 'top 25%', scrub: 0.8 } });
    gsap.from('.phone:nth-child(2)', { y: 70, ease: 'none', scrollTrigger: { trigger: '.trip-phones', start: 'top 85%', end: 'top 25%', scrub: 0.8 } });
  });
}

// God's Eye: an analyst's loupe
{
  const frame = $('.loupe-frame');
  const lens = $('.loupe-lens');
  const xy = $('.loupe-xy');
  const img = frame.querySelector('img');
  const Z = 2.6;
  if (FINE) {
    frame.addEventListener('pointerenter', () => { frame.classList.add('on'); lens.style.backgroundImage = `url(${img.currentSrc || img.src})`; audio.tick(3200, 0.03, 'lens'); });
    frame.addEventListener('pointerleave', () => frame.classList.remove('on'));
    frame.addEventListener('pointermove', (e) => {
      const r = frame.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      lens.style.transform = `translate(${x}px, ${y}px)`;
      lens.style.left = '0px'; lens.style.top = '0px';
      lens.style.backgroundSize = `${r.width * Z}px ${r.height * Z}px`;
      lens.style.backgroundPosition = `${-(x * Z - 100)}px ${-(y * Z - 100)}px`;
      xy.textContent = `x ${(x / r.width).toFixed(3)}  y ${(y / r.height).toFixed(3)}`;
      audio.tick(700 + (x / r.width) * 1800, 0.012, 'lensmove', 90);
    });
  }
}

// AI tools counter
{
  const el = $('.tools-count .count');
  const to = +el.dataset.to;
  const run = () => {
    const o = { v: 0 }; let lastTick = 0;
    gsap.to(o, {
      v: to, duration: RM ? 0.01 : 1.8, ease: 'expo.out',
      onUpdate: () => {
        const v = Math.round(o.v);
        el.textContent = v.toLocaleString('en-IN');
        if (v - lastTick > 40) { lastTick = v; audio.tick(1200 + (v / to) * 1600, 0.03, 'count'); }
      },
    });
  };
  ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: run });
}

// ───────────────────────────────── CH 05 volume
{
  const grid = $('.vol-grid');
  const N = 290;
  const cells = [];
  for (let i = 0; i < N; i++) { const c = document.createElement('i'); grid.appendChild(c); cells.push(c); }
  // light them in a believable order: batches, not a sweep
  const order = cells.map((c, i) => ({ c, k: Math.floor(i / 20) * 0.35 + h1(i, 4) })).sort((a, b) => a.k - b.k).map((o) => o.c);
  const handPicked = [37, 141, 228].map((i) => cells[i]);
  const count = $('.vol-count');
  let lit = 0;
  const render = (p) => {
    const n = Math.round(clamp(p / 0.85, 0, 1) * N);
    if (n !== lit) {
      const from = Math.min(n, lit), to = Math.max(n, lit);
      for (let i = from; i < to; i++) order[i].classList.toggle('on', i < n);
      if (n > lit) audio.tick(900 + (n / N) * 2600, 0.025, 'vol', 22);
      lit = n;
    }
    count.textContent = n >= N ? '290+' : String(n);
    const hand = p > 0.9;
    handPicked.forEach((c) => c.classList.toggle('pick', hand));
    if (hand && !render.chimed) { render.chimed = true; audio.chime(659.25, 0.05); }
    if (!hand) render.chimed = false;
  };
  if (RM) render(1);
  else if (NARROW()) {
    ScrollTrigger.create({ trigger: grid, start: 'top 85%', end: 'bottom 35%', scrub: true, onUpdate: (s) => render(s.progress) });
  } else {
    ScrollTrigger.create({ trigger: '.volume-pin', pin: true, start: 'top top', end: '+=140%', scrub: true, onUpdate: (s) => render(s.progress) });
  }
  if (!RM) {
    $$('.vol-shots figure').forEach((f, i) => {
      gsap.fromTo(f, { y: 60 + i * 40 }, { y: -20 - i * 30, ease: 'none', scrollTrigger: { trigger: '.vol-shots', start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }
}

// ───────────────────────────────── CH 06 spectrum
{
  const scale = $('.tuner-scale');
  const needle = $('.tuner-needle'), nf = $('.tuner-freq');
  const stations = $$('.station');
  const freqs = stations.map((s) => parseFloat($('.st-f', s).textContent));
  const LO = 87.5, HI = 108;
  for (let f = LO * 2; f <= HI * 2; f++) {
    const v = f / 2;
    const t = document.createElement('i');
    t.className = 'tk' + (v % 2 === 0 ? ' maj' : '');
    t.style.left = ((v - LO) / (HI - LO)) * 100 + '%';
    if (v % 2 === 0) { const s = document.createElement('span'); s.textContent = v; t.appendChild(s); }
    scale.appendChild(t);
  }
  freqs.forEach((v) => {
    const t = document.createElement('i'); t.className = 'tk st'; t.style.left = ((v - LO) / (HI - LO)) * 100 + '%'; scale.appendChild(t);
  });
  const fq = { v: freqs[0] };
  const place = () => {
    const x = scale.offsetLeft + ((fq.v - LO) / (HI - LO)) * scale.clientWidth;
    needle.style.transform = `translateX(${x}px)`;
    nf.textContent = fq.v.toFixed(1);
  };
  // D major pentatonic, one note per station
  const PENTA = [0, 2, 4, 7, 9];
  const noteFor = (i) => 293.66 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);
  let active = -1;
  const setActive = (i) => {
    if (i === active) return;
    active = i;
    stations.forEach((s, k) => s.classList.toggle('on', k === i));
    gsap.to(fq, { v: freqs[i], duration: RM ? 0.01 : 0.7, ease: 'expo.out', onUpdate: place });
    audio.staticBurst(0.1, 0.045, 'between');
    setTimeout(() => audio.tone(noteFor(i), 1.1, 0.05, 'station'), 90);
  };
  stations.forEach((s, i) => {
    s.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setActive(i); });
    ScrollTrigger.create({ trigger: s, start: 'top 58%', end: 'bottom 58%', onToggle: (self) => self.isActive && setActive(i) });
  });
  addEventListener('resize', place);
  stations[0].classList.add('on'); active = 0;
  place();
}

// ───────────────────────────────── CH 07 on air
const PENTA_C = [0, 3, 5, 7, 10];
{
  const card = $('.sign-card');
  const glyph = $('.sign-glyph', card), nm = $('.sign-name', card), mv = $('.sign-move', card), hero = $('.sign-hero', card);
  const swap = (el, text) => {
    const s = scrambler(Object.assign(el, { textContent: text }));
    const o = { a: 1 };
    gsap.to(o, { a: 0, duration: 0.5, ease: 'power2.out', onUpdate: () => s(o.a, 1), onComplete: () => (el.textContent = text) });
  };
  createHand($('#hand'), {
    onPose(p, burst) {
      if (burst) { audio.click(0.07); audio.staticBurst(0.08, 0.04, 'snap'); return; }
      glyph.textContent = p.glyph;
      gsap.fromTo(glyph, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' });
      swap(nm, p.sign); swap(mv, p.move); swap(hero, p.hero);
      audio.whoosh(0.6, 0.06, p.id !== 'hilt');
      if (p.id === 'hilt') audio.tone(110, 1.4, 0.07, 'pose');
      if (p.id === 'point') audio.tone(880, 1.2, 0.035, 'pose');
    },
  });
  if (!RM) {
    gsap.from('.onair h2', { yPercent: 50, opacity: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: '.onair', start: 'top 70%' } });
    gsap.from('.glyph-row li', { y: 30, opacity: 0, stagger: 0.06, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '.glyph-row', start: 'top 92%' } });
  }
  $$('.glyph-row li').forEach((li, i) => li.addEventListener('pointerenter', () => audio.tone(196 * Math.pow(2, PENTA_C[i % 5] / 12), 0.8, 0.04, 'glyph')));
}

// ───────────────────────────────── CH 08 transmit
{
  const btn = $('.tx-mail'), act = $('.tx-mail-act');
  btn.addEventListener('click', async () => {
    const mail = btn.dataset.mail;
    try {
      await navigator.clipboard.writeText(mail);
      btn.classList.add('copied'); act.textContent = 'Copied';
      audio.chime(783.99, 0.08);
      setTimeout(() => { btn.classList.remove('copied'); act.textContent = 'Copy'; }, 2200);
    } catch (e) { location.href = 'mailto:' + mail; }
  });

  if (!RM) {
    gsap.from('.tx-head', { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.tx', start: 'top 75%' } });
  }

  // end of transmission: a real scope when sound is on, a signal that flattens out when it is not
  const c = $('.eot-line'), x = c.getContext('2d');
  let vis = false, fade = 1;
  new IntersectionObserver(([e]) => (vis = e.isIntersecting)).observe(c);
  ScrollTrigger.create({ trigger: '.eot', start: 'top bottom', end: 'bottom bottom', onUpdate: (s) => (fade = 1 - s.progress) });
  (function loop(t) {
    requestAnimationFrame(loop);
    if (!vis) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = (c.width = c.clientWidth * dpr), H = (c.height = c.clientHeight * dpr);
    x.clearRect(0, 0, W, H);
    x.strokeStyle = 'rgba(235,231,222,.85)'; x.lineWidth = 1.5 * dpr;
    x.beginPath();
    const data = audio.scope();
    for (let i = 0; i <= W; i += 2) {
      const u = i / W;
      const env = Math.sin(u * Math.PI);
      let v;
      if (data) v = ((data[Math.floor(u * (data.length - 1))] - 128) / 128) * 3.2;
      else v = (Math.sin(u * 40 + t * 0.004) * 0.5 + Math.sin(u * 97 - t * 0.007) * 0.25 + (h1(i, Math.floor(t / 60)) - 0.5) * 0.4);
      const y = H / 2 + v * env * H * 0.36 * Math.max(0.04, fade);
      i ? x.lineTo(i, y) : x.moveTo(i, y);
    }
    x.stroke();
  })(0);
}


// ───────────────────────────────── CH 02 reel
{
  const ITEMS = [
    { src: 'assets/img/ledgerdesk-dark.webp', t: 'LedgerDesk', s: 'Document operations platform', href: '#ledgerdesk' },
    { src: 'assets/img/trippin-web.webp', t: 'Tripp’in AI', s: 'Travel planner, web', href: '#trippin' },
    { src: 'assets/img/godseye.webp', t: 'God’s Eye View', s: 'Satellite analysis console', href: '#godseye' },
    { src: 'assets/img/aitools.webp', t: 'AI Tools Directory', s: '1,200 tools, scannable', href: '#aitools' },
    { src: 'assets/img/trippin-day.webp', t: 'Tripp’in AI', s: 'Android day plan', href: '#trippin' },
    { src: 'assets/img/ledgerdesk-light.webp', t: 'LedgerDesk', s: 'Light theme, same layout', href: '#ledgerdesk' },
    { src: 'assets/img/gym.webp', t: 'Gym', s: 'Client site', href: '#volume' },
    { src: 'assets/img/clinic.webp', t: 'Clinic', s: 'Client site', href: '#volume' },
    { src: 'assets/img/salon.webp', t: 'Salon', s: 'Client site', href: '#volume' },
    { src: 'assets/img/trippin-archive.webp', t: 'Tripp’in AI', s: 'Trip archive', href: '#trippin' },
    { src: 'assets/img/trippin-profile.webp', t: 'Tripp’in AI', s: 'Profile', href: '#trippin' },
  ];
  const cv = $('.reel-gl');
  let reel = null;
  try { reel = createReel(cv, ITEMS); } catch (e) { reel = null; }
  if (!reel) html.classList.add('no-gl');
  else {
    const title = $('.reel-title'), sub = $('.reel-sub'), idx = $('.reel-idx'), bar = $('.reel-progress i');
    $('.reel-count span').textContent = `/ ${String(ITEMS.length).padStart(2, '0')}`;
    let shown = 0;
    const show = (i) => {
      if (i === shown) return;
      shown = i;
      const it = ITEMS[i];
      idx.textContent = String(i + 1).padStart(2, '0');
      title.textContent = it.t; sub.textContent = it.s;
      const s1 = scrambler(title), o = { a: 1 };
      gsap.to(o, { a: 0, duration: 0.45, ease: 'power2.out', onUpdate: () => s1(o.a, 1), onComplete: () => (title.textContent = it.t) });
      audio.tick(700 + i * 160, 0.05, 'reel', 60);
      audio.staticBurst(0.06, 0.03, 'reelst');
    };
    ScrollTrigger.create({
      trigger: '.reel', pin: '.reel-pin', start: 'top top', refreshPriority: 10, end: () => `+=${ITEMS.length * (NARROW() ? 55 : 70)}%`, scrub: true,
      onUpdate: (st) => {
        reel.set(st.progress * (ITEMS.length - 1));
        bar.style.transform = `scaleX(${st.progress})`;
      },
    });
    gsap.ticker.add(() => show(reel.index));
    cv.addEventListener('click', () => {
      const t = $(ITEMS[reel.index].href);
      if (t) lenis ? lenis.scrollTo(t, { duration: 2 }) : t.scrollIntoView({ behavior: 'smooth' });
    });
    cv.dataset.cursor = 'View';
  }
}

// ───────────────────────────────── marquees: drift, and lean into scroll speed
{
  const tracks = $$('.marquee').map((m) => {
    const tr = $('.marquee-track', m);
    tr.innerHTML += tr.innerHTML; // seamless loop
    return { m, tr, x: 0, dir: +m.dataset.speed || 1, skew: 0 };
  });
  let vel = 0;
  if (lenis) lenis.on('scroll', (l) => (vel = l.velocity || 0));
  gsap.ticker.add((t, dt) => {
    if (RM) return;
    tracks.forEach((k) => {
      const half = k.tr.scrollWidth / 2;
      k.x -= (k.dir * (0.06 + Math.abs(vel) * 0.02)) * dt * (vel < 0 ? -1 : 1);
      if (k.x <= -half) k.x += half;
      if (k.x > 0) k.x -= half;
      k.skew += (clamp(vel * -0.6, -14, 14) - k.skew) * 0.12;
      k.tr.style.transform = `translate3d(${k.x}px,0,0) skewX(${k.skew}deg)`;
    });
    vel *= 0.94;
  });
}

// ───────────────────────────────── designer cursor
if (FINE && !RM) {
  const cur = $('.cursor'), dot = $('.cursor-dot'), ring = $('.cursor-ring'), lab = $('.cursor-label');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    const el = e.target.closest && e.target.closest('[data-cursor], a, button');
    const label = el && el.dataset.cursor;
    cur.classList.toggle('has-label', !!label);
    cur.classList.toggle('is-link', !!el && !label);
    if (label && lab.textContent !== label) lab.textContent = label;
  }, { passive: true });
  addEventListener('pointerdown', () => cur.classList.add('down'));
  addEventListener('pointerup', () => cur.classList.remove('down'));
  gsap.ticker.add(() => {
    rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
    dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
  });
}

// ───────────────────────────────── CH 06 systems
{
  const cvs = $('.sys-gl');
  const tabs = $$('.sys-tab');
  const tEl = $('.sys-title'), dEl = $('.sys-desc'), kEl = $('.sys-stack'), nEl = $('.sr-n');
  const PENTA = [0, 2, 4, 7, 9, 12, 14];
  const sysv = createSystems(cvs, {
    onArrive: (i, n, c) => { nEl.textContent = c; audio.tone(392 * Math.pow(2, PENTA[i % PENTA.length] / 12), 0.35, 0.025, 'sysnode'); },
    onReject: () => audio.staticBurst(0.12, 0.05, 'sysrej'),
  });
  const keys = Object.keys(SYSTEMS);
  let cur = 'lead', userPicked = false;
  const pick = (k, quiet) => {
    cur = k;
    const d = sysv.set(k);
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.sys === k)));
    tEl.textContent = d.title; kEl.textContent = d.stack; dEl.textContent = d.desc;
    if (!RM) gsap.fromTo([tEl, dEl, kEl], { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'expo.out' });
    if (!quiet) audio.whoosh(0.5, 0.05);
  };
  tabs.forEach((t) => t.addEventListener('click', () => { userPicked = true; pick(t.dataset.sys); }));
  pick('lead', true);
  // passive visitors still see all four: rotate while in view until someone clicks
  let inView = false;
  ScrollTrigger.create({ trigger: '.systems', start: 'top 60%', end: 'bottom 40%', onToggle: (s) => (inView = s.isActive) });
  setInterval(() => { if (inView && !userPicked && !RM) pick(keys[(keys.indexOf(cur) + 1) % keys.length]); }, 9000);
  if (!RM) gsap.from('.sys-stage', { clipPath: 'inset(20% 30% 20% 30% round 40px)', ease: 'none', scrollTrigger: { trigger: '.sys-stage', start: 'top 95%', end: 'top 40%', scrub: 0.6 } });
}

// ───────────────────────────────── spectrum hover previews
if (FINE) {
  const pv = $('.preview'), pin = $('.preview-in');
  let px = 0, py = 0, x = 0, y = 0, rot = 0, on = false;
  $$('.station').forEach((s) => {
    s.addEventListener('pointerenter', () => {
      const name = $('.st-name', s).textContent, f = $('.st-f', s).textContent, repo = s.dataset.repo;
      pin.style.backgroundColor = s.dataset.c;
      pin.innerHTML = `<span class="pv-f">${f} MHz</span><span class="pv-t">${name}</span>`;
      if (repo) {
        const im = new Image();
        im.alt = '';
        im.className = 'pv-img';
        im.onerror = () => im.remove();
        im.src = `https://opengraph.githubassets.com/kps/KevinPratap/${repo}`;
        pin.appendChild(im);
      }
      pv.classList.add('on'); on = true;
    });
    s.addEventListener('pointerleave', () => { pv.classList.remove('on'); on = false; });
  });
  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { passive: true });
  gsap.ticker.add(() => {
    const dx = px - x;
    x += dx * 0.14; y += (py - y) * 0.14;
    rot += (clamp(dx * 0.08, -12, 12) - rot) * 0.1;
    if (on || pv.classList.contains('on')) pv.style.transform = `translate3d(${x}px,${y}px,0) rotate(${rot}deg)`;
  });
}

// ───────────────────────────────── interface sounds
if (FINE) {
  $$('a, button, .station').forEach((el) => {
    el.addEventListener('pointerenter', () => audio.tick(4200, 0.012, 'hover', 60));
  });
}
addEventListener('click', (e) => { if (e.target.closest('a, button')) audio.click(0.05); });

// ───────────────────────────────── fonts change metrics: redraw and re-measure once they land
ScrollTrigger.sort();
ScrollTrigger.refresh();
document.fonts && document.fonts.ready.then(() => {
  signal && signal.redraw();
  ScrollTrigger.refresh();
});
addEventListener('load', () => ScrollTrigger.refresh());
