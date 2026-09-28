# Cast

Anime-style elemental powers you cast with your bare hands, in the browser.
The webcam feed runs through MediaPipe hand tracking on-device, and every
gesture drives real particle physics and screen-space effects.

Live: https://kevinpratap.github.io/cast/
Demo without a camera: https://kevinpratap.github.io/cast/?demo&auto

## Characters

- **Ember (炎)** — fire: projectile arcs and combustion.
  Palm Orb (charge, flick to throw, or push it at the camera), Flame Whip,
  Nova Burst, Wall of Flame.
- **Nyx (虚)** — void: an attraction/repulsion field over a swarm of motes and
  a black hole that bends the camera image. Pull, Push, Singularity, Portal.

## How it's built

No build step. Plain ES modules served as static files; Three.js and
MediaPipe load from jsDelivr through the import map in `index.html`.

- `js/tracking.js` — landmarks → per-hand state (openness from 3D world
  landmarks, speeds in hand-lengths per second, flick and push-toward-camera
  detection).
- `js/render/pipeline.js` — camera as a WebGL texture, selective bloom on the
  effects layer, and one composite shader for shockwaves, gravitational
  lensing, heat haze, vortex swirl, chromatic aberration, impact frames,
  zoom punch, shake and color grading.
- `js/render/` — shader orbs, accretion disks, flame wall, magic circles,
  ribbon trails, spark streaks and the glowing hand skeleton.
- `js/engines/ember.js`, `js/engines/nyx.js` — each character's moves.
- `js/overlay.js` — kanji attack callouts, speed lines, letterbox bars.
- `js/audio.js` — synthesized sound effects (also recorded into clips).
- `js/recorder.js` — records MP4 where the browser supports it (WebM
  otherwise) with a watermark and an end card.
- `js/sim.js` — scripted hands for the camera-free demo.

## Tuning

Every gesture threshold is in `js/config.js`. Turn on **DEBUG** in the app to
see live openness, speed and growth readouts per hand while you adjust them.
