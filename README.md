# kevinpratap.github.io

Portfolio of Kevin Pratap Sidhu: motion designer and AI engineer, Mumbai.

Live: https://kevinpratap.github.io/ · Plain, print-friendly version: https://kevinpratap.github.io/print/ · Cast: https://kevinpratap.github.io/cast/

## How it works

The whole page is one WebGL canvas holding one cloud of about 110,000 particles (fewer on phones). The particles are always morphing between two shapes, and scroll position decides which two and how far along:

your name → a neural constellation → each project screenshot (sampled from its real pixels) → three client sites → a flowing data pipeline → a hand (Cast) → a galaxy behind the project list → a ring around the email.

Every shape is anchored to a real element on the page (`data-anchor`), so the particles sit exactly where the layout puts them and scroll with it. When a screenshot's particles have fully arrived, the real image condenses on top; hovering an image opens a hole that shows the particles underneath.

- `assets/js/particles.js` the engine: one draw call, A/B morph with per-particle delay and curl, cursor repulsion, premultiplied blending that can be normal or additive per shape
- `assets/js/shapes.js` shape bakers: text, images, constellation, ribbon, hand, galaxy, ring
- `assets/js/main.js` anchors, scroll mapping, word reveals, HUD, cursor
- `assets/js/audio.js` sound, all synthesized: a pad that changes chord per section, wind that rises while particles are in flight, bells when images settle

No framework, no build step. Lenis for smooth scroll (vendored). Fonts self-hosted. Works without WebGL (images and text show normally), respects reduced motion, readable without JavaScript.
