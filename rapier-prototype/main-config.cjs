// All the feel/jank knobs in one place. Most of these can also be changed live
// from the spectator screen (press D there) while people playtest.

const CONFIG = {
  // the race course itself lives in course.js

  // climber body
  radius: 0.35,
  gravity: 14,

  // arms (each climber has two: upper arm + forearm + mitten hand)
  shoulderX: 0.22,        // shoulder offset from the torso center
  shoulderY: 0.12,
  upperArm: 0.4,
  foreArm: 0.4,
  handRadius: 0.11,
  reach: 0.75,            // how far from the shoulder the hands try to go (along your tilt)
  handSpread: 0.28,       // each hand aims this far out to its own side, so the arms don't tangle
  armAimDeg: 75,          // full tilt points the arms this far off vertical
  armK: 30,               // arm "muscle" spring toward the reach target
  armD: 2.5,              // arm muscle damping
  armStrength: 1.6,       // max muscle force, in body weights (how hard you can swing yourself)
  grabRadius: 0.32,       // a closed hand this close to a hold grabs it
  climberGrab: 0.18,      // ...or this close to another climber's body / hand

  // legs (thigh + shin, foot at the end). Feet plant on top of holds / the floor while the legs player holds still
  hipX: 0.12,
  hipY: 0.28,             // hips sit this far below the torso center
  thigh: 0.4,
  shin: 0.4,
  footRadius: 0.07,
  legReach: 0.75,         // how far below the hip the feet try to be (standing = legs hold you up)
  legAimDeg: 60,          // full legs-player lean swings the feet this far off straight down
  legK: 30,
  legD: 2.5,
  legStrength: 1.4,       // max leg force, in body weights
  legPushSpeed: 7,        // legs player hops / stands up fast: push off (~1.75 m)
  comboBonus: 5.5,        // hop + arms let go of the wall within the combo window: this much extra speed
  comboWindow: 0.4,       // seconds
  comboCooldown: 2,       // seconds between combos (it's a big move, not a ladder)
  comboCost: 15,          // stamina
  kickImpulse: 4,
  kickCooldown: 1.5,
  kickRange: 1,           // m from a kicking foot to the rival's torso or feet

  // jumping (legs only) + steering (arms only)
  flickJank: 0.1,         // +/- random power on every hop (Foddian pain)
  boostMult: 1.7,         // hopping while standing on a climber who holds on
  airSpeed: 4.5,          // full arms tilt in the air = this sideways speed (m/s)
  airGrip: 10,            // how fast you reach it (1/s): ~0.1 s to respond

  // grip + stamina. "Carrying" = people hanging off your hands with no hold of their own
  maxCarryFidgeting: 0,   // moving your phone? one dangling friend rips you off (after 0.5 s)
  maxCarryBraced: 2,      // holding still? you can carry two people... while stamina lasts
  staminaDrain: 12,       // per second per person you carry
  oneHandDrain: 4,        // per second hanging by one hand
  staminaRegen: 18,

  // network
  sendRate: 45,           // snapshots per second
};

// sliders shown on the spectator screen: [min, max, step]
const TUNABLE = {
  gravity: [6, 25, 0.5],
  flickJank: [0, 0.5, 0.01],
  boostMult: [1, 2.5, 0.05],
  reach: [0.5, 1.2, 0.05],
  armK: [5, 80, 1],
  armStrength: [0.5, 4, 0.1],
  grabRadius: [0.15, 0.8, 0.01],
  airSpeed: [0, 10, 0.25],
  airGrip: [1, 30, 0.5],
  handSpread: [0, 0.6, 0.02],
  legPushSpeed: [2, 14, 0.25],
  comboBonus: [0, 10, 0.25],
  legStrength: [0.3, 4, 0.1],
  maxCarryFidgeting: [0, 3, 1],
  maxCarryBraced: [0, 4, 1],
  staminaDrain: [0, 40, 1],
  oneHandDrain: [0, 20, 0.5],
};

module.exports = { CONFIG, TUNABLE };
