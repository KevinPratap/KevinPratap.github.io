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
  force: {
    name: 'Orin',
    kanji: '念',
    element: 'Telekinesis',
    a: [0.22, 0.58, 1.0],
    b: [0.82, 0.93, 1.0],
    css: ['#3b8cff', '#d6ebff'],
    grade: [0.92, 0.97, 1.08],
    moves: [
      { id: 'saber', kanji: '光刃', name: 'Lightsaber', how: 'Close your fist like you\'re gripping a hilt and hold it. The blade follows your wrist. Two fists, two blades. Open your hand to shut it off.' },
      { id: 'push', kanji: '念押', name: 'Force Push', how: 'Open palm, then shove it at the camera (hits everything) or sweep it fast (hits one way).' },
      { id: 'grip', kanji: '念掴', name: 'Force Grip', how: 'Claw one hand at a drone or the rubble and hold. It\'s yours: drag it around, clench your fist to crush it, flick to throw it.' },
      { id: 'lift', kanji: '浮遊', name: 'Levitate', how: 'Both palms open, hands apart, still. Raise them slowly and the room floats. Drop them hard to slam it all down.' },
      { id: 'lightning', kanji: '念雷', name: 'Force Lightning', how: 'Claw both hands and hold. Lightning pours out of every finger. Your blade turns red after.' },
      { id: 'deflect', kanji: '反射', name: 'Deflect', how: 'Light your blade and drones come for you. Swing into their bolts to send them back.' },
    ],
  },
  ember: {
    name: 'Ember',
    kanji: '炎',
    element: 'Fire',
    tag: 'Fire · snaps, fists & dragons',
    a: [1.0, 0.32, 0.10],
    b: [1.0, 0.78, 0.30],
    css: ['#ff5a2b', '#ffc24d'],
    grade: [1.08, 0.94, 0.84],
    moves: [
      { id: 'snap', kanji: '焔', name: 'Flame Alchemy', how: 'Snap your fingers (thumb and middle finger) with your index pointing. The air where you point explodes.' },
      { id: 'fist', kanji: '火拳', name: 'Fire Fist', how: 'Make a fist and punch it straight at the camera. A column of flame erupts out of it.' },
      { id: 'orb', kanji: '火球', name: 'Palm Orb', how: 'Cup a hand and hold still to charge. Flick it to throw, or push it at the camera.' },
      { id: 'dragon', kanji: '火龍', name: 'Dragon Fire', how: 'Point a finger and hold it. Aim the stream anywhere.' },
      { id: 'tornado', kanji: '火災旋風', name: 'Fire Tornado', how: 'Hold up two fingers, still. A flame tornado rises off the floor and follows your hand, hauling rubble up its spiral.' },
    ],
  },
  nyx: {
    name: 'Nyx',
    kanji: '無',
    element: 'Limitless',
    tag: 'Limitless · bends space',
    a: [0.45, 0.35, 1.0],
    b: [0.88, 0.84, 1.0],
    css: ['#7c5cff', '#dcd4ff'],
    grade: [0.9, 0.9, 1.1],
    moves: [
      { id: 'blue', kanji: '蒼', name: 'Blue', how: 'Point one finger and hold. A point of infinite attraction forms on your fingertip and drags the room into it. Flick to launch it.' },
      { id: 'red', kanji: '赫', name: 'Red', how: 'Pinch thumb and index together and hold to charge, then snap them open. A repulsion shot that blows everything apart.' },
      { id: 'purple', kanji: '茈', name: 'Hollow Purple', how: 'Blue on one hand, Red charging on the other. Bring your hands together to fuse them, then thrust or fling. It erases a trench straight through the world.' },
      { id: 'domain', kanji: '無量空処', name: 'Domain Expansion: Infinite Void', how: 'Cross your index and middle fingers on one hand and hold them up. Everything behind you becomes an endless void.' },
    ],
  },
  raiju: {
    name: 'Raiju',
    kanji: '雷',
    element: 'Lightning',
    tag: 'Lightning · thunder god',
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
    ],
  },
  kai: {
    name: 'Kai',
    kanji: '気',
    element: 'Ki',
    tag: 'Saiyan · beams & power-ups',
    a: [0.24, 0.62, 1.0],
    b: [0.82, 0.95, 1.0],
    gold: [1.0, 0.74, 0.16],
    goldB: [1.0, 0.96, 0.7],
    css: ['#3d9eff', '#cfeeff'],
    grade: [0.9, 0.98, 1.1],
    moves: [
      { id: 'wave', kanji: '気功波', name: 'Ki Wave', how: 'Cup both hands together, wrists touching, and hold to charge. Thrust them forward to fire the beam.' },
      { id: 'sphere', kanji: '天元玉', name: 'Gathering Sphere', how: 'Raise both open hands to the sky and hold while it gathers energy. Swing them down to throw it.' },
      { id: 'barrage', kanji: '気弾連射', name: 'Ki Barrage', how: 'Flick open palms fast, again and again.' },
      { id: 'awaken', kanji: '覚醒', name: 'Awakening', how: 'Clench both fists and hold. Powers up every move.' },
      { id: 'step', kanji: '瞬間移動', name: 'Instant Transmission', how: 'Touch two fingers to your forehead and hold still. You blink out and reappear.' },
      { id: 'disc', kanji: '気円斬', name: 'Destructo Disc', how: 'Raise one open palm straight up above your head and hold. A spinning disc forms over it. Swing your arm down to throw it.' },
    ],
  },
  kage: {
    name: 'Kage',
    kanji: '影',
    element: 'Ninjutsu',
    tag: 'Ninja · real hand seals',
    a: [0.2, 0.62, 1.0],
    b: [0.82, 0.95, 1.0],
    css: ['#ff8a1f', '#ffd9a8'],
    grade: [1.02, 0.97, 0.94],
    moves: [
      { id: 'clones', kanji: '影分身', name: 'Shadow Clone Jutsu', how: 'Make the clone seal: two fingers up on each hand, crossed into a plus sign, and hold. Clones burst out of smoke beside you and copy everything, jutsu included. Make the seal again to dismiss them.' },
      { id: 'rasengan', kanji: '螺旋丸', name: 'Rasengan', how: 'Hold one hand over the other, palms facing, a little apart. Swirl the top hand to spin it up faster. Then thrust or swing the lower hand to drive it home. With clones out it becomes a Giant Rasengan.' },
      { id: 'chidori', kanji: '千鳥', name: 'Chidori', how: 'Grab your own wrist with the other hand and hold. Lightning screams in the gripped hand. Let go and lunge it forward to punch through the screen.' },
      { id: 'fireball', kanji: '豪火球', name: 'Great Fireball', how: 'Make the tiger seal: both hands together, index and middle fingers pointing straight up, and hold. You breathe out a fireball that swallows the room.' },
    ],
  },
  mystral: {
    name: 'Mystral',
    kanji: '魔',
    element: 'Arcane',
    tag: 'Sorcerer · mandalas & portals',
    a: [0.95, 0.3, 0.85],
    b: [1.0, 0.86, 0.97],
    css: ['#f24fd8', '#ffd9f7'],
    grade: [1.02, 0.9, 1.06],
    moves: [
      { id: 'shield', kanji: '護法陣', name: 'Mandala Shield', how: 'Make the sorcerer sign: index and pinky out, middle and ring folded down, thumb out. A spinning mandala shield forms. Open your palm to hold it, thrust to burst it.' },
      { id: 'portal', kanji: '転移門', name: 'Sling Ring Portal', how: 'Point a finger and draw a full circle in the air. Sparks trace it and it tears open.' },
      { id: 'mirror', kanji: '鏡像界', name: 'Mirror Dimension', how: 'Two fingers up on both hands, held still.' },
      { id: 'time', kanji: '時廻', name: 'Time Loop', how: 'Press both hands together and hold. Time runs backward.' },
      { id: 'whip', kanji: '魔鞭', name: 'Eldritch Whip', how: 'Pinch thumb and index finger together, then swing. Snap it fast to crack.' },
    ],
  },
  ferrum: {
    name: 'Ferrum',
    kanji: '鋼',
    element: 'Tech',
    tag: 'Armor · repulsors & missiles',
    a: [0.25, 0.85, 1.0],
    b: [0.9, 1.0, 1.0],
    gold: [1.0, 0.7, 0.2],
    goldB: [1.0, 0.95, 0.7],
    css: ['#3fd8ff', '#e4ffff'],
    grade: [0.9, 1.0, 1.08],
    moves: [
      { id: 'repulsor', kanji: '光線砲', name: 'Repulsor Blast', how: 'Palm out at the camera, fingers up, held still to charge. Thrust or flick to fire. Aim with your fingers.' },
      { id: 'missile', kanji: '追尾弾', name: 'Missile Volley', how: 'Two fingers up, then flick.' },
      { id: 'thrusters', kanji: '飛行', name: 'Thrusters', how: 'Both palms open, fingers pointing down.' },
      { id: 'suit', kanji: '装着', name: 'Suit-Up', how: 'Bring both fists together and hold. Armor locks on, the HUD comes up, and every move hits harder.' },
      { id: 'holo', kanji: '設計図', name: 'Holo Schematic', how: 'Pinch with both hands and pull apart. The reactor comes apart layer by layer. Tilt your hands to spin it.' },
      { id: 'unibeam', kanji: '胸部砲', name: 'Unibeam', how: 'Both palms open side by side, held still. Move your hands to steer the beam.' },
    ],
  },
};

// Characters for the Google Fonts subset request (only these glyphs download).
const EXTRA_KANJI = '影分身の術火遁・豪火球螺旋丸大玉千鳥領域展開無量空処虚式茈蒼赫光刃念押掴浮遊反射握潰叩落雷焔拳戦術装着瞬間移動連撃';
export const KANJI_SET = Array.from(new Set(Array.from(
  Object.values(CHARACTERS).map((c) => c.kanji + c.moves.map((m) => m.kanji).join('')).join('') + EXTRA_KANJI,
))).join('');
