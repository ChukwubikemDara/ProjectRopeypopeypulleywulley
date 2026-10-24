// Tethered — game server
// Runs ALL physics (Planck.js) and game rules. Phones only send inputs and draw what this sends back.
// Run: node server.js   (then open http://localhost:3000/screen.html on a laptop, phones use the QR code)
//
// Teams: each climber is driven by up to two phones. The ARMS only hold on: tilt points the hands
// (and steers you in the air), thumbs grip. The LEGS are the only way up: hop = push off, lean swings
// the feet, shove = kick, but feet can't hold on to anything. A climber with one player does both jobs.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const planck = require('planck');
const QRCode = require('qrcode');
const { CONFIG, TUNABLE } = require('./config');

const { Vec2, World, Circle, Box, RevoluteJoint } = planck;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib/three/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/lib/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.get('/qr.svg', async (req, res) => {
  const url = String(req.query.url || '').slice(0, 300);
  res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 1 }));
});

// ---------------------------------------------------------------- level
// World units are meters, y points UP. The cliff is CONFIG.width wide and CONFIG.top tall.
// Holds are points hands grab and feet stand on. "Duo gaps" are bands with no holds: too tall for
// one move, so the arms and legs players have to pull and push at the same moment.
function buildLevel(seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const holds = [];
  const gaps = CONFIG.duoGaps; // [[bottom, top], ...]
  // friendly starter row so the first jump works for everyone
  for (let i = 0; i < 7; i++) holds.push({ id: holds.length, x: 0.9 + i * (CONFIG.width - 1.8) / 6, y: 1.9 });
  let y = 3.4;
  while (y < CONFIG.top - 1) {
    const inGap = gaps.find(([a, b]) => y > a && y < b);
    if (inGap) { y = inGap[1]; continue; }
    const n = 4 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const lane = (i + rand() * 0.8) / n;
      holds.push({ id: holds.length, x: 0.8 + lane * (CONFIG.width - 1.6), y: y + rand() * 0.4 });
    }
    y += CONFIG.holdSpacing + rand() * 0.35;
  }
  return { holds, gaps, width: CONFIG.width, top: CONFIG.top };
}

// ---------------------------------------------------------------- game state
const COLORS = ['#ff5a5f', '#3ec1d3', '#ffd23f', '#7bd389', '#c77dff', '#ff9f1c', '#f5f5f5', '#4d96ff'];
// first color nobody has, so leaving + rejoining never gives two climbers the same color
const freeColor = () => { const used = new Set([...climbers.values()].map(c => c.color)); return COLORS.find(c => !used.has(c)) || COLORS[climbers.size % COLORS.length]; };
// collision layers: torsos bump the world, torsos and feet; arms/legs only the world; feet also stand on holds
const CAT = { WORLD: 0x1, TORSO: 0x2, ARM: 0x4, HOLD: 0x8, FOOT: 0x10 };
let world, ground, level;
let climbers = new Map(); // climber id -> climber (one body, driven by 1-2 players or a bot)
let players = new Map();  // socket id -> { id, name, climberId, role: 'arms' | 'legs' }
let phase = 'lobby';      // lobby | playing | results
let winner = null;
let events = [];
let roundStart = 0;
let seq = 0;

function now() { return Date.now(); }
function emitEvent(type, data) { events.push({ type, ...data }); }

function resetWorld() {
  world = new World({ gravity: Vec2(0, -CONFIG.gravity) });
  ground = world.createBody();
  const W = CONFIG.width, T = CONFIG.top + 6;
  // thick boxes, not thin edges: a hard landing can poke a foot through an edge and trap it underneath
  ground.createFixture(new Box(W / 2 + 2, 1, Vec2(W / 2, -1), 0), { friction: 0.8 });
  ground.createFixture(new Box(1, T / 2, Vec2(-1, T / 2), 0), { friction: 0.2 });
  ground.createFixture(new Box(1, T / 2, Vec2(W + 1, T / 2), 0), { friction: 0.2 });
  level = buildLevel();
  // holds are solid only to feet: you can stand on them, hands grab them by distance
  for (const h of level.holds) {
    const f = ground.createFixture(new Circle(Vec2(h.x, h.y), 0.12), { friction: 1.2, filterCategoryBits: CAT.HOLD, filterMaskBits: CAT.FOOT });
    f.setUserData({ hold: h.id });
  }
  for (const c of climbers.values()) { c.body = null; c.hands = []; c.legs = []; }
}

// ---------------------------------------------------------------- climber bodies
function spawnClimber(c, index, total) {
  const x = CONFIG.width * (index + 1) / (total + 1);
  const standY = CONFIG.hipY + CONFIG.thigh + CONFIG.shin + CONFIG.footRadius + 0.03;
  c.body = world.createBody({ type: 'dynamic', position: Vec2(x, standY), fixedRotation: true, linearDamping: 0.05 });
  c.body.createFixture(new Circle(CONFIG.radius), {
    density: 1, friction: 0.6, restitution: 0.05, filterCategoryBits: CAT.TORSO, filterMaskBits: CAT.WORLD | CAT.TORSO | CAT.FOOT,
  });
  c.hands = [-1, 1].map(side => buildArm(c, side));
  c.legs = [-1, 1].map(side => buildLeg(c, side));
  const limbMass = (b) => b.getMass();
  c.mass = c.body.getMass() + c.hands.reduce((m, h) => m + limbMass(h.upper) + limbMass(h.fore) + limbMass(h.hand), 0)
    + c.legs.reduce((m, l) => m + limbMass(l.thigh) + limbMass(l.shin), 0);
  c.stamina = 100; c.carry = 0; c.overSince = 0; c.peakY = 0; c.airPeak = null; c.air = false;
  c.cdPush = 0; c.cdKick = 0; c.pushUntil = 0; c.tuckUntil = 0;
  c.lastPush = 0; c.lastLetGo = 0; c.lastFoot = 0; c.lastCombo = 0; c.holdingSince = 0; c.savedCounted = false;
  c.stats = { drops: 0, saves: 0, biggestFall: 0, boosts: 0, combos: 0, kicks: 0, pushes: 0 };
}

// arms spawn raised (hanging down would poke them through the floor)
function buildArm(c, side) {
  const p = c.body.getPosition();
  const sh = Vec2(p.x + side * CONFIG.shoulderX, p.y + CONFIG.shoulderY);
  const U = CONFIG.upperArm, F = CONFIG.foreArm;
  const armFix = { filterCategoryBits: CAT.ARM, filterMaskBits: CAT.WORLD, friction: 0.4 };
  const upper = world.createBody({ type: 'dynamic', position: Vec2(sh.x, sh.y + U / 2), angularDamping: 2 });
  upper.createFixture(new Box(0.06, U / 2), { ...armFix, density: 0.6 });
  const fore = world.createBody({ type: 'dynamic', position: Vec2(sh.x, sh.y + U + F / 2), angularDamping: 2 });
  fore.createFixture(new Box(0.055, F / 2), { ...armFix, density: 0.6 });
  const hand = world.createBody({ type: 'dynamic', position: Vec2(sh.x, sh.y + U + F), angularDamping: 2 });
  hand.createFixture(new Circle(CONFIG.handRadius), { ...armFix, density: 1.5, friction: 1 });
  world.createJoint(new RevoluteJoint({}, c.body, upper, sh));
  // elbows can't lock straight (a straight arm acts like a rigid pole and blocks pull-ups); they bend outward
  world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: side > 0 ? -2.8 : 0.2, upperAngle: side > 0 ? -0.2 : 2.8 }, upper, fore, Vec2(sh.x, sh.y + U)));
  world.createJoint(new RevoluteJoint({}, fore, hand, Vec2(sh.x, sh.y + U + F)));
  // grip: null | { kind: 'hold', id } | { kind: 'climber', id }
  return { side, upper, fore, hand, closed: false, joint: null, grip: null, noGripUntil: 0, since: 0 };
}

// legs hang straight down at spawn; knees bend outward like a climber's frog stance. Feet are solid
// (they stand on rocks and push off them) but never grab: only hands hold on.
function buildLeg(c, side) {
  const p = c.body.getPosition();
  const hip = Vec2(p.x + side * CONFIG.hipX, p.y - CONFIG.hipY);
  const T = CONFIG.thigh, S = CONFIG.shin;
  const thigh = world.createBody({ type: 'dynamic', position: Vec2(hip.x, hip.y - T / 2), angularDamping: 3 });
  thigh.createFixture(new Box(0.075, T / 2), { filterCategoryBits: CAT.ARM, filterMaskBits: CAT.WORLD, density: 0.8 });
  const shin = world.createBody({ type: 'dynamic', position: Vec2(hip.x, hip.y - T - S / 2), angularDamping: 3 });
  shin.createFixture(new Box(0.065, S / 2), { filterCategoryBits: CAT.ARM, filterMaskBits: CAT.WORLD, density: 0.8 });
  shin.createFixture(new Circle(Vec2(0, -S / 2), CONFIG.footRadius), {
    filterCategoryBits: CAT.FOOT, filterMaskBits: CAT.WORLD | CAT.HOLD | CAT.TORSO, density: 0.8, friction: 1.2,
  });
  world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -2.4, upperAngle: 2.4 }, c.body, thigh, hip));
  world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: side > 0 ? 0.05 : -2.5, upperAngle: side > 0 ? 2.5 : -0.05 }, thigh, shin, Vec2(hip.x, hip.y - T)));
  return { side, thigh, shin };
}
const footPoint = (l) => l.shin.getWorldPoint(Vec2(0, -CONFIG.shin / 2));

function removeClimberBodies(c) {
  if (!c.body) return;
  // anyone holding this climber lets go (destroyBody already removes the joints themselves)
  for (const o of climbers.values()) for (const h of o.hands || []) {
    if (h.grip && h.grip.kind === 'climber' && h.grip.id === c.id) { h.joint = null; h.grip = null; }
  }
  for (const h of c.hands) { world.destroyBody(h.hand); world.destroyBody(h.fore); world.destroyBody(h.upper); }
  for (const l of c.legs) { world.destroyBody(l.shin); world.destroyBody(l.thigh); }
  world.destroyBody(c.body);
  c.body = null; c.hands = []; c.legs = [];
}

function startRound() {
  for (const c of climbers.values()) removeClimberBodies(c);
  resetWorld();
  const list = [...climbers.values()];
  list.sort(() => Math.random() - 0.5);
  list.forEach((c, i) => spawnClimber(c, i, list.length));
  phase = 'playing'; winner = null; roundStart = now();
  io.emit('level', level);
  emitEvent('start', {});
}

// ---------------------------------------------------------------- grip
const holdGrips = (c) => c.hands.filter(h => h.grip && h.grip.kind === 'hold').length;
const gripCount = (c) => c.hands.filter(h => h.joint).length;
const feetOnRock = (c) => c.legs.some(l => footContact(l));
const anchored = (c) => holdGrips(c) > 0 || feetOnRock(c);

function tryGrab(c, h) {
  const hp = h.hand.getPosition();
  // holds first: a hold snaps the fist onto it
  let best = null, bd = CONFIG.grabRadius;
  for (const hold of level.holds) {
    const d = Math.hypot(hold.x - hp.x, hold.y - hp.y);
    if (d < bd) { bd = d; best = hold; }
  }
  if (best) {
    const at = Vec2(best.x, best.y);
    h.hand.setPosition(at); h.hand.setLinearVelocity(Vec2(0, 0));
    h.joint = world.createJoint(new RevoluteJoint({}, ground, h.hand, at));
    h.grip = { kind: 'hold', id: best.id };
    return gripped(c, h);
  }
  // then other climbers: their hands (holding hands) or their body
  for (const o of climbers.values()) {
    if (o === c || !o.body) continue;
    const oh = o.hands.find(x => Vec2.distance(hp, x.hand.getPosition()) < CONFIG.handRadius * 2 + CONFIG.climberGrab);
    const target = oh ? oh.hand : (Vec2.distance(hp, o.body.getPosition()) < CONFIG.radius + CONFIG.climberGrab ? o.body : null);
    if (!target) continue;
    h.joint = world.createJoint(new RevoluteJoint({}, h.hand, target, hp));
    h.grip = { kind: 'climber', id: o.id };
    emitEvent(oh ? 'handhold' : 'grabbed', { id: c.id, target: o.id });
    return gripped(c, h);
  }
}
function gripped(c, h) {
  h.since = now();
  if (h.grip.kind === 'hold') emitEvent('grab', { id: c.id });
}

// reason: undefined = you let go on purpose; otherwise you were forced off
function release(c, h, reason) {
  if (!h.joint) return;
  world.destroyJoint(h.joint);
  const g = h.grip;
  h.joint = null; h.grip = null;
  h.noGripUntil = now() + (reason ? 400 : 120);
  // letting go of someone who has nothing else to hang on to = betrayal
  if (!reason && g.kind === 'climber') {
    const o = climbers.get(g.id);
    if (o && o.body && !anchored(o) && !isStanding(o) && !heldBySomeoneElse(o, c)) {
      c.stats.drops++;
      emitEvent('drop', { id: c.id, victim: o.id });
    }
  }
}
function releaseAll(c, reason, lockMs) {
  if (!gripCount(c)) return;
  for (const h of c.hands) { release(c, h, reason); h.noGripUntil = now() + lockMs; }
  emitEvent('slip', { id: c.id, reason });
}
function heldBySomeoneElse(o, except) {
  for (const x of climbers.values()) {
    if (x === except || x === o || !x.body) continue;
    if (x.hands.some(h => h.grip && h.grip.kind === 'climber' && h.grip.id === o.id)) return true;
  }
  return false;
}

// climbers linked to c by a hand, in either direction
function linkedTo(c) {
  const out = new Set();
  for (const h of c.hands) if (h.grip && h.grip.kind === 'climber') out.add(h.grip.id);
  for (const o of climbers.values()) {
    if (o !== c && o.body && o.hands.some(h => h.grip && h.grip.kind === 'climber' && h.grip.id === c.id)) out.add(o.id);
  }
  return out;
}
// how many people hang off you: linked climbers with no hold and no floor, and everyone hanging off them
function danglingFrom(c) {
  const seen = new Set([c.id]), stack = [c];
  let n = 0;
  while (stack.length) {
    for (const id of linkedTo(stack.pop())) {
      if (seen.has(id)) continue;
      seen.add(id);
      const o = climbers.get(id);
      if (!o || !o.body || anchored(o) || isStanding(o)) continue;
      n++; stack.push(o);
    }
  }
  return n;
}

function touchingClimberBelow(c, anchoredOnly = false) {
  const p = c.body.getPosition();
  for (const o of climbers.values()) {
    if (o === c || !o.body) continue;
    if (anchoredOnly && !anchored(o)) continue;
    const q = o.body.getPosition();
    const feet = c.legs.map(footPoint);
    if (q.y < p.y - 0.1 && (Vec2.distance(p, q) < CONFIG.radius * 2 + 0.25 || feet.some(f => Vec2.distance(f, q) < CONFIG.radius + CONFIG.footRadius + 0.1))) return o;
  }
  return null;
}
// what a foot is resting on right now: 'ground' (floor/hold) or null
function footContact(l) {
  for (let ce = l.shin.getContactList(); ce; ce = ce.next) {
    if (!ce.contact.isTouching()) continue;
    const fa = ce.contact.getFixtureA(), fb = ce.contact.getFixtureB();
    const mine = fa.getBody() === l.shin ? fa : fb;
    if (mine.getFilterCategoryBits() === CAT.FOOT && ce.other === ground) return 'ground';
  }
  return null;
}
function isStanding(c) {
  // torso on the floor/walls, a foot resting on the floor/a rock, or standing on a climber
  for (let ce = c.body.getContactList(); ce; ce = ce.next) {
    if (ce.contact.isTouching() && ce.other === ground) return true;
  }
  if (feetOnRock(c)) return true;
  return !!touchingClimberBelow(c);
}

