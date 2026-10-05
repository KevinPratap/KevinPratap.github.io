// The hero: TV static that resolves into a name on paper.
// tune: 0 = dead channel, 1 = locked. The name lives in a texture drawn with real type.

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 uRes;
uniform float uTime, uTune, uDpr, uLens, uLock, uOut;
uniform vec2 uMouse;
uniform sampler2D uText;
uniform vec3 uPaper, uInk, uNight, uAccent;

float hash(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
// the signal spectrum: flare, magenta, ultraviolet, cyan
vec3 spectrum(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(1.0, 0.30, 0.10), b = vec3(1.0, 0.18, 0.53), c = vec3(0.42, 0.24, 1.0), d = vec3(0.09, 0.88, 1.0);
  return t < 0.33 ? mix(a, b, t/0.33) : t < 0.66 ? mix(b, c, (t-0.33)/0.33) : mix(c, d, (t-0.66)/0.34);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = vec2(frag.x/uRes.x, 1.0 - frag.y/uRes.y);

  float md = distance(frag, uMouse) / (min(uRes.x, uRes.y) * 0.24);
  float lens = uLens * smoothstep(1.0, 0.0, md);
  float t = clamp(uTune + lens * 0.6 * (1.0 - uLock), 0.0, 1.0);
  float n = 1.0 - t;

  float frame = floor(uTime * 30.0);
  float row = floor(frag.y / (3.0*uDpr));
  float tear = (hash(vec2(row, frame)) - 0.5) * n * n * 0.22;
  tear += (hash(vec2(floor(frag.y/(40.0*uDpr)), floor(uTime*9.0))) - 0.5) * n * 0.05;
  float roll = smoothstep(0.0, 0.12, abs(fract(uv.y*0.9 + uTime*0.21) - 0.5));
  tear += (1.0 - roll) * n * 0.02;
  // after lock the cursor bends the name a little, like a magnet near a CRT
  tear += lens * uLock * sin(uv.y*90.0 + uTime*12.0) * 0.006;

  vec2 tuv = uv + vec2(tear, 0.0);
  vec4 tx = texture2D(uText, tuv);
  float ink = tx.r;
  float dotA = tx.g;
  float split = 0.003 + 0.012*n + lens*uLock*0.01;
  float inkR = texture2D(uText, tuv + vec2(split, 0.0)).r;
  float inkB = texture2D(uText, tuv - vec2(split*0.8, 0.0)).r;

  // dead channel
  vec2 cell = floor(frag / (2.0*uDpr));
  float st = hash(cell + frame*vec2(1.37, 2.91));
  float st2 = hash(cell*0.5 + frame*vec2(3.1, 1.7));
  vec3 dark = mix(uNight, vec3(0.66, 0.65, 0.62), pow(st, 2.6));
  dark *= 0.75 + 0.25*roll;
  dark = mix(dark, vec3(0.95,0.93,0.9), ink * smoothstep(0.05, 0.75, t) * (0.35 + 0.4*st2));
  vec2 cq = (uv - vec2(0.5, 0.52)) * vec2(uRes.x/uRes.y, 1.0);
  dark *= 1.0 - 0.55 * exp(-dot(cq, cq) * 9.0) * (1.0 - uLock);

  // live signal: flowing contour lines of a warped field
  vec2 p = (frag - 0.5*uRes) / uRes.y * 2.2;
  vec2 m = (uMouse - 0.5*uRes) / uRes.y * 2.2;
  vec2 dm = p - m;
  p += dm * 0.55 * exp(-dot(dm, dm) * 2.2) * uLens;
  float tm = uTime * 0.06;
  vec2 q = vec2(fbm(p*0.8 + vec2(0.0, tm)), fbm(p*0.8 + vec2(5.2, -tm)));
  float h = fbm(p*0.9 + q*1.8 + vec2(tm*0.6, 0.0));
  float k = h * 22.0;
  #ifdef GL_OES_standard_derivatives
    float w = fwidth(k);
  #else
    float w = 0.06;
  #endif
  float dist = abs(fract(k - 0.5) - 0.5) / max(w, 1e-4);
  float line = 1.0 - smoothstep(0.0, 1.3, dist);
  float major = 1.0 - smoothstep(0.0, 2.2, abs(fract(k/4.0 - 0.5) - 0.5)*4.0 / max(w, 1e-4));
  float band = smoothstep(0.25, 0.85, h);
  vec3 col1 = spectrum(fract(h*1.6 + uv.x*0.25 - uTime*0.015));
  vec3 field = uNight + col1 * (line*0.55 + major*0.5) * (0.35 + 0.9*band);
  field += col1 * 0.06 * band;
  // a slow bright sweep, the signal "breathing"
  field += col1 * line * 0.6 * smoothstep(0.92, 1.0, sin(uv.x*3.0 - uTime*0.7 + h*4.0));
  field *= 1.0 - 0.35*ink; // lines dim behind the type
  float vg = smoothstep(1.4, 0.2, length(uv - vec2(0.5)));
  field *= 0.65 + 0.35*vg;

  vec3 bone = vec3(0.949, 0.937, 0.914);
  vec3 sig = mix(field, bone, ink);
  float ghostR = clamp(inkR - ink, 0.0, 1.0), ghostB = clamp(inkB - ink, 0.0, 1.0);
  sig += vec3(1.0, 0.18, 0.4) * ghostR * 0.9 + vec3(0.1, 0.8, 1.0) * ghostB * 0.9;
  sig = mix(sig, uAccent, dotA);
  sig += (st2 - 0.5) * 0.035; // grain

  float show = smoothstep(0.2, 0.96, t);
  vec3 col = mix(dark, sig, show);
  col *= 1.0 - 0.10 * n * step(0.5, fract(frag.y / (3.0*uDpr)));
  vec2 vq = uv - 0.5;
  col *= 1.0 - dot(vq,vq) * 0.9 * (1.0 - show);
  gl_FragColor = vec4(col, 1.0);
}`;

function hex(h) {
  const v = parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function createSignal(canvas, opts = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  gl.getExtension('OES_standard_derivatives');

  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uRes', 'uTime', 'uTune', 'uDpr', 'uLens', 'uLock', 'uOut', 'uMouse', 'uText', 'uPaper', 'uInk', 'uNight', 'uAccent']
    .forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
  gl.uniform3fv(U.uPaper, hex('#efece6'));
  gl.uniform3fv(U.uInk, hex('#111110'));
  gl.uniform3fv(U.uNight, hex('#08080a'));
  gl.uniform3fv(U.uAccent, hex('#d4ff3a'));

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U.uText, 0);

  const text = document.createElement('canvas');
  const tctx = text.getContext('2d');
  const state = { tune: 0, lens: 0, lensTarget: 0, lock: 0, mx: -9999, my: -9999, w: 0, h: 0, dpr: 1, running: false, visible: true };
  const nameEl = opts.nameEl;

  function drawText() {
    const { w, h, dpr } = state;
    text.width = w; text.height = h;
    tctx.fillStyle = '#000'; tctx.fillRect(0, 0, w, h);
    // mirror the DOM h1 exactly so the fallback and the GL version share one layout
    const cs = getComputedStyle(nameEl);
    const r = nameEl.getBoundingClientRect();
    const host = canvas.getBoundingClientRect();
    const size = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight) || size * 0.86;
    const ls = parseFloat(cs.letterSpacing) || 0;
    tctx.font = `${cs.fontWeight} ${size * dpr}px ${cs.fontFamily}`;
    tctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in tctx) tctx.letterSpacing = `${ls * dpr}px`;
    const spans = nameEl.querySelectorAll('.w');
    spans.forEach((sp) => {
      const sr = sp.getBoundingClientRect();
      const x = (sr.left - host.left) * dpr;
      const em = sp.querySelector('em');
      const words = em ? sp.firstChild.textContent : sp.textContent;
      // CSS puts the baseline at half-leading + ascent inside each line box; do the same
      const m = tctx.measureText(words);
      const A = m.fontBoundingBoxAscent ?? size * dpr * 0.92;
      const D = m.fontBoundingBoxDescent ?? size * dpr * 0.24;
      const y = (sr.top - host.top) * dpr + (lh * dpr - (A + D)) / 2 + A;
      tctx.fillStyle = '#f00';
      tctx.fillText(words, x, y);
      if (em) {
        const wv = tctx.measureText(words).width;
        tctx.fillStyle = '#0f0';
        tctx.fillText(em.textContent, x + wv, y);
      }
    });
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, text);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, r.width < 700 ? 1.5 : 1.25);
    state.dpr = dpr;
    state.w = Math.max(2, Math.round(r.width * dpr));
    state.h = Math.max(2, Math.round(r.height * dpr));
    canvas.width = state.w; canvas.height = state.h;
    gl.viewport(0, 0, state.w, state.h);
    drawText();
  }

  const t0 = performance.now();
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!state.visible) return;
    state.lens += (state.lensTarget - state.lens) * 0.08;
    gl.uniform2f(U.uRes, state.w, state.h);
    gl.uniform1f(U.uTime, (now - t0) / 1000);
    gl.uniform1f(U.uTune, state.tune);
    gl.uniform1f(U.uDpr, state.dpr);
    gl.uniform1f(U.uLens, state.lens);
    gl.uniform1f(U.uLock, state.lock);
    gl.uniform1f(U.uOut, 0);
    gl.uniform2f(U.uMouse, state.mx * state.dpr, state.h - state.my * state.dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    state.mx = e.clientX - r.left; state.my = e.clientY - r.top;
    state.lensTarget = e.pointerType === 'touch' ? 0 : 1;
  }
  window.addEventListener('pointermove', pointer, { passive: true });
  document.addEventListener('pointerleave', () => (state.lensTarget = 0));

  const io = new IntersectionObserver(([en]) => (state.visible = en.isIntersecting), { threshold: 0 });
  io.observe(canvas);

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });

  resize();
  raf = requestAnimationFrame(frame);

  return {
    state,
    set tune(v) { state.tune = v; },
    get tune() { return state.tune; },
    set lock(v) { state.lock = v; },
    redraw: resize,
    destroy() { cancelAnimationFrame(raf); io.disconnect(); },
  };
}
