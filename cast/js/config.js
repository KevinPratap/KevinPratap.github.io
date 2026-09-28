// Every tunable number lives here. Distances and speeds are measured in
// "hand scales" (roughly wrist-to-knuckle length on screen) so gestures feel
// the same whether you stand close to the camera or across the room.

export const CONFIG = {
  // Call to action burned into recorded clips
  TRY_URL: 'kevinpratap.github.io/cast',
  MORE_URL: 'github.com/KevinPratap',

  maxHands: 2,

  // Displayed landmarks chase the latest detection at this rate (1/s).
  follow: 24,
  // Velocity smoothing rate (1/s).
  velSmooth: 14,

  // Openness: 0 = tight fist, 1 = fingers fully spread.
  fistEnter: 0.24, fistExit: 0.34,
  openEnter: 0.72, openExit: 0.60,
  cupMin: 0.26, cupMax: 0.70,

  // Speeds in hand-scales per second.
  stillSpeed: 1.6,
  swipeSpeed: 5.0,
  flickSpeed: 7.5,
  // Relative growth of the hand on screen per second = pushing toward camera.
  thrustRate: 1.7,

  // Two-hand distances in hand scales.
  touchDist: 1.6,
  novaApart: 3.4,
  wallSpread: 3.2,
  levelTol: 1.1,

  chargeTime: 1.1,
  chargeDecay: 1.4,
  portalHold: 3.0,

  // Adaptive quality
  maxPixelRatio: 1.75,
  minPixelRatio: 1.0,
  slowFrameMs: 27,

  recordMaxSeconds: 60,
  endCardSeconds: 1.8,
};

export const CHARACTERS = {
  ember: {
    name: 'Ember',
    kanji: '炎',
    element: 'Fire',
    a: [1.0, 0.32, 0.10],
    b: [1.0, 0.78, 0.30],
    css: ['#ff5a2b', '#ffc24d'],
    grade: [1.08, 0.94, 0.84],
    moves: [
      { id: 'orb', kanji: '火球', name: 'Palm Orb', how: 'Cup a hand and hold still to charge. Flick it to throw, or push it at the camera.' },
      { id: 'whip', kanji: '炎鞭', name: 'Flame Whip', how: 'Make a fist and swing it fast.' },
      { id: 'nova', kanji: '爆炎', name: 'Nova Burst', how: 'Bring both hands together, then rip them apart.' },
      { id: 'wall', kanji: '炎壁', name: 'Wall of Flame', how: 'Open both hands wide at the same height and hold.' },
    ],
  },
  nyx: {
    name: 'Nyx',
    kanji: '虚',
    element: 'Void',
    a: [0.56, 0.36, 1.0],
    b: [0.86, 0.72, 1.0],
    css: ['#8b5cf6', '#d4b8ff'],
    grade: [0.86, 0.88, 1.10],
    moves: [
      { id: 'pull', kanji: '引力', name: 'Pull', how: 'Curl one hand half shut and hold still.' },
      { id: 'push', kanji: '斥力', name: 'Push', how: 'Open palm, then shove it fast or toward the camera.' },
      { id: 'sing', kanji: '特異点', name: 'Singularity', how: 'Bring both hands together and hold.' },
      { id: 'portal', kanji: '虚空門', name: 'Portal', how: 'Keep holding the Singularity for 3 seconds.' },
    ],
  },
};

// Characters for the Google Fonts subset request (only these glyphs download).
export const KANJI_SET = '炎虚火球鞭爆壁引力斥特異点空門';
