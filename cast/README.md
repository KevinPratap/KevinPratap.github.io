# Cast

Hand-tracked elemental powers in the browser. Webcam + MediaPipe hand
landmarks drive real particle physics for two characters:

- **Ember** — fire: projectile/combustion physics (Palm Orb, Flame Whip,
  Nova Burst, Wall of Flame)
- **Nyx** — void: attraction/repulsion force-field physics (Pull, Push,
  Singularity, Portal)

No install, no build step — single static `index.html`, vanilla JS +
Three.js + `@mediapipe/tasks-vision`, loaded from CDN.

Gesture thresholds live in the `CONFIG` object at the top of the script.
Toggle the on-screen DEBUG overlay to see live openness/speed readouts
per hand while tuning.

Live: https://kevinpratap.github.io/cast/
