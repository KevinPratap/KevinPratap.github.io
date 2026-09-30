// Person silhouette for the full-body aura. MediaPipe's selfie segmenter
// runs a few times a second and its mask lands in a small canvas that the
// compositor samples, so the aura hugs your outline like a transformation.
import * as THREE from 'three';
import { Projector } from './tracking.js';

const TASKS_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

export class Body {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.g = this.canvas.getContext('2d', { willReadFrequently: false });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.seg = null;
    this.ready = false;
    this.loading = false;
    this.lastTs = 0;
    this.interval = 1000 / 15;
    this.img = null;
    this.mdata = null; this.mw = 0; this.mh = 0;
    // Where you are, in screen px: body centre, top of your head, face.
    this._info = { ok: false, cx: 0, cy: 0, top: 0, hx: 0, hy: 0, w: 0 };
    this.norm = null;
  }

  // Scan the mask coarsely for the person: the topmost rows are the head.
  locate() {
    const d = this.mdata, w = this.mw, h = this.mh;
    if (!d) return;
    const st = Math.max(1, (w / 64) | 0);
    let top = -1, sx = 0, sy = 0, n = 0, minX = w, maxX = 0;
    for (let y = 0; y < h; y += st) {
      for (let x = 0; x < w; x += st) {
        if (d[y * w + x] > 0.5) {
          if (top < 0) top = y;
          sx += x; sy += y; n++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
        }
      }
    }
    if (n < 20) { this.norm = null; return; }
    // head: the person pixels in the band just under the top
    let hx = 0, hn = 0;
    const band = top + Math.max(st, (h * 0.12) | 0);
    for (let y = top; y < band && y < h; y += st) for (let x = 0; x < w; x += st) if (d[y * w + x] > 0.5) { hx += x; hn++; }
    this.norm = { cu: sx / n / w, cv: sy / n / h, hu: (hn ? hx / hn : sx / n) / w, tv: top / h, wu: (maxX - minX) / w };
  }

  // Screen-space view of the last scan (recomputed so it tracks resizes).
  get info() {
    const I = this._info, N = this.norm, P = Projector;
    if (!N) { I.ok = false; return I; }
    const X = (u) => (1 - u) * P.vw * P.s + P.ox, Y = (v) => v * P.vh * P.s + P.oy;
    I.ok = true; I.cx = X(N.cu); I.cy = Y(N.cv); I.top = Y(N.tv); I.hx = X(N.hu);
    I.hy = Y(N.tv + 0.1); I.w = N.wu * P.vw * P.s;
    return I;
  }

  // Loads lazily and quietly: if it fails, the app simply runs without the
  // body aura.
  async init() {
    if (this.seg || this.loading) return;
    this.loading = true;
    try {
      const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(TASKS_WASM);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      try {
        this.seg = await ImageSegmenter.createFromOptions(fileset, opts('GPU'));
      } catch (err) {
        this.seg = await ImageSegmenter.createFromOptions(fileset, opts('CPU'));
      }
      this.ready = true;
    } catch (err) {
      console.warn('Body segmentation unavailable; aura falls back to hands only', err);
    }
    this.loading = false;
  }

  detect(video, nowMs) {
    if (!this.ready || video.readyState < 2) return;
    if (nowMs - this.lastTs < this.interval) return;
    this.lastTs = nowMs;
    try {
      this.seg.segmentForVideo(video, nowMs, (res) => {
        const m = res.confidenceMasks && res.confidenceMasks[0];
        if (!m) return;
        this.write(m.getAsFloat32Array(), m.width, m.height);
      });
    } catch (err) {
      // a dropped frame is fine
    }
  }

  // Mask value 0..1 at a screen position (CSS px), for physics collisions.
  sample(sx, sy) {
    if (!this.mdata) return 0;
    const P = Projector;
    const u = 1 - (sx - P.ox) / (P.vw * P.s), v = (sy - P.oy) / (P.vh * P.s);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const x = Math.min(this.mw - 1, (u * this.mw) | 0), y = Math.min(this.mh - 1, (v * this.mh) | 0);
    return this.mdata[y * this.mw + x];
  }

  write(data, w, h) {
    if (!this.mdata || this.mdata.length !== data.length) this.mdata = new Float32Array(data.length);
    this.mdata.set(data);
    this.mw = w; this.mh = h;
    this.locate();
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h; this.img = null;
    }
    if (!this.img) this.img = this.g.createImageData(w, h);
    const px = this.img.data;
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      const v = data[i] * 255;
      px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255;
    }
    this.g.putImageData(this.img, 0, 0);
    this.texture.needsUpdate = true;
  }

  // Demo mode: the painted backdrop's figure stands in for a real person.
  useCanvas(src) {
    this.g.drawImage(src, 0, 0, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
    this.ready = true;
    const w = this.canvas.width, h = this.canvas.height;
    const px = this.g.getImageData(0, 0, w, h).data;
    this.mdata = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) this.mdata[i] = px[i * 4] / 255;
    this.mw = w; this.mh = h;
    this.locate();
  }
}
