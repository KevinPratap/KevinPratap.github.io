import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../config.js';
import { clamp } from '../util.js';

const MAXD = 10;
const TYPE = { shock: 0, lens: 1, heat: 2, swirl: 3, tear: 4 };

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tVideo;
uniform sampler2D tFx;
uniform vec2 uRes;
uniform vec2 uVidSize;
uniform vec2 uVidOff;
uniform float uTime;
uniform vec2 uShake;
uniform float uZoom;
uniform vec2 uZoomC;
uniform float uCA;
uniform float uFlash;
uniform vec3 uFlashCol;
uniform float uImpact;
uniform vec3 uImpactCol;
uniform float uDim;
uniform vec3 uGrade;
uniform float uGradeAmt;
uniform float uVignette;
uniform float uGrain;
uniform vec3 uRimCol;
uniform float uFade;
uniform float uFlare;
uniform vec3 uFlareCol;
uniform float uGlitch;
uniform float uGhost;
uniform float uGhostOff;
uniform float uEdge;
uniform vec3 uEdgeCol;
uniform vec4 uD[${MAXD}];
uniform vec4 uDP[${MAXD}];
varying vec2 vUv;

vec2 vidUv(vec2 sp) { vec2 vn = (sp - uVidOff) / uVidSize; return vec2(1.0 - vn.x, 1.0 - vn.y); }
vec2 fxUv(vec2 sp) { return vec2(sp.x / uRes.x, 1.0 - sp.y / uRes.y); }
float sq(float x) { return x * x; }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  px = uZoomC + (px - uZoomC) / uZoom;
  px += uShake;
  vec2 p = px;
  float horizon = 0.0;
  float rim = 0.0;
  float portal = 0.0;
  float tear = 0.0;
  float ca = uCA;

  if (uGlitch > 0.0) {
    // Horizontal slice displacement, like a video signal tearing.
    float band = floor(px.y / 18.0 + floor(uTime * 24.0) * 7.0);
    float h = hash12(vec2(band, floor(uTime * 24.0)));
    if (h > 0.62) px.x += (hash12(vec2(band, 3.1)) - 0.5) * 220.0 * uGlitch;
    ca += uGlitch * 10.0;
  }

  for (int i = 0; i < ${MAXD}; i++) {
    vec4 d = uD[i];
    vec4 q = uDP[i];
    if (d.w == 0.0) continue;
    vec2 dv = px - d.xy;
    float r = length(dv);
    vec2 dir = dv / max(r, 0.001);
    if (q.x < 0.5) {
      // expanding shockwave ring
      float k = 1.0 - smoothstep(0.0, q.y, abs(r - d.z));
      p -= dir * k * d.w;
      ca += k * abs(d.w) * 0.22;
    } else if (q.x < 1.5) {
      // gravitational lens + event horizon
      float fall = 1.0 - smoothstep(d.z * 2.5, d.z * 7.0, r);
      p -= dir * (d.w * d.z * d.z / max(r, 1.0)) * fall;
      float hr = q.w;
      float inside = 1.0 - smoothstep(hr * 0.9, hr * 1.03, r);
      horizon = max(horizon, inside);
      rim += exp(-sq((r - hr * 1.06) / (hr * 0.07 + 1.5))) * min(d.w, 1.0) * 0.9;
      if (q.z > 0.0 && inside > 0.0) {
        // portal interior: a slowly spiraling starfield
        float rn = r / max(hr, 1.0);
        float ang = atan(dv.y, dv.x) + uTime * 0.5 + 1.6 / (rn + 0.25);
        vec2 sp = vec2(cos(ang), sin(ang)) * rn * 10.0;
        float star = step(0.9, hash12(floor(sp))) * (1.0 - smoothstep(0.0, 0.32, length(fract(sp) - 0.5)));
        float fog = 0.5 + 0.5 * sin(ang * 3.0 + rn * 7.0 - uTime * 2.2);
        portal += inside * q.z * (star * 1.3 + fog * 0.22 * (1.0 - rn * 0.7));
      }
    } else if (q.x < 2.5) {
      // heat haze
      float fall = 1.0 - smoothstep(d.z * 0.25, d.z, r);
      p += vec2(sin(px.y * 0.085 + uTime * 11.0 + q.z), cos(px.x * 0.075 + uTime * 9.0 + q.z)) * d.w * fall;
    } else if (q.x < 3.5) {
      // vortex swirl
      float fall = 1.0 - smoothstep(0.0, d.z, r);
      float ang = d.w * fall * fall;
      float s = sin(ang);
      float c = cos(ang);
      p = d.xy + mat2(c, -s, s, c) * (p - d.xy);
    } else {
      // space tear: the two sides of a line slide apart and the crack glows
      vec2 t = vec2(cos(q.y), sin(q.y));
      vec2 nrm = vec2(-t.y, t.x);
      float along = dot(dv, t);
      float perp = dot(dv, nrm);
      float ext = 1.0 - smoothstep(d.z * 0.55, d.z, abs(along));
      float side = perp < 0.0 ? -1.0 : 1.0;
      float fall = exp(-abs(perp) / (d.z * 0.7 + 1.0));
      p -= (t * side * 0.8 + nrm * side * 0.45) * d.w * ext * fall;
      float gap = q.w * ext;
      float crack = 1.0 - smoothstep(gap * 0.5, gap, abs(perp));
      horizon = max(horizon, crack * 0.92);
      tear += (exp(-sq(abs(perp) - gap * 0.75) / (gap * 0.5 + 1.5)) * 1.4 + crack * 0.25) * ext * q.z;
      ca += ext * fall * 4.0 * q.z;
    }
  }

  vec2 cv = px - uRes * 0.5;
  vec2 o = cv / max(length(cv), 1.0) * ca;
  vec3 vid = vec3(
    texture2D(tVideo, vidUv(p + o)).r,
    texture2D(tVideo, vidUv(p)).g,
    texture2D(tVideo, vidUv(p - o)).b);
  float l = dot(vid, vec3(0.299, 0.587, 0.114));
  vec3 g = mix(vid, vec3(l), uDim * 0.75);
  g *= 1.0 - uDim * 0.62;
  g = mix(g, g * uGrade, uGradeAmt);
  g *= 1.0 - horizon;
  if (uGhost > 0.0) {
    // afterimages: copies of the frame sliding out to both sides
    vec3 ga = texture2D(tVideo, vidUv(p + vec2(uGhostOff, 0.0))).rgb;
    vec3 gb = texture2D(tVideo, vidUv(p - vec2(uGhostOff * 0.6, 0.0))).rgb;
    vec3 tint = mix(vec3(1.0), uRimCol, 0.6);
    g = mix(g, max(g, (ga * 0.6 + gb * 0.4) * tint * 1.25), uGhost);
  }

  vec3 fx = vec3(
    texture2D(tFx, fxUv(p + o)).r,
    texture2D(tFx, fxUv(p)).g,
    texture2D(tFx, fxUv(p - o)).b);
  vec3 col = g + fx * (1.0 - horizon) + uRimCol * (rim + portal) + uRimCol * tear;

  if (uFlare > 0.0) {
    // Anamorphic streak: bright FX smeared sideways.
    // Only a thin sliver of very bright light streaks, and the taps are
    // averaged so big bright areas don't pile up into white.
    vec3 fl = vec3(0.0);
    for (int k = 1; k <= 4; k++) {
      float o2 = float(k * k) * 22.0;
      fl += max(texture2D(tFx, fxUv(p + vec2(o2, 0.0))).rgb - 1.1, 0.0) / float(k);
      fl += max(texture2D(tFx, fxUv(p - vec2(o2, 0.0))).rgb - 1.1, 0.0) / float(k);
    }
    col += min(dot(fl, vec3(0.33)) / 4.17, 0.6) * uFlareCol * uFlare;
  }
  if (uEdge > 0.0) {
    // Power-up aura licking in from the screen edges.
    vec2 e = abs(vUv - 0.5) * 2.0;
    float edge = max(e.x, e.y);
    float flick = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 13.0) * sin(vUv.y * 31.0 - uTime * 17.0);
    col += uEdgeCol * smoothstep(0.62, 1.0, edge) * flick * uEdge;
  }

  vec2 vc = vUv - 0.5;
  col *= 1.0 - dot(vc, vc) * uVignette;
  col = mix(col, uFlashCol, clamp(uFlash, 0.0, 1.0));
  if (uImpact > 0.0) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 imp = mix(uImpactCol, vec3(0.03, 0.02, 0.05), step(0.45, lum));
    col = mix(col, imp, uImpact);
  }
  col += (hash12(px + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;
  col *= uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Screen-level camera effects that any move can trigger.
export const Post = {
  trauma: 0,
  flash: 0, flashCol: [1, 1, 1],
  impactT: 0, impactCol: [1, 1, 1],
  zoom: 1, zoomVel: 0, zoomC: { x: 0, y: 0 },
  ca: 0,
  dim: 0, dimTarget: 0,
  bloomBoost: 0,
  fade: 1, fadeTarget: 1,
  grade: [1, 1, 1], rim: [0.8, 0.7, 1],
  transients: [],
  persistent: [],
  freezeT: 0, glitch: 0, ghost: 0, ghostOff: 0, ghostVel: 0, edge: 0, edgeTarget: 0, edgeCol: [1, 0.8, 0.2], flare: 0.5, flareCol: [1, 1, 1],

  // Hit-stop: slows the simulation for a beat on big impacts.
  freeze(t) { this.freezeT = Math.max(this.freezeT, t); },
  get timeScale() { return this.freezeT > 0 ? 0.07 : 1; },
  afterimage(amount, speed = 900) { this.ghost = Math.max(this.ghost, amount); this.ghostOff = 0; this.ghostVel = speed; },
  glitchFor(amount) { this.glitch = Math.max(this.glitch, amount); },
  wantEdge(x, col) { if (x > this.edgeTarget) { this.edgeTarget = x; if (col) this.edgeCol = col; } },
  // A slash through space from (x0,y0) to (x1,y1).
  tear({ x0, y0, x1, y1, strength = 26, life = 1.4, width = 10 }) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    this.transients.push({ type: TYPE.tear, x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: len / 2 + 30, speed: 0,
      width, strength, life, t: 0, ang: Math.atan2(y1 - y0, x1 - x0) });
  },

  shake(t) { this.trauma = Math.min(1, this.trauma + t); },
  flashScreen(amount, col = [1, 1, 1]) {
    if (amount >= this.flash) this.flashCol = col;
    this.flash = Math.max(this.flash, amount);
  },
  impact(dur = 0.1, col = [1, 1, 1]) { this.impactT = Math.max(this.impactT, dur); this.impactCol = col; },
  punch(amount, x, y) {
    this.zoomVel += amount;
    if (x !== undefined) { this.zoomC.x = x; this.zoomC.y = y; }
  },
  aberrate(px) { this.ca = Math.max(this.ca, px); },
  bloom(amount) { this.bloomBoost = Math.max(this.bloomBoost, amount); },
  wantDim(x) { this.dimTarget = Math.max(this.dimTarget, x); },

  shockwave({ x, y, speed = 900, width = 60, strength = 26, life = 0.7, r = 0 }) {
    this.transients.push({ type: TYPE.shock, x, y, r, speed, width, strength, life, t: 0 });
  },
  // Long-lived source an engine moves around each frame. Set strength 0 to hide.
  source(type) {
    const s = { type: TYPE[type], x: 0, y: 0, radius: 100, strength: 0, width: 40, horizon: 0, seed: Math.random() * 100 };
    this.persistent.push(s);
    return s;
  },
  clearSources() { this.persistent.length = 0; this.transients.length = 0; },
};

export class Pipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    this.pr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
    this.renderer.setPixelRatio(this.pr);

    this.fxScene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1000, 1000);

    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderToScreen = false;
    this.composer.addPass(new RenderPass(this.fxScene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.42, 0.38);
    this.composer.addPass(this.bloomPass);

    this.uniforms = {
      tVideo: { value: null },
      tFx: { value: null },
      uRes: { value: new THREE.Vector2(w, h) },
      uVidSize: { value: new THREE.Vector2(w, h) },
      uVidOff: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uShake: { value: new THREE.Vector2() },
      uZoom: { value: 1 },
      uZoomC: { value: new THREE.Vector2(w / 2, h / 2) },
      uCA: { value: 0 },
      uFlash: { value: 0 },
      uFlashCol: { value: new THREE.Color(1, 1, 1) },
      uImpact: { value: 0 },
      uImpactCol: { value: new THREE.Color(1, 1, 1) },
      uDim: { value: 0 },
      uGrade: { value: new THREE.Vector3(1, 1, 1) },
      uGradeAmt: { value: 0.55 },
      uVignette: { value: 0.6 },
      uGrain: { value: 0.035 },
      uRimCol: { value: new THREE.Color(0.8, 0.7, 1) },
      uFade: { value: 1 },
      uFlare: { value: 0.5 },
      uFlareCol: { value: new THREE.Color(1, 1, 1) },
      uGlitch: { value: 0 },
      uGhost: { value: 0 },
      uGhostOff: { value: 0 },
      uEdge: { value: 0 },
      uEdgeCol: { value: new THREE.Color(1, 0.8, 0.2) },
      uD: { value: Array.from({ length: MAXD }, () => new THREE.Vector4()) },
      uDP: { value: Array.from({ length: MAXD }, () => new THREE.Vector4()) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.compScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.compScene.add(quad);
    this.compCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.frameAvg = 16;
    this.slowFrames = 0;
    this.resize();
  }

  setVideoSource(texture, vw, vh, projector) {
    this.uniforms.tVideo.value = texture;
    projector.setVideo(vw, vh);
    this.projector = projector;
    this.resize();
  }

  setCharacter(ch) {
    Post.grade = ch.grade;
    Post.rim = ch.b;
    Post.flareCol = ch.b;
    this.uniforms.uGrade.value.set(...ch.grade);
    this.uniforms.uRimCol.value.setRGB(...ch.b);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(w, h);
    this.camera.right = w;
    this.camera.bottom = h;
    this.camera.updateProjectionMatrix();
    this.uniforms.uRes.value.set(w, h);
    if (this.projector) {
      this.projector.resize();
      const P = this.projector;
      this.uniforms.uVidSize.value.set(P.vw * P.s, P.vh * P.s);
      this.uniforms.uVidOff.value.set(P.ox, P.oy);
    }
  }

  // Drops resolution when the device can't keep up.
  watchPerf(dtMs) {
    this.frameAvg += (dtMs - this.frameAvg) * 0.05;
    if (this.frameAvg > CONFIG.slowFrameMs && this.pr > CONFIG.minPixelRatio) {
      if (++this.slowFrames > 90) {
        this.pr = Math.max(CONFIG.minPixelRatio, this.pr - 0.25);
        this.slowFrames = 0;
        this.frameAvg = 16;
        this.resize();
      }
    } else {
      this.slowFrames = 0;
    }
  }

  stepPost(dt) {
    const P = Post;
    P.trauma = Math.max(0, P.trauma - dt * 1.5);
    const sh = P.trauma * P.trauma * 30;
    this.uniforms.uShake.value.set((Math.random() * 2 - 1) * sh, (Math.random() * 2 - 1) * sh);
    P.flash *= Math.exp(-dt * 8);
    P.impactT = Math.max(0, P.impactT - dt);
    P.zoomVel += (-(P.zoom - 1) * 280 - P.zoomVel * 17) * dt;
    P.zoom = clamp(P.zoom + P.zoomVel * dt, 0.8, 1.6);
    P.ca *= Math.exp(-dt * 6);
    P.dim += (P.dimTarget - P.dim) * (1 - Math.exp(-dt * 5));
    P.dimTarget = 0;
    P.bloomBoost *= Math.exp(-dt * 4);
    P.fade += (P.fadeTarget - P.fade) * (1 - Math.exp(-dt * 4));
    P.freezeT = Math.max(0, P.freezeT - dt);
    P.glitch *= Math.exp(-dt * 7);
    P.ghost *= Math.exp(-dt * 3.2);
    if (P.ghost < 0.01) P.ghost = 0;
    P.ghostOff += P.ghostVel * dt;
    P.ghostVel *= Math.exp(-dt * 4);
    if (P.glitch < 0.01) P.glitch = 0;
    P.edge += (P.edgeTarget - P.edge) * (1 - Math.exp(-dt * 5));
    P.edgeTarget = 0;

    const u = this.uniforms;
    u.uFlash.value = P.flash;
    u.uFlashCol.value.setRGB(...P.flashCol);
    u.uImpact.value = P.impactT > 0 ? 1 : 0;
    u.uImpactCol.value.setRGB(...P.impactCol);
    u.uZoom.value = P.zoom;
    u.uZoomC.value.set(P.zoomC.x || window.innerWidth / 2, P.zoomC.y || window.innerHeight / 2);
    u.uCA.value = P.ca;
    u.uDim.value = P.dim;
    u.uVignette.value = 0.55 + P.dim * 1.1;
    u.uFade.value = P.fade;
    u.uFlare.value = 0.5 + P.bloomBoost * 0.2;
    u.uFlareCol.value.setRGB(...P.flareCol);
    u.uGlitch.value = P.glitch;
    u.uGhost.value = P.ghost;
    u.uGhostOff.value = P.ghostOff;
    u.uEdge.value = P.edge;
    u.uEdgeCol.value.setRGB(...P.edgeCol);
    this.bloomPass.strength = 0.6 + P.bloomBoost * 0.4 + P.dim * 0.15;

    for (let i = P.transients.length - 1; i >= 0; i--) {
      const s = P.transients[i];
      s.t += dt;
      s.r += s.speed * dt;
      if (s.t >= s.life) P.transients.splice(i, 1);
    }
    let n = 0;
    const D = u.uD.value, DP = u.uDP.value;
    for (const s of P.persistent) {
      if (n >= MAXD) break;
      if (!s.strength) continue;
      D[n].set(s.x, s.y, s.radius, s.strength);
      DP[n].set(s.type, s.width, s.seed, s.horizon);
      n++;
    }
    for (const s of P.transients) {
      if (n >= MAXD) break;
      if (s.type === TYPE.tear) {
        // opens in a snap, hangs, then seals up
        const open = Math.min(1, s.t / 0.07);
        const heal = s.t < s.life * 0.4 ? 1 : Math.pow(1 - (s.t - s.life * 0.4) / (s.life * 0.6), 2);
        const k = open * heal;
        D[n].set(s.x, s.y, s.r, s.strength * k);
        DP[n].set(s.type, s.ang, 1.2 * k + (s.t < 0.12 ? 1.5 : 0), s.width * k);
      } else {
        const k = 1 - s.t / s.life;
        D[n].set(s.x, s.y, s.r, s.strength * k * k);
        DP[n].set(s.type, s.width, 0, 0);
      }
      n++;
    }
    for (; n < MAXD; n++) D[n].set(0, 0, 0, 0);
  }

  render(dt, time) {
    this.uniforms.uTime.value = time;
    this.stepPost(dt);
    this.composer.render(dt);
    this.uniforms.tFx.value = this.composer.readBuffer.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.compScene, this.compCamera);
  }
}
