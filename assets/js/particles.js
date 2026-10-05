// One canvas, one cloud of particles. It always holds two shapes, A and B,
// and a single number t that morphs between them. Everything else on the
// site is just choosing which A, which B, and where t is.

const VERT = `
precision highp float;
attribute vec3 aPosA;
attribute vec3 aColA;
attribute vec3 aPosB;
attribute vec3 aColB;
attribute vec4 aRnd;

uniform mat4 uProj;
uniform float uCamZ, uT, uTime, uSwirl, uDpr, uVel;
uniform vec3 uCenA, uCenB, uScaA, uScaB;
uniform vec4 uMotA, uMotB;   // spin, flow, base tilt, mouse depth
uniform vec4 uLookA, uLookB; // size px, softness, alpha, brightness
uniform float uAddA, uAddB;  // 0 = normal blend, 1 = additive glow
uniform vec2 uMouse;
uniform float uMouseR, uMouseF;
uniform vec2 uTilt;

varying vec3 vCol;
varying float vAlpha, vSoft, vAdd;

vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }

vec3 place(vec3 q, vec3 cen, vec3 sca, vec4 mot, out float edge){
  vec3 p = q;
  edge = 1.0;
  if (mot.y != 0.0) {
    // most particles travel along the wave and wrap; the stations ride it in place
    if (aRnd.w < 0.8) {
      p.x = fract(p.x + 0.5 + uTime * mot.y * (0.55 + aRnd.y * 0.9)) - 0.5;
      edge = smoothstep(0.5, 0.4, abs(p.x));
    }
    p.y = sin(p.x * 7.854 + uTime * 0.45) * 0.16 + q.y;
  }
  p = rotY(p, uTime * mot.x + uTilt.x * mot.w);
  p = rotX(p, mot.z + uTilt.y * mot.w);
  return cen + p * sca;
}

void main(){
  // each particle leaves a little late, so a morph sweeps instead of snapping
  float d = aRnd.x * 0.32 + clamp(0.5 - aPosA.y, 0.0, 1.0) * 0.18;
  float tt = clamp((uT - d) / 0.5, 0.0, 1.0);
  tt = tt * tt * (3.0 - 2.0 * tt);

  float eA, eB;
  vec3 a = place(aPosA, uCenA, uScaA, uMotA, eA);
  vec3 b = place(aPosB, uCenB, uScaB, uMotB, eB);
  vec3 p = mix(a, b, tt);

  // in flight, particles curl through space
  float arc = sin(3.14159 * tt);
  vec3 sw = vec3(
    sin(p.y * 1.3 + uTime * 0.7 + aRnd.y * 6.28),
    sin(p.x * 1.1 - uTime * 0.6 + aRnd.z * 6.28),
    cos(p.x * 0.9 + p.y * 0.8 + uTime * 0.5 + aRnd.x * 6.28)
  ) * (0.5 + aRnd.x);
  p += sw * arc * uSwirl;
  p.z += arc * (aRnd.y - 0.5) * 3.0 * uSwirl;

  // breathing, and a stretch when the page is thrown
  p.xy += vec2(sin(uTime * 0.9 + aRnd.x * 40.0), cos(uTime * 0.8 + aRnd.y * 40.0)) * 0.004;
  p.y += uVel * (aRnd.y - 0.5) * 0.5;

  // the cursor pushes particles aside and towards the camera
  vec2 dm = p.xy - uMouse;
  float fm = exp(-dot(dm, dm) / (uMouseR * uMouseR)) * uMouseF;
  p.xy += normalize(dm + 1e-5) * fm * uMouseR * 0.9;
  p.z += fm * 0.8;

  vec4 look = mix(uLookA, uLookB, tt);
  float persp = uCamZ / max(0.5, uCamZ - p.z);
  gl_Position = uProj * vec4(p.x, p.y, p.z - uCamZ, 1.0);
  gl_PointSize = max(1.0, look.x * uDpr * persp * (1.0 - arc * 0.4) * (1.0 + fm * 0.6));

  vCol = mix(aColA, aColB, tt) * look.w * (1.0 + fm * 0.5);
  vAlpha = look.z * mix(eA, eB, tt);
  vSoft = look.y;
  vAdd = mix(uAddA, uAddB, tt);
}`;

const FRAG = `
precision highp float;
varying vec3 vCol;
varying float vAlpha, vSoft, vAdd;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float circ = 1.0 - smoothstep(0.5 - vSoft * 0.42 - 0.02, 0.5, r);
  float a = (vSoft < 0.05 ? 1.0 : circ) * vAlpha;
  if (a < 0.01) discard;
  // premultiplied: alpha channel decides between normal and additive blending
  gl_FragColor = vec4(vCol * a, a * (1.0 - vAdd));
}`;

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export const CAM_Z = 10;
export const FOV = 35 * Math.PI / 180;

export function createParticles(canvas, N) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);

  const rnd = new Float32Array(N * 4);
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();

  const attr = (name, size, data, usage) => {
    const loc = gl.getAttribLocation(prog, name);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  };
  const empty = new Float32Array(N * 3);
  const B = {
    posA: attr('aPosA', 3, empty, gl.DYNAMIC_DRAW),
    colA: attr('aColA', 3, empty, gl.DYNAMIC_DRAW),
    posB: attr('aPosB', 3, empty, gl.DYNAMIC_DRAW),
    colB: attr('aColB', 3, empty, gl.DYNAMIC_DRAW),
  };
  attr('aRnd', 4, rnd, gl.STATIC_DRAW);

  const U = {};
  ['uProj', 'uCamZ', 'uT', 'uTime', 'uSwirl', 'uDpr', 'uVel', 'uCenA', 'uCenB', 'uScaA', 'uScaB', 'uMotA', 'uMotB',
    'uLookA', 'uLookB', 'uAddA', 'uAddB', 'uMouse', 'uMouseR', 'uMouseF', 'uTilt']
    .forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const view = { w: 1, h: 1, dpr: 1, worldH: 1, pxToWorld: 1, quality: 1 };
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, innerWidth < 760 ? 1.75 : 1.5) * view.quality;
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniformMatrix4fv(U.uProj, false, perspective(FOV, w / h, 0.1, 100));
    gl.uniform1f(U.uCamZ, CAM_Z);
    gl.uniform1f(U.uDpr, dpr);
    view.w = w; view.h = h; view.dpr = dpr;
    view.worldH = 2 * CAM_Z * Math.tan(FOV / 2);
    view.pxToWorld = view.worldH / h;
  }
  resize();

  let a = null, b = null;
  const upload = (buf, data) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); };

  return {
    N, rnd, view, resize,
    setQuality(q) { view.quality = q; resize(); },
    setPair(shapeA, shapeB) {
      if (shapeA !== a) { upload(B.posA, shapeA.pos); upload(B.colA, shapeA.col); a = shapeA; }
      if (shapeB !== b) { upload(B.posB, shapeB.pos); upload(B.colB, shapeB.col); b = shapeB; }
    },
    // p: { t, time, swirl, vel, A:{cen,sca,mot,look,add}, B:{...}, mouse:[x,y], mouseR, mouseF, tilt:[x,y], bg:[r,g,b] }
    draw(p) {
      gl.clearColor(p.bg[0], p.bg[1], p.bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uT, p.t);
      gl.uniform1f(U.uTime, p.time);
      gl.uniform1f(U.uSwirl, p.swirl);
      gl.uniform1f(U.uVel, p.vel);
      gl.uniform3fv(U.uCenA, p.A.cen); gl.uniform3fv(U.uScaA, p.A.sca);
      gl.uniform3fv(U.uCenB, p.B.cen); gl.uniform3fv(U.uScaB, p.B.sca);
      gl.uniform4fv(U.uMotA, p.A.mot); gl.uniform4fv(U.uMotB, p.B.mot);
      gl.uniform4fv(U.uLookA, p.A.look); gl.uniform4fv(U.uLookB, p.B.look);
      gl.uniform1f(U.uAddA, p.A.add); gl.uniform1f(U.uAddB, p.B.add);
      gl.uniform2fv(U.uMouse, p.mouse);
      gl.uniform1f(U.uMouseR, p.mouseR);
      gl.uniform1f(U.uMouseF, p.mouseF);
      gl.uniform2fv(U.uTilt, p.tilt);
      gl.drawArrays(gl.POINTS, 0, N);
    },
  };
}
