// Person silhouette for the full-body aura. MediaPipe's selfie segmenter
// runs a few times a second and its mask lands in a small canvas that the
// compositor samples, so the aura hugs your outline like a transformation.
import * as THREE from 'three';

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

  write(data, w, h) {
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
  }
}
