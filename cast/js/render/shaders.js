// GLSL for every FX layer object. All FX render additively onto black and
// then get bloomed, so colors here are HDR (values above 1 glow harder).

export const NOISE = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
vec3 fireRamp(float t) {
  t = clamp(t, 0.0, 1.5);
  return 0.62 * vec3(1.6, 0.34, 0.06) * smoothstep(0.0, 0.4, t)
       + 0.62 * vec3(0.25, 0.78, 0.14) * smoothstep(0.35, 0.78, t)
       + 0.62 * vec3(0.45, 0.55, 0.8) * smoothstep(0.75, 1.15, t);
}
`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const QUAD_HEAD = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec4 uParam;
uniform sampler2D uTex;
varying vec2 vUv;
${NOISE}
`;

// type -> fragment body
export const QUAD_FRAG = {
  // Burning plasma ball. uParam.x = white-hot amount.
  fireOrb: QUAD_HEAD + /* glsl */ `
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float n = fbm(vec3(cos(a) * 1.6, sin(a) * 1.6, uTime * 1.9 + uSeed - r * 2.0));
  float n2 = fbm(vec3(p * 3.0 + vec2(0.0, uTime * 1.4), uTime * 2.2 + uSeed * 3.0));
  float edge = 0.4 + 0.26 * n + 0.1 * n2;
  float body = 1.0 - smoothstep(edge * 0.5, edge, r);
  float tongues = smoothstep(edge + 0.38, edge - 0.04, r) * n2 * 1.2;
  float core = 1.0 - smoothstep(0.0, 0.3, r);
  float heat = body * 0.8 + tongues * 0.75 + core * (0.55 + uParam.x * 0.7);
  vec3 col = fireRamp(heat) * (body * 0.55 + tongues * 0.7 + core * 0.22);
  col += uColorA * exp(-r * 3.0) * 0.45;
  col *= uIntensity * (1.0 - smoothstep(0.82, 1.0, r));
  gl_FragColor = vec4(col, 1.0);
}`,

  // Accretion disk. uParam: x inner radius, y outer radius, z spin speed.
  voidDisk: QUAD_HEAD + /* glsl */ `
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float ri = uParam.x;
  float ro = uParam.y;
  float band = smoothstep(ri * 0.96, ri * 1.18, r) * (1.0 - smoothstep(ri * 1.25, ro, r));
  float sw = a + uTime * uParam.z - log(r + 0.05) * 3.2;
  float n = fbm(vec3(cos(sw) * 2.2, sin(sw) * 2.2, r * 5.0 - uTime * 0.8 + uSeed));
  float streak = pow(n, 2.1) * 2.4;
  float doppler = 0.6 + 0.6 * cos(a - 0.7 + uTime * 0.3);
  float rim = exp(-pow((r - ri * 1.1) / (ri * 0.1 + 0.01), 2.0));
  vec3 col = mix(uColorA, uColorB, clamp(streak, 0.0, 1.0)) * band * streak * doppler * 1.05;
  col += uColorB * rim * 1.3 * (0.7 + doppler * 0.5);
  col += uColorA * exp(-max(r - ri, 0.0) * 3.5) * 0.12 * step(ri, r);
  col *= uIntensity * (1.0 - smoothstep(0.88, 1.0, r));
  gl_FragColor = vec4(col, 1.0);
}`,

  // Glowing ring. uParam: x radius, y width, z noise breakup, w fire palette.
  ring: QUAD_HEAD + /* glsl */ `
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float n = fbm(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 2.0 + uSeed));
  float rr = uParam.x + (n - 0.5) * uParam.z;
  float k = exp(-pow((r - rr) / max(uParam.y, 0.002), 2.0));
  vec3 col = uParam.w > 0.5
    ? fireRamp(k * (0.55 + n * 0.9)) * k * 1.5
    : mix(uColorA, uColorB, k) * k * 1.5;
  col *= uIntensity * (1.0 - smoothstep(0.9, 1.0, r));
  gl_FragColor = vec4(col, 1.0);
}`,

  // Soft radial glow. uParam.x = falloff sharpness.
  glow: QUAD_HEAD + /* glsl */ `
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  float k = exp(-r2 * uParam.x);
  float core = exp(-r2 * uParam.x * 7.0);
  vec3 col = (uColorA * k + uColorB * core * 1.4) * 0.38 * uIntensity * (1.0 - smoothstep(0.7, 1.0, sqrt(r2)));
  gl_FragColor = vec4(col, 1.0);
}`,

  // Flame curtain. vUv.x runs along the wall; height grows upward on screen.
  // uParam.x = horizontal noise frequency.
  flameWall: QUAD_HEAD + /* glsl */ `
void main() {
  float h = 1.0 - vUv.y;
  float x = vUv.x;
  vec2 q = vec2(x * uParam.x, h * 1.7 - uTime * 2.1);
  float n = fbm(vec3(q, uTime * 0.45 + uSeed));
  float n2 = fbm(vec3(q * 2.4 + 7.0, uTime * 0.9 + uSeed));
  float tongue = n * 0.95 + n2 * 0.5;
  float reach = 0.18 + pow(tongue, 2.2) * 1.25;
  float body = 1.0 - smoothstep(0.0, 1.0, h / reach);
  float side = smoothstep(0.0, 0.08, x) * (1.0 - smoothstep(0.92, 1.0, x));
  float f = body * side;
  float heat = f * (0.45 + n2 * 0.55) + exp(-h * 9.0) * side * 0.25;
  vec3 col = fireRamp(heat * 1.15) * (f * 0.9 + 0.08 * side * exp(-h * 4.0)) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}`,

  // Magic circle texture with a charge arc. uParam: x charge, y arc radius, z arc width.
  sigil: QUAD_HEAD + /* glsl */ `
void main() {
  vec4 t = texture2D(uTex, vUv);
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.x, -p.y) / 6.2831853 + 0.5;
  float arc = step(a, uParam.x) * exp(-pow((r - uParam.y) / uParam.z, 2.0));
  float pulse = 0.82 + 0.18 * sin(uTime * 6.0 - r * 18.0);
  vec3 col = uColorA * t.a * pulse * 1.15 + uColorB * arc * 2.4;
  gl_FragColor = vec4(col * uIntensity, 1.0);
}`,
};

export const POINTS_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPR;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_PointSize = aSize * uPR;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const POINTS_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float k = exp(-r2 * 4.0) + exp(-r2 * 20.0) * 0.9;
  gl_FragColor = vec4(vColor * k, 1.0);
}
`;

// Shared by streak sparks, ribbon trails and the energy hand.
export const STRIP_VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec2 aUv;
attribute float aKind;
varying vec3 vColor;
varying vec2 vUv2;
varying float vKind;
void main() {
  vColor = aColor;
  vUv2 = aUv;
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// aUv.x: 1 at the spark head, 0 at its tail. aUv.y: 0..1 across.
export const STREAK_FRAG = /* glsl */ `
varying vec3 vColor;
varying vec2 vUv2;
void main() {
  float across = 1.0 - abs(vUv2.y * 2.0 - 1.0);
  float k = across * across * vUv2.x;
  gl_FragColor = vec4(vColor * k * 1.6, 1.0);
}
`;

// aUv.x: 0 at the trail head, 1 at the tail.
export const TRAIL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
uniform float uFire;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv2;
${NOISE}
void main() {
  float along = vUv2.x;
  float across = abs(vUv2.y * 2.0 - 1.0);
  float n = fbm(vec3(along * 7.0 - uTime * 5.0, vUv2.y * 3.0, uSeed));
  float core = 1.0 - smoothstep(0.0, 0.95, across);
  float body = pow(core, 1.4) * (1.0 - along) * (0.5 + n * 1.0);
  vec3 col = uFire > 0.5
    ? fireRamp(body * 1.5) * body * 1.7
    : mix(uColorA, uColorB, body) * body * 1.8;
  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

// Glowing skeleton. aKind: 0 bone ribbon, 1 joint sprite. aColor.x = hand index.
export const BONES_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uLevel;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec3 vColor;
varying vec2 vUv2;
varying float vKind;
void main() {
  float level = vColor.x < 0.5 ? uLevel.x : uLevel.y;
  vec3 col;
  if (vKind < 0.5) {
    float across = abs(vUv2.y * 2.0 - 1.0);
    float core = exp(-across * across * 8.0);
    float flow = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(vUv2.x * 10.0 - uTime * 16.0), 3.0);
    col = mix(uColorA, uColorB, core) * core * flow * 1.3;
  } else {
    vec2 c = vUv2 * 2.0 - 1.0;
    float r2 = dot(c, c);
    col = uColorB * (exp(-r2 * 6.0) * 1.3 + exp(-r2 * 30.0));
  }
  gl_FragColor = vec4(col * level, 1.0);
}
`;
