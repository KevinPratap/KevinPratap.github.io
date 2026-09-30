# Cast

Real superpowers from real hand signs, in the browser. Your webcam feed runs
through MediaPipe hand tracking on-device, and every sign drives real
particle physics and screen-space effects.

Live: https://kevinpratap.github.io/cast/
Demo without a camera: https://kevinpratap.github.io/cast/?demo&auto

## Heroes

Every move is keyed to a specific, recognisable sign, not a generic pose.

- **Orin (念)**, telekinesis. Grip an invisible hilt: a blade ignites out of
  your fist and follows your wrist (two fists, two blades). Training drones
  hunt you once it's lit; swing into their bolts to send them back. Open
  palm shove = Force Push. Claw a hand = Force Grip: drag it, clench to
  crush, flick to throw. Both palms up and raised = Levitate, drop them =
  Slam. Both hands clawed = Force Lightning (your blade goes red after).
- **Kage (影)**, ninja. Cross seal = Shadow Clones (they copy your jutsu).
  One hand over the other = Rasengan. Grip your own wrist = Chidori, then
  lunge. Tiger seal = Great Fireball.
- **Nyx (無)**, Limitless. Point = Blue. Pinch and snap open = Red. Blue in
  one hand + Red in the other, brought together = Hollow Purple. Crossed
  fingers held up = Domain Expansion: Infinite Void.
- **Kai (気)**, ki. Cupped Ki Wave, Gathering Sphere with both hands up,
  one palm raised = Destructo Disc, two fingers to the forehead = Instant
  Transmission, clenched fists = Awakening.
- **Ferrum (鋼)**, armor. Palm repulsors, missiles, thrusters, unibeam,
  holo schematic, suit-up (brings the HUD).
- **Mystral (魔)**, sorcerer. Sorcerer sign = Mandala Shield, draw a circle
  = Sling Ring portal, mirror dimension, time loop, eldritch whip.
- **Ember (炎)**, fire. Finger snap = Flame Alchemy, punch the camera = Fire
  Fist, palm orb, dragon fire, fire tornado.
- **Raiju (雷)**, lightning.

## How it's built

No build step. Plain ES modules served as static files; Three.js and
MediaPipe load from jsDelivr through the import map in `index.html`.

- `js/tracking.js` turns landmarks into per-hand state: per-finger and
  thumb extension from 3D world landmarks, crossed fingers, finger snaps,
  speeds in hand-lengths per second, flick and push-toward-camera.
- `js/signs.js` names the poses (fist, point, V, crossed, sorcerer, claw,
  pinch) and the two-hand seals (clone cross, tiger, stack, wrist grab,
  clap). Seals survive one hand dropping out for half a second, because
  pressing your hands together is exactly when the tracker loses one.
- `js/body.js` segments you out of the frame; it powers clones, auras, the
  domain expansion and debris landing on your shoulders, and locates your
  head for moves that start at your mouth or forehead.
- `js/render/pipeline.js` composites the camera, bloom and every
  screen-space effect (shockwaves, lensing, swirl, heat, clones, void).
- `js/engines/*.js` hold each hero's moves.
- `js/overlay.js` draws solid 2D pieces: callouts, sign chips, cracks,
  drones, hilts.

## Tuning

Thresholds live in `js/config.js` and `js/signs.js`. Turn on **DEBUG** in
the app to see which sign each hand reads as, per-finger extension and the
current two-hand seal while you adjust them.
