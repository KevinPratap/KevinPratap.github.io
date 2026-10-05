// Work reel: screenshots on a curved ribbon. Scroll moves it; speed bends it,
// ripples it and splits its colour. Raw WebGL, one mesh drawn once per card.

const VERT = `
attribute vec2 aPos;
uniform vec2 uSize;
uniform float uX, uVel, uTime, uR;
uniform mat4 uProj;
varying vec2 vUv;
varying float vShade;
void main(){
  vec2 p = aPos * uSize;
  float wx = p.x + uX;
  float ang = wx / uR;
  vec3 w = vec3(sin(ang) * uR, p.y, (cos(ang) - 1.0) * uR);
  // speed ripples the strip like cloth and pushes the middle forward
  w.y += sin(wx * 1.4 + uTime * 3.0) * uVel * 0.12;
  w.z += uVel * 0.25 * cos(aPos.y * 3.14159) * cos(aPos.x * 3.14159);
  vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y);
  vShade = cos(ang);
  gl_Position = uProj * vec4(w.x, w.y, w.z - 5.2, 1.0);
}`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform float uVel, uImgAspect, uCardAspect, uFocus, uRound;
uniform vec2 uSize;
varying vec2 vUv;
varying float vShade;
float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  // cover-fit the screenshot into the card, then zoom slightly out as it comes into focus
  vec2 uv = vUv - 0.5;
  float ia = uImgAspect, ca = uCardAspect;
  if (ia > ca) uv.x *= ca / ia; else uv.y *= ia / ca;
  uv *= mix(0.86, 0.97, uFocus);
  uv += 0.5;
  float s = clamp(abs(uVel), 0.0, 1.0) * 0.018 + 0.0015;
  vec3 c;
  c.r = texture2D(uTex, uv + vec2(s, 0.0)).r;
  c.g = texture2D(uTex, uv).g;
  c.b = texture2D(uTex, uv - vec2(s, 0.0)).b;
  // rounded corners in card space
  vec2 cp = (vUv - 0.5) * uSize;
  float d = rbox(cp, uSize * 0.5, uRound);
  float a = 1.0 - smoothstep(-0.004, 0.004, d);
  float shade = mix(0.32, 1.0, uFocus) * mix(0.55, 1.0, vShade);
  gl_FragColor = vec4(c * shade, a);
}`;

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function createReel(canvas, items) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // subdivided plane, -0.5..0.5
  const SX = 40, SY = 10, verts = [], idx = [];
  for (let y = 0; y <= SY; y++) for (let x = 0; x <= SX; x++) verts.push(x / SX - 0.5, y / SY - 0.5);
  for (let y = 0; y < SY; y++) for (let x = 0; x < SX; x++) {
    const i = y * (SX + 1) + x;
    idx.push(i, i + 1, i + SX + 1, i + 1, i + SX + 2, i + SX + 1);
  }
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uSize', 'uX', 'uVel', 'uTime', 'uR', 'uProj', 'uTex', 'uImgAspect', 'uCardAspect', 'uFocus', 'uRound'].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
  gl.uniform1i(U.uTex, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const cards = items.map((it) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 24, 255]));
    const c = { ...it, tex, aspect: 1.5, focus: 0 };
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      c.aspect = img.naturalWidth / img.naturalHeight;
    };
    img.src = it.src;
    return c;
  });

  const st = { w: 0, h: 0, viewW: 1, viewH: 1, cardW: 2.6, cardH: 1.9, gap: 0.5, target: 0, cur: 0, vel: 0, visible: false, center: 0 };
  let raf = 0;
  const t0 = performance.now();

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    st.w = canvas.width = Math.round(r.width * dpr);
    st.h = canvas.height = Math.round(r.height * dpr);
    gl.viewport(0, 0, st.w, st.h);
    const aspect = r.width / r.height;
    const fov = 38 * Math.PI / 180;
    gl.uniformMatrix4fv(U.uProj, false, perspective(fov, aspect, 0.1, 50));
    st.viewH = 2 * 5.2 * Math.tan(fov / 2);
    st.viewW = st.viewH * aspect;
    const portrait = aspect < 0.9;
    st.cardH = portrait ? st.viewH * 0.42 : st.viewH * 0.5;
    st.cardW = portrait ? Math.min(st.viewW * 0.8, st.cardH * 0.8) : st.cardH * 1.42;
    st.gap = st.cardW * 0.16;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!st.visible) return;
    const time = (now - t0) / 1000;
    const prev = st.cur;
    st.cur += (st.target - st.cur) * 0.085;
    const v = (st.cur - prev) * 9;
    st.vel += (v - st.vel) * 0.12;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const step = st.cardW + st.gap;
    const R = Math.max(st.viewW * 0.9, 4);
    gl.uniform1f(U.uVel, st.vel);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uR, R);
    gl.uniform2f(U.uSize, st.cardW, st.cardH);
    gl.uniform1f(U.uCardAspect, st.cardW / st.cardH);
    gl.uniform1f(U.uRound, st.cardH * 0.035);
    // draw back to front so the focused card sits on top
    const order = cards.map((c, i) => ({ c, x: i * step - st.cur * step })).sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
    for (const { c, x } of order) {
      if (Math.abs(x) > R * 1.6) continue;
      const f = Math.max(0, 1 - Math.abs(x) / step);
      c.focus += (f - c.focus) * 0.15;
      gl.bindTexture(gl.TEXTURE_2D, c.tex);
      gl.uniform1f(U.uX, x);
      gl.uniform1f(U.uImgAspect, c.aspect);
      gl.uniform1f(U.uFocus, c.focus);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    }
    st.center = Math.round(st.cur);
  }

  const io = new IntersectionObserver(([e]) => (st.visible = e.isIntersecting), { threshold: 0 });
  io.observe(canvas);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  resize();
  raf = requestAnimationFrame(frame);

  return {
    // position in card units: 0 = first card centered, n-1 = last
    set(p) { st.target = p; },
    get index() { return Math.max(0, Math.min(cards.length - 1, Math.round(st.cur))); },
    get velocity() { return st.vel; },
    count: cards.length,
  };
}
