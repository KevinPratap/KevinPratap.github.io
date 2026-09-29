// Every tunable number lives here. Distances and speeds are measured in
// "hand scales" (roughly wrist-to-knuckle length on screen) so gestures feel
// the same whether you stand close to the camera or across the room.

export const CONFIG = {
  // Call to action burned into recorded clips
  TRY_URL: 'kevinpratap.github.io/cast',
  MORE_URL: 'github.com/KevinPratap',

  maxHands: 2,

  // Displayed landmarks chase the (filtered, velocity-led) detection at this rate (1/s).
  follow: 30,
  // Velocity smoothing rate (1/s), applied per detection.
  velSmooth: 18,
  // One Euro landmark filter: cutoff at rest (Hz) and speed coefficient.
  euroMinCutoff: 1.6,
  euroBeta: 0.012,
  // Seconds a hand may drop out of detection before its moves are cancelled.
  lostGrace: 0.35,

  // Openness: 0 = tight fist, 1 = fingers fully spread.
  fistEnter: 0.24, fistExit: 0.34,
  openEnter: 0.72, openExit: 0.60,
  cupMin: 0.26, cupMax: 0.70,
  // Pointing: index extension above pointEnter while the rest stay under curlMax.
  pointEnter: 0.62, pointExit: 0.48, curlMax: 0.36,

  // Speeds in hand-scales per second.
  stillSpeed: 1.6,
  swipeSpeed: 5.0,
  flickSpeed: 7.5,
  // Downward fist speed for Thunderstrike, and pointing swipe speed for Rift Cut.
  slamSpeed: 8.0,
  slashSpeed: 6.0,
  // Relative growth of the hand on screen per second = pushing toward camera.
  thrustRate: 1.7,

  // Two-hand distances in hand scales.
  touchDist: 1.6,
  novaApart: 3.4,
  wallSpread: 3.2,
  levelTol: 1.1,

  chargeTime: 1.1,
  railCharge: 0.9,
  comboWindow: 2.6,
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
      { id: 'dragon', kanji: '火龍', name: 'Dragon Fire', how: 'Point a finger and hold it. Aim the stream anywhere.' },
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
      { id: 'rift', kanji: '空間斬', name: 'Rift Cut', how: 'Point a finger and slash it across the air.' },
    ],
  },
  raiju: {
    name: 'Raiju',
    kanji: '雷',
    element: 'Lightning',
    a: [1.0, 0.78, 0.18],
    b: [1.0, 0.97, 0.78],
    css: ['#ffc629', '#fff5c4'],
    grade: [1.04, 1.0, 0.86],
    moves: [
      { id: 'palm', kanji: '雷掌', name: 'Thunder Palm', how: 'Claw a hand and hold still to charge. Flick to throw it, or thrust it at the camera.' },
      { id: 'rail', kanji: '電磁砲', name: 'Railgun', how: 'Point a finger and hold still. It fires when fully charged.' },
      { id: 'link', kanji: '雷鎖', name: 'Arc Link', how: 'Hold both hands open and apart. Clap them together to overload.' },
      { id: 'strike', kanji: '落雷', name: 'Thunderstrike', how: 'Raise a fist and slam it straight down.' },
      { id: 'bolt', kanji: '神雷', name: 'Shazam Bolt', how: 'Point a finger at the sky and hold. Lightning hits you, then every point fires a bolt for 8 seconds.' },
      { id: 'storm', kanji: '天雷', name: 'Sky Storm', how: 'Hold Arc Link, then throw both hands up. The whole sky answers along the chain.' },
      { id: 'conduit', kanji: '雷導', name: 'Conduit', how: 'Call the bolt, then hold Arc Link. Every finger throws lightning. Clap for a storm overload.' },
    ],
  },
  kai: {
    name: 'Kai',
    kanji: '気',
    element: 'Ki',
    a: [0.24, 0.62, 1.0],
    b: [0.82, 0.95, 1.0],
    gold: [1.0, 0.74, 0.16],
    goldB: [1.0, 0.96, 0.7],
    css: ['#3d9eff', '#cfeeff'],
    grade: [0.9, 0.98, 1.1],
    moves: [
      { id: 'wave', kanji: '気功波', name: 'Ki Wave', how: 'Cup both hands together and hold to charge. Thrust them forward to fire.' },
      { id: 'sphere', kanji: '天元玉', name: 'Gathering Sphere', how: 'Raise both open hands high and hold. Swing them down to throw it.' },
      { id: 'barrage', kanji: '気弾連射', name: 'Ki Barrage', how: 'Flick open palms fast, again and again.' },
      { id: 'awaken', kanji: '覚醒', name: 'Awakening', how: 'Clench both fists and hold. Powers up every move.' },
      { id: 'step', kanji: '瞬歩', name: 'Instant Step', how: 'Hold up two fingers, still, for a moment.' },
    ],
  },
  kage: {
    name: 'Kage',
    kanji: '影',
    element: 'Shadow',
    a: [0.12, 0.92, 0.6],
    b: [0.8, 1.0, 0.92],
    css: ['#1fe89a', '#c8ffe9'],
    grade: [0.84, 1.03, 0.94],
    moves: [
      { id: 'clones', kanji: '影分身', name: 'Shadow Clones', how: 'Cross the two raised fingers of both hands (the clone sign). Or chain: two fingers, fist, clap.' },
      { id: 'smoke', kanji: '煙遁', name: 'Smoke Vanish', how: 'Signs: open palm, fist, then point a finger.' },
      { id: 'kunai', kanji: '苦無', name: 'Kunai Storm', how: 'Signs: point, two fingers, then open palm.' },
      { id: 'bind', kanji: '影縛', name: 'Shadow Binding', how: 'Four signs: fist, point, two fingers, then clap.' },
      { id: 'eclipse', kanji: '影蝕', name: 'Grand Eclipse', how: 'Five signs: fist, two fingers, point, open palm, then clap.' },
      { id: 'shuriken', kanji: '風魔手裏剣', name: 'Windmill Shuriken', how: 'Hold an open palm still for a second. Flick to throw it. It comes back to your hand.' },
      { id: 'substitute', kanji: '変わり身', name: 'Substitution', how: 'Signs: clap, then fist. A log takes your place and bursts into splinters.' },
    ],
  },
  mystral: {
    name: 'Mystral',
    kanji: '魔',
    element: 'Arcane',
    a: [0.95, 0.3, 0.85],
    b: [1.0, 0.86, 0.97],
    css: ['#f24fd8', '#ffd9f7'],
    grade: [1.02, 0.9, 1.06],
    moves: [
      { id: 'shield', kanji: '護法陣', name: 'Mandala Shield', how: 'Hold an open palm still. Thrust it forward to burst the shield.' },
      { id: 'portal', kanji: '転移門', name: 'Portal Ring', how: 'Point a finger and draw a full circle in the air.' },
      { id: 'mirror', kanji: '鏡像界', name: 'Mirror Dimension', how: 'Two fingers up on both hands, held still.' },
      { id: 'crescent', kanji: '月光斬', name: 'Crescent Slash', how: 'Two fingers up, then swipe fast.' },
      { id: 'time', kanji: '時廻', name: 'Time Loop', how: 'Press both hands together and hold. Time runs backward.' },
      { id: 'whip', kanji: '魔鞭', name: 'Eldritch Whip', how: 'Pinch thumb and index finger together, then swing. Snap it fast to crack.' },
      { id: 'singularity', kanji: '特異点', name: 'Singularity', how: 'Make a fist and hold it still. A black hole forms and swallows the room. Open your hand to release, or flick to throw it.' },
    ],
  },
  ferrum: {
    name: 'Ferrum',
    kanji: '鋼',
    element: 'Tech',
    a: [0.25, 0.85, 1.0],
    b: [0.9, 1.0, 1.0],
    gold: [1.0, 0.7, 0.2],
    goldB: [1.0, 0.95, 0.7],
    css: ['#3fd8ff', '#e4ffff'],
    grade: [0.9, 1.0, 1.08],
    moves: [
      { id: 'repulsor', kanji: '光線砲', name: 'Repulsor Blast', how: 'Hold an open palm still to charge. Flick or thrust to fire. Aim with your fingers.' },
      { id: 'hud', kanji: '戦術', name: 'HUD Mode', how: 'Make a fist and hold it. Again to switch off.' },
      { id: 'missile', kanji: '追尾弾', name: 'Missile Volley', how: 'Two fingers up, then flick.' },
      { id: 'thrusters', kanji: '飛行', name: 'Thrusters', how: 'Both palms open, fingers pointing down.' },
      { id: 'suit', kanji: '装着', name: 'Suit-Up', how: 'Bring both fists together and hold. Powers up every move.' },
      { id: 'holo', kanji: '設計図神導', name: 'Holo Schematic', how: 'Pinch with both hands and pull apart. The reactor comes apart layer by layer. Tilt your hands to spin it.' },
      { id: 'unibeam', kanji: '胸部砲', name: 'Unibeam', how: 'Both palms open side by side, held still. Move your hands to steer the beam.' },
    ],
  },
};

// Characters for the Google Fonts subset request (only these glyphs download).
export const KANJI_SET = Array.from(new Set(Array.from('炎虚雷火球鞭爆壁龍引力斥特異点空門間斬掌電磁砲鎖落連撃気功波天元玉弾射覚醒瞬歩過負荷再生叫影分身煙遁苦無縛蝕子寅午辰合魔護法陣転移鏡像界月光時廻鋼線戦術追尾飛行装着十風手裏剣胸部砲変わり設計図神導'))).join('');
