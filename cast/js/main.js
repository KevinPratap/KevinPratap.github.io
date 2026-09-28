import * as THREE from 'three';
import { CONFIG, CHARACTERS, KANJI_SET } from './config.js';
import { Tracker, HAND_BONES, Projector } from './tracking.js';
import { Pipeline, Post } from './render/pipeline.js';
import { Particles, Streaks } from './render/particles.js';
import { FXList, EnergyHands } from './render/objects.js';
import { Overlay } from './overlay.js';
import { SFX } from './audio.js';
import { Recorder } from './recorder.js';
import { SimHands } from './sim.js';
import { Ember } from './engines/ember.js';
import { Nyx } from './engines/nyx.js';
import { selectBackground } from './select-bg.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ORDER = ['ember', 'nyx'];

const screens = ['select', 'loading', 'error', 'live'];
function show(name) {
  screens.forEach((s) => { $(`screen-${s}`).hidden = s !== name; });
  document.body.dataset.screen = name;
}

const video = $('cam');
const sfx = new SFX();
const tracker = new Tracker();
const bg = selectBackground($('select-bg'));

const state = {
  char: null, engine: null, booted: false, looping: false, sim: null, useSim: false,
  debug: false, lastSeen: 0, clock: 0, used: { ember: new Set(), nyx: new Set() }, pr: 1, fps: 60,
};
let pipeline, particles, streaks, fx, energy, overlay, recorder, engines, wakeLock;

// ---------- select screen ----------
document.querySelectorAll('.char-card').forEach((card) => {
  card.addEventListener('click', () => selectChar(card.dataset.char));
});

function selectChar(name) {
  state.char = name;
  document.querySelectorAll('.char-card').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.char === name)));
  const ch = CHARACTERS[name];
  setAccent(ch);
  const btn = $('btn-start');
  btn.disabled = false;
  btn.textContent = `Cast as ${ch.name}`;
  if (document.body.dataset.screen === 'select') btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setAccent(ch) {
  const r = document.documentElement.style;
  r.setProperty('--accent', ch.css[0]);
  r.setProperty('--accent-2', ch.css[1]);
}

$('btn-start').addEventListener('click', () => { if (state.char) boot(false); });
$('btn-demo').addEventListener('click', () => { if (!state.char) selectChar('ember'); boot(true); });
$('btn-retry').addEventListener('click', () => boot(state.useSim));
$('btn-demo-2').addEventListener('click', () => boot(true));

// ---------- boot ----------
function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  ['900 64px "Noto Serif JP"', '700 40px "Cinzel"', '600 20px "JetBrains Mono"', '500 20px "Sora"'].forEach((f) => {
    document.fonts.load(f, f.includes('Noto') ? KANJI_SET : 'CAST').catch(() => {});
  });
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error('no camera api');
    e.name = 'NoMedia';
    throw e;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((res) => {
    if (video.readyState >= 1) res();
    else video.onloadedmetadata = () => res();
  });
  await video.play();
}

function cameraError(err) {
  const map = {
    NotAllowedError: 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.',
    NotFoundError: 'No camera was found on this device.',
    NotReadableError: 'Your camera is busy in another app. Close that app and try again.',
    OverconstrainedError: 'Your camera does not support the requested mode. Try again.',
    NoMedia: 'This browser cannot open the camera here. Try Chrome or Safari.',
  };
  return map[err && err.name] || 'The camera could not start. Try again.';
}

function fail(msg) {
  $('error-text').textContent = msg;
  show('error');
}

async function boot(useSim) {
  state.useSim = useSim;
  sfx.init();
  loadFonts();
  bg.stop();
  document.querySelector('.sigil-loader b').textContent = CHARACTERS[state.char || 'ember'].kanji;
  show('loading');
  $('loading-text').textContent = useSim ? 'Summoning the demo…' : 'Waking up the camera…';

  if (!useSim) {
    try {
      await startCamera();
    } catch (err) {
      console.warn(err);
      fail(cameraError(err));
      return;
    }
  }

  try {
    if (!state.booted) initGraphics();
  } catch (err) {
    console.error(err);
    fail('Your browser could not start WebGL graphics. Try another browser or device.');
    return;
  }

  if (useSim) {
    state.sim = state.sim || new SimHands(tracker);
    const tex = new THREE.CanvasTexture(state.sim.canvas);
    pipeline.setVideoSource(tex, state.sim.canvas.width, state.sim.canvas.height, Projector);
  } else {
    state.sim = null;
    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    pipeline.setVideoSource(tex, video.videoWidth, video.videoHeight, Projector);
    if (!tracker.landmarker) {
      $('loading-text').textContent = 'Loading hand tracking…';
      try {
        await tracker.init();
      } catch (err) {
        console.error(err);
        fail('Hand tracking failed to load. Check your connection and try again.');
        return;
      }
    }
  }

  $('demo-badge').hidden = !useSim;
  show('live');
  onResize();
  enterCharacter(state.char || 'ember', true);
  requestWakeLock();
  if (!state.looping) {
    state.looping = true;
    last = 0;
    requestAnimationFrame(frame);
  }
}

function initGraphics() {
  pipeline = new Pipeline($('gl'));
  const scene = pipeline.fxScene;
  particles = new Particles(scene, 2600, pipeline.pr);
  streaks = new Streaks(scene, 1400);
  fx = new FXList(scene);
  energy = new EnergyHands(scene, HAND_BONES);
  overlay = new Overlay($('overlay'));
  recorder = new Recorder({
    glCanvas: $('gl'), overlayCanvas: $('overlay'), sfx,
    onTick: (t) => { $('rec-time').textContent = fmtTime(t); },
    onDone: showClip,
    onError: (m) => { toast(m); setRecUI(false); },
  });
  const ctx = { scene, fx, particles, streaks, overlay, sfx, onMove: markMove };
  engines = { ember: new Ember(ctx), nyx: new Nyx(ctx) };
  state.pr = pipeline.pr;
  state.booted = true;
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!pipeline) return;
  pipeline.resize();
  overlay.resize(pipeline.pr);
  particles.setPR(pipeline.pr);
}

// ---------- characters ----------
function enterCharacter(name, intro) {
  if (state.engine) state.engine.exit();
  fx.clear();
  particles.clear();
  streaks.clear();
  Post.clearSources();
  overlay.clear();
  state.char = name;
  const ch = CHARACTERS[name];
  state.engine = engines[name];
  state.engine.enter();
  pipeline.setCharacter(ch);
  overlay.setCharacter(ch);
  recorder.setCharacter(ch);
  energy.setColors(ch.a, ch.b);
  setAccent(ch);
  if (state.sim) state.sim.setCharacter(name);
  $('hud-kanji').textContent = ch.kanji;
  $('hud-name').textContent = ch.name;
  $('hud-sub').textContent = ch.element;
  buildMoves(ch, name);
  if (intro) playIntro(ch);
}

function playIntro(ch) {
  Post.fade = 0;
  Post.fadeTarget = 1;
  overlay.callout(ch.kanji, ch.name, { big: true, dur: 1.7 });
  sfx.play('intro');
  setTimeout(() => {
    const W = window.innerWidth, H = window.innerHeight;
    Post.flashScreen(0.35, ch.b);
    Post.shake(0.35);
    Post.shockwave({ x: W / 2, y: H / 2, speed: 1400, width: 90, strength: 34, life: 0.8 });
    fx.ring({ x: W / 2, y: H / 2, r0: 20, r1: Math.hypot(W, H) * 0.6, dur: 0.8, width: 30, a: ch.a, b: ch.b, fire: ch === CHARACTERS.ember, intensity: 1.8 });
  }, 450);
}

function buildMoves(ch, name) {
  const list = $('moves-list');
  list.innerHTML = '';
  ch.moves.forEach((m, i) => {
    const li = document.createElement('li');
    li.className = 'move' + (state.used[name].has(i) ? ' used' : '');
    li.dataset.index = i;
    li.innerHTML = `<span class="move-kanji" lang="ja"></span><span class="move-body"><span class="move-name"></span><span class="move-how"></span></span><span class="move-check" aria-hidden="true">✓</span>`;
    li.querySelector('.move-kanji').textContent = m.kanji;
    li.querySelector('.move-name').textContent = m.name;
    li.querySelector('.move-how').textContent = m.how;
    list.appendChild(li);
  });
  updateProgress();
}

function markMove(i) {
  const set = state.used[state.char];
  const li = $('moves-list').children[i];
  if (!li) return;
  set.add(i);
  li.classList.add('used');
  li.classList.remove('flash');
  void li.offsetWidth;
  li.classList.add('flash');
  updateProgress();
}

function updateProgress() {
  const n = state.used[state.char] ? state.used[state.char].size : 0;
  $('moves-progress').textContent = `${n}/4 found`;
}

// ---------- main loop ----------
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.body.dataset.screen !== 'live') { last = now; return; }
  const rawDt = last ? Math.max(0, (now - last) / 1000) : 1 / 60;
  const dt = Math.min(0.05, rawDt);
  last = now;
  // Game clock advances by capped dt so gesture timing survives frame hitches.
  state.clock += dt;
  const time = state.clock;
  state.fps += (1 / Math.max(dt, 1e-3) - state.fps) * 0.05;

  pipeline.watchPerf(dt * 1000);
  if (pipeline.pr !== state.pr) { state.pr = pipeline.pr; onResize(); }

  if (state.sim) state.sim.update(dt);
  else tracker.detect(video, now);
  tracker.update(dt);
  const H = tracker.hands;
  for (const h of [H.L, H.R]) {
    if (h.justAppeared) {
      overlay.reticle(h.cx, h.cy, h.scale * 3);
      sfx.play('appear');
    }
  }
  if (H.L.present || H.R.present) state.lastSeen = time;

  const levels = state.engine.update(dt, time, H);
  energy.update([H.L, H.R], levels, time);
  particles.update(dt);
  streaks.update(dt);
  fx.update(dt, time);
  sfx.endFrame();
  pipeline.render(dt, time);
  overlay.draw(dt);
  // Real elapsed time, so clip length and the end card match the wall clock.
  recorder.frame(Math.min(rawDt, 0.5));

  $('hint').hidden = !!state.sim || time - state.lastSeen < 2.5;
  if (state.debug) drawDebug(H);
}

function drawDebug(H) {
  const f = (h) => (h.present
    ? `open ${h.open.toFixed(2)} spd ${h.speed.toFixed(1)} grow ${h.scaleRate.toFixed(1)}  ${[h.fist && 'fist', h.cupped && 'cup', h.isOpen && 'open', h.still && 'still'].filter(Boolean).join(' ')}`
    : '—');
  $('debug-readout').textContent =
    `fps ${state.fps.toFixed(0)}  res ${pipeline.pr.toFixed(2)}x  ${state.useSim ? 'demo' : 'camera'}\nL  ${f(H.L)}\nR  ${f(H.R)}`;
}

// ---------- HUD ----------
$('btn-swap').addEventListener('click', () => {
  const next = ORDER[(ORDER.indexOf(state.char) + 1) % ORDER.length];
  enterCharacter(next, true);
});

$('btn-sound').addEventListener('click', (e) => {
  const on = !sfx.enabled;
  sfx.init();
  sfx.setEnabled(on);
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.textContent = on ? 'SOUND ON' : 'SOUND OFF';
});

$('btn-moves').addEventListener('click', (e) => {
  const open = $('moves-panel').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

$('btn-debug').addEventListener('click', (e) => {
  state.debug = !state.debug;
  e.currentTarget.setAttribute('aria-pressed', String(state.debug));
  $('debug-readout').hidden = !state.debug;
});

$('btn-record').addEventListener('click', () => {
  if (recorder.active) {
    if (recorder.ending <= 0) { recorder.requestStop(); $('rec-label').textContent = 'SAVING'; }
    return;
  }
  sfx.init();
  recorder.start();
  if (recorder.active) { sfx.play('shutter'); setRecUI(true); }
});

function setRecUI(on) {
  $('btn-record').setAttribute('aria-pressed', String(on));
  $('btn-record').setAttribute('aria-label', on ? 'Stop recording' : 'Start recording');
  $('rec-pill').hidden = !on;
  $('rec-label').textContent = 'REC';
  $('rec-time').textContent = '0:00';
}

function fmtTime(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- clip preview ----------
let clip = null;
function showClip({ blob, url, ext, type }) {
  setRecUI(false);
  if (clip) URL.revokeObjectURL(clip.url);
  const name = `cast-${state.char}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
  clip = { blob, url, name, type };
  window.__cast.clip = clip;
  const v = $('clip-video');
  v.src = url;
  v.play().catch(() => {});
  const dl = $('btn-save');
  dl.href = url;
  dl.download = name;
  let canShare = false;
  try {
    canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type })] }));
  } catch (e) { canShare = false; }
  $('btn-share').hidden = !canShare;
  $('clip-note').textContent = ext === 'webm'
    ? 'Saved as WebM. Instagram prefers MP4, so convert it first or record on a phone.'
    : 'Ready to post. Tag it and drop the link so people can try it.';
  $('clip-modal').hidden = false;
}

$('btn-share').addEventListener('click', async () => {
  if (!clip) return;
  try {
    await navigator.share({ files: [new File([clip.blob], clip.name, { type: clip.type })], title: 'Cast', text: `Try it: ${CONFIG.TRY_URL}` });
  } catch (e) { /* share sheet dismissed */ }
});

$('btn-discard').addEventListener('click', () => {
  $('clip-modal').hidden = true;
  $('clip-video').pause();
});

// ---------- misc ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.dataset.screen === 'live') requestWakeLock();
});

// ---------- start ----------
show('select');
bg.start();
if (window.matchMedia('(min-width: 900px)').matches) {
  $('moves-panel').classList.add('open');
  $('btn-moves').setAttribute('aria-expanded', 'true');
}
if (params.has('demo') || params.has('sim')) {
  selectChar(CHARACTERS[params.get('char')] ? params.get('char') : 'ember');
  if (params.has('auto')) boot(true);
}
window.__cast = { state, Post, get pipeline() { return pipeline; }, tracker, sfx };
