# kevinpratap.github.io

Portfolio of Kevin Pratap Sidhu: motion designer and AI engineer, Mumbai.

Live: https://kevinpratap.github.io/ · Plain, print-friendly version: https://kevinpratap.github.io/print/ · Cast: https://kevinpratap.github.io/cast/

## What is on the page

The site is one story told as a radio transmission, ten channels long.

- **CH 00 Gate.** Dead static. Hold to tune in; the hold also switches on the sound.
- **CH 01 Hero.** A WebGL field of flowing signal contours with the name drawn into it. The cursor warps the field.
- **CH 02 Reel.** Every screenshot on a curved WebGL ribbon. Scroll moves it; scroll speed ripples it and splits its colour.
- **CH 03 Noise.** The problems, decoded in and then jammed back into noise.
- **CH 04 Filters.** Six design rules applied one by one to a deliberately broken LedgerDesk card.
- **CH 05 Transmissions.** Four case studies with clip-path image reveals, a light/dark sweep, a phone fan and an analyst loupe.
- **CH 06 Systems.** Live diagrams of the lead pipeline, agentic workflows, Nebula and Cast, with packets and quality gates.
- **CH 07 Volume.** 290 dots for 290 shipped sites.
- **CH 08 Spectrum.** Fourteen side projects on a tuner, with hover previews.
- **CH 09 On air.** Cast, with a 21-point hand cycling through real signs.
- **CH 10 Transmit.** Contact.

## How it is built

No framework, no build step. `index.html`, `assets/css/site.css` and ES modules in `assets/js/`:

- `signal.js` hero shader (static → contour field), name rendered to a texture from the real DOM layout
- `reel.js` raw WebGL ribbon, one subdivided mesh drawn per card
- `systems.js` canvas node graphs
- `hand.js` the 21-point hand
- `audio.js` every sound, synthesized with the Web Audio API (noise bed, drone that changes chord per chapter, ticks, FM chime, data chirps, tuner tones)
- `main.js` choreography: GSAP ScrollTrigger and Lenis (vendored in `assets/vendor/`)

Fonts (Geist, Geist Mono, Instrument Serif) are self-hosted in `assets/fonts/`. Respects `prefers-reduced-motion`, works without WebGL, and readable without JavaScript.
