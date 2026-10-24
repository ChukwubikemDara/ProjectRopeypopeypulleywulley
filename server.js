// Tethered — game server
// Runs ALL physics (Planck.js) and game rules. Phones only send inputs and draw what this sends back.
// Run: node server.js   (then open http://localhost:3000/screen.html on a laptop, phones use the QR code)
//
// Teams: each climber is driven by up to two phones. The ARMS only hold on: tilt points the hands
// (and steers you in the air), thumbs grip. The LEGS are the only way up: hop = push off, lean swings
// the feet, shove = kick, but feet can't hold on to anything. A climber with one player does both jobs.

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const planck = require('planck');
const QRCode = require('qrcode');
const { CONFIG, TUNABLE } = require('./config');

const { Vec2, World, Circle, Box, Polygon, RevoluteJoint } = planck;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib/three/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/lib/three', express.static(path.join(__dirname, 'node_modules/three/build')));
// the link phones should use: the local-Wi-Fi https address when we serve one (private network
// addresses first, e.g. a phone hotspot), so a big screen opened at localhost shows a QR phones can use
let lanJoinUrl = null;
app.get('/join-url', (req, res) => res.json({ url: lanJoinUrl }));
app.get('/qr.svg', async (req, res) => {
  const url = String(req.query.url || '').slice(0, 300);
  res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 1 }));
});

// ---------------------------------------------------------------- level
// The race course lives in course.js (pure data: terrain, holds, moving objects, the racing line).
// World units are meters, y points UP.
const COURSE = require('./course');
// what clients get: the course minus physics-only state (bodies, timers)
function levelForClients() {
  return { ...COURSE, holds: level.holds.map(({ id, x, y, kind, objectId }) => ({ id, x, y, kind, objectId })) };
}
// how far along the racing line a point is: 0 at the start, 1 at the flag
function progressAt(x, y) {
  const P = COURSE.path;
  let total = 0, best = { d: Infinity, at: 0 };
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], L = Math.hypot(bx - ax, by - ay);
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L)));
    const d = Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t));
    if (d < best.d) best = { d, at: total + L * t };
    total += L;
  }
  return best.at / total;
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
  // terrain: solid polygons (thick, so a hard landing can't poke a foot through and trap it)
  for (const t of COURSE.terrain) {
    ground.createFixture(new Polygon(t.pts.map(([x, y]) => Vec2(x, y))), { friction: t.friction ?? 0.8 });
  }
  level = { holds: COURSE.holds.map(h => ({ ...h, loadMs: 0, brokenUntil: 0 })), objects: [] };
  // moving objects (kinematic: they push climbers, nothing pushes them). Their handles are holds that ride along.
  for (const o of COURSE.objects) {
    const body = world.createBody({ type: 'kinematic', position: Vec2(o.x0, o.y) });
    body.createFixture(new Box(o.w / 2, o.h / 2), { friction: 0.9 });
    body.setLinearVelocity(Vec2(o.speed, 0));
    const obj = { ...o, body, bonked: new Map() };
    level.objects.push(obj);
    for (const [lx, ly] of o.handles || []) {
      level.holds.push({ id: level.holds.length, x: o.x0 + lx, y: o.y + ly, kind: 'handle', objectId: o.id, body, local: Vec2(lx, ly), loadMs: 0, brokenUntil: 0 });
    }
  }
  // static holds are solid only to feet: you can stand on them, hands grab them by distance
  for (const h of level.holds) {
    if (h.body) continue;
    const f = ground.createFixture(new Circle(Vec2(h.x, h.y), 0.12), { friction: 1.2, filterCategoryBits: CAT.HOLD, filterMaskBits: CAT.FOOT });
    f.setUserData({ hold: h.id });
  }
  // ...and one-way, like platforms: a foot passes through a hold from below or the side and only
  // lands on it coming down from above. Otherwise a trailing foot snags under a hold mid-jump and
  // stops the whole body.
  world.on('pre-solve', (contact) => {
    const a = contact.getFixtureA(), b = contact.getFixtureB();
    const holdFix = a.getUserData() && a.getUserData().hold !== undefined ? a : b.getUserData() && b.getUserData().hold !== undefined ? b : null;
    if (!holdFix) return;
    const shin = (holdFix === a ? b : a).getBody();
    const hold = level.holds[holdFix.getUserData().hold];
    const foot = shin.getWorldPoint(Vec2(0, -CONFIG.shin / 2));
    if (foot.y < hold.y + 0.1 || shin.getLinearVelocity().y > 0.5) contact.setEnabled(false);
  });
  for (const c of climbers.values()) { c.body = null; c.hands = []; c.legs = []; }
}

// ---------------------------------------------------------------- climber bodies
function spawnClimber(c, index, total) {
  const { x0, x1, y } = COURSE.spawn;
  const x = x0 + (x1 - x0) * (index + 0.5) / Math.max(1, total);
  const standY = y + CONFIG.hipY + CONFIG.thigh + CONFIG.shin + CONFIG.footRadius + 0.03;
  c.body = world.createBody({ type: 'dynamic', position: Vec2(x, standY), fixedRotation: true, linearDamping: 0.05 });
  c.body.createFixture(new Circle(CONFIG.radius), {
    density: 1, friction: 0.6, restitution: 0.05, filterCategoryBits: CAT.TORSO, filterMaskBits: CAT.WORLD | CAT.TORSO | CAT.FOOT,
  });
  c.hands = [-1, 1].map(side => buildArm(c, side));
  c.legs = [-1, 1].map(side => buildLeg(c, side));
  const limbMass = (b) => b.getMass();
  c.mass = c.body.getMass() + c.hands.reduce((m, h) => m + limbMass(h.upper) + limbMass(h.fore) + limbMass(h.hand), 0)
    + c.legs.reduce((m, l) => m + limbMass(l.thigh) + limbMass(l.shin), 0);
  c.stamina = 100; c.carry = 0; c.overSince = 0; c.peakY = 0; c.progress = 0; c.cdBonk = 0; c.airPeak = null; c.air = false;
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
  io.emit('level', levelForClients());
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
  const t = now();
  for (const hold of level.holds) {
    if (hold.brokenUntil > t) continue; // a snapped twig is gone for a while
    const d = Math.hypot(hold.x - hp.x, hold.y - hp.y);
    if (d < bd) { bd = d; best = hold; }
  }
  if (best) {
    const at = Vec2(best.x, best.y);
    h.hand.setPosition(at); h.hand.setLinearVelocity(best.body ? best.body.getLinearVelocity() : Vec2(0, 0));
    h.joint = world.createJoint(new RevoluteJoint({}, best.body || ground, h.hand, at));
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
// is this body resting ON TOP of the world (terrain, a hold, the cart)? Contacts with a wall or a
// ceiling don't count: brushing the wall isn't footing (or you could hop straight up it).
function restingOn(body, onlyCategory) {
  for (let ce = body.getContactList(); ce; ce = ce.next) {
    const ct = ce.contact;
    if (!ct.isTouching() || !ct.isEnabled()) continue;
    if (ce.other !== ground && ce.other.getType() !== 'kinematic') continue;
    const fa = ct.getFixtureA(), mine = fa.getBody() === body ? fa : ct.getFixtureB();
    if (onlyCategory && mine.getFilterCategoryBits() !== onlyCategory) continue;
    const n = ct.getWorldManifold(null).normal; // points from fixture A to fixture B
    if ((mine === fa ? -n.y : n.y) > 0.5) return true;
  }
  return false;
}
// what a foot is resting on right now: 'ground' (floor / a rock / a hold / the cart) or null
function footContact(l) { return restingOn(l.shin, CAT.FOOT) ? 'ground' : null; }
function isStanding(c) {
  // torso sitting on something, a foot resting on something, or standing on a climber
  if (restingOn(c.body)) return true;
  if (feetOnRock(c)) return true;
  return !!touchingClimberBelow(c);
}

// ---------------------------------------------------------------- players, teams, roles
const humans = (c) => [...players.values()].filter(p => p.climberId === c.id);
// what a player actually controls: alone on a climber you do both jobs
function roleOf(p) {
  const c = climbers.get(p.climberId);
  return c && humans(c).length > 1 ? p.role : 'both';
}
function teamName(c) {
  if (c.bot) return c.name;
  const hs = humans(c).sort((a, b) => (a.role === 'arms' ? -1 : 1));
  return hs.map(p => p.name).join(' + ') || c.name;
}
function joinTeam(p, c) {
  const taken = humans(c).map(x => x.role);
  p.climberId = c.id;
  p.role = taken.includes('arms') ? 'legs' : 'arms';
  c.name = teamName(c);
}
function newClimberFor(p) {
  const id = 'c' + (++seq);
  const c = { id, name: p.name, color: freeColor(), aim: 0, braceInput: true, legBrace: true, hands: [], legs: [] };
  climbers.set(id, c);
  joinTeam(p, c);
  return c;
}
function leaveTeam(p) {
  const c = climbers.get(p.climberId);
  p.climberId = null;
  if (!c) return;
  if (!humans(c).length && !c.bot) { removeClimberBodies(c); climbers.delete(c.id); }
  else { c.name = teamName(c); for (const o of humans(c)) o.role = 'arms'; }
}
// a team with exactly one human has a free seat
const openTeam = (except) => [...climbers.values()].find(c => !c.bot && c !== except && humans(c).length === 1);

// ---------------------------------------------------------------- inputs
function onInput(p, msg) {
  const c = climbers.get(p.climberId);
  if (!c) return;
  const role = roleOf(p);
  const num = (v) => typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : null;
  if (role !== 'legs') {
    if (num(msg.aim) !== null) c.aim = num(msg.aim);
    if (num(msg.ay) !== null) c.ay = num(msg.ay);
    if (typeof msg.brace === 'boolean') c.braceInput = msg.brace;
    if (typeof msg.l === 'boolean') setHand(c, 0, msg.l);
    if (typeof msg.r === 'boolean') setHand(c, 1, msg.r);
  }
  if (role === 'legs') {
    if (num(msg.aim) !== null) c.legAim = num(msg.aim);
    if (typeof msg.brace === 'boolean') c.legBrace = msg.brace;
  }
}
function setHand(c, i, closed) {
  const h = c.hands && c.hands[i];
  if (!h) { c.wantClosed = c.wantClosed || [false, false]; c.wantClosed[i] = closed; return; }
  h.closed = closed;
  if (!closed && h.joint) {
    release(c, h);
    // the arms just let go of the wall completely. Hanging (no footing) and the legs hopped a
    // moment ago against the wall? That's the combo.
    if (!gripCount(c)) {
      const t = now();
      c.lastLetGo = t; c.letGoHanging = !feetOnRock(c);
      if (t - c.lastPush < CONFIG.comboWindow * 1000 && c.pushHanging) launch(c, t);
    }
  }
}

function onGesture(p, g, power) {
  const c = climbers.get(p.climberId);
  if (phase !== 'playing' || !c || !c.body) return 'not playing';
  if (process.env.DEBUG) console.log(new Date().toISOString().slice(11, 23), 'gesture', p.name, roleOf(p), g, 'power', power);
  const t = now(), role = roleOf(p);
  if (role === 'arms') return 'arms cannot jump'; // the arms only tilt and grip
  if (g === 'flick' || g === 'push') {
    const r = doPush(c, t, power);
    if (process.env.DEBUG && r !== 'pushed' && r !== 'combo') console.log(new Date().toISOString().slice(11, 23), 'push IGNORED', p.name, r);
    return r;
  }
  if (g === 'yank' || g === 'tuck') { c.tuckUntil = t + 700; return 'tuck'; }
  if (g === 'kick') { doKick(c, t); return 'kick'; }
}

function comboDone(c, t) {
  c.lastCombo = t;
  c.stamina = Math.max(0, c.stamina - CONFIG.comboCost);
  c.stats.combos++;
  emitEvent('combo', { id: c.id });
}
const bodiesOf = (c) => [c.body, ...c.hands.flatMap(h => [h.upper, h.fore, h.hand]), ...c.legs.flatMap(l => [l.thigh, l.shin])];
// the combo: the body launches while the hands are off the wall; closed hands catch whatever they pass
function launch(c, t) {
  if (t - c.lastCombo < CONFIG.comboCooldown * 1000) return false;
  for (const h of c.hands) if (h.joint) { release(c, h, 'dyno'); h.noGripUntil = t + 180; }
  c.pushUntil = t + 220; c.pushDir = pushDirection(c); c.pushSpeed = CONFIG.legPushSpeed + CONFIG.comboBonus;
  comboDone(c, t);
  return true;
}
function pushDirection(c) {
  const hip = c.body.getPosition();
  const feet = c.legs.map(footPoint);
  const fx = (feet[0].x + feet[1].x) / 2;
  // mostly up, steered by the legs player's lean (and a little by where the feet are), never sideways
  const lean = Math.sin((c.legAim || 0) * 30 * Math.PI / 180) * 0.6;
  const dir = Vec2(lean + Math.max(-0.3, Math.min(0.3, (hip.x - fx) * 0.4)), 1); dir.normalize();
  return dir;
}

// legs, hop / stand up fast: the ONLY way up. Push off whatever the feet touch: the floor, a rock you
// stand on, or the wall while the hands hold on. Normal climbing: feet on a rock, arms let go, legs hop.
// Combo: hanging with no footing, legs hop against the wall and the arms let go together = launch.
function doPush(c, t, power) {
  if (t < c.cdPush) return 'cooldown';
  const letGoJustNow = !gripCount(c) && t - c.lastLetGo < CONFIG.comboWindow * 1000;
  const feetDown = feetOnRock(c) || t - c.lastFoot < 250 || gripCount(c) > 0 || isStanding(c) || letGoJustNow;
  if (!feetDown) return 'no footing';
  c.cdPush = t + 400;
  c.lastPush = t;
  c.pushHanging = gripCount(c) > 0 && !feetOnRock(c); // smearing the wall while the hands hold on
  c.stats.pushes++;
  emitEvent('push', { id: c.id });
  // the arms let go of a hanging position first, then the hop: launch
  if (letGoJustNow && c.letGoHanging && launch(c, t)) return 'combo';
  const strength = Math.max(0.6, Math.min(1.15, typeof power === "number" ? power : 1));
  let speed = CONFIG.legPushSpeed * strength * (1 + (Math.random() * 2 - 1) * CONFIG.flickJank);
  // standing on a climber who holds on = boost off them (they get shoved down)
  const booster = gripCount(c) ? null : touchingClimberBelow(c, true);
  if (booster) {
    speed *= CONFIG.boostMult;
    c.stats.boosts++;
    booster.body.applyLinearImpulse(Vec2(0, -speed * 0.15 * booster.body.getMass()), booster.body.getPosition(), true);
    emitEvent('boost', { id: c.id, by: booster.id });
  }
  // powered briefly: a one-off kick gets soaked up by the limbs. Hands still holding? You only
  // push into your arms, until they let go.
  c.pushUntil = t + 160; c.pushDir = pushDirection(c); c.pushSpeed = speed;
  return 'pushed';
}

// legs, shove the phone forward: kick whoever is near your feet
function doKick(c, t) {
  if (t < c.cdKick) return;
  c.cdKick = t + CONFIG.kickCooldown * 1000;
  const feet = c.legs.map(footPoint);
  for (const o of climbers.values()) {
    if (o === c || !o.body) continue;
    const q = o.body.getPosition();
    const f = feet.find(f => Vec2.distance(f, q) < CONFIG.radius + 0.55);
    if (!f) continue;
    const dir = Vec2.sub(q, f); dir.normalize();
    o.body.applyLinearImpulse(Vec2.mul(dir, CONFIG.kickImpulse * o.body.getMass()), q, true);
    const held = !(holdGrips(o) && !o.braced);
    if (!held) { const oh = o.hands.find(x => x.grip && x.grip.kind === 'hold'); release(o, oh, 'kicked'); emitEvent('slip', { id: o.id, reason: 'kicked' }); }
    else o.stamina = Math.max(0, o.stamina - 20);
    c.stats.kicks++;
    emitEvent('kick', { id: c.id, target: o.id, held });
  }
}

// ---------------------------------------------------------------- moving and breakable things
// the cart rolls between its two ends; holds on it ride along
function moveObjects() {
  for (const o of level.objects) {
    const x = o.body.getPosition().x;
    if (x >= o.x1) o.body.setLinearVelocity(Vec2(-o.speed, 0));
    else if (x <= o.x0) o.body.setLinearVelocity(Vec2(o.speed, 0));
  }
  for (const h of level.holds) if (h.body) { const w = h.body.getWorldPoint(h.local); h.x = w.x; h.y = w.y; }
}
// the cart rams your body: you get knocked back and up (it doesn't care if you were holding on)
function bonkCheck(c, t) {
  if (t < c.cdBonk) return;
  for (let ce = c.body.getContactList(); ce; ce = ce.next) {
    if (!ce.contact.isTouching() || ce.other.getType() !== 'kinematic') continue;
    const cart = ce.other, v = cart.getLinearVelocity();
    const away = Math.sign(c.body.getPosition().x - cart.getPosition().x) || Math.sign(v.x) || 1;
    for (const b of bodiesOf(c)) b.setLinearVelocity(Vec2.add(b.getLinearVelocity(), Vec2(away * 4.5, 3.5)));
    c.cdBonk = t + 800;
    emitEvent('bonk', { id: c.id });
    return;
  }
}
// the twig bends under you and snaps if you hang on it too long; it regrows a few seconds later
function strainTwigs(t) {
  for (const hold of level.holds) {
    if (!hold.breakMs || hold.brokenUntil > t) continue;
    const on = [];
    for (const c of climbers.values()) for (const h of c.hands || []) if (h.grip && h.grip.kind === 'hold' && h.grip.id === hold.id) on.push([c, h]);
    hold.loadMs = on.length ? hold.loadMs + DT * 1000 : Math.max(0, hold.loadMs - DT * 500);
    if (hold.loadMs < hold.breakMs) continue;
    for (const [c, h] of on) release(c, h, 'snapped');
    hold.brokenUntil = t + hold.regrowMs; hold.loadMs = 0;
    emitEvent('snap', { id: on[0][0].id, hold: hold.id });
  }
}

// ---------------------------------------------------------------- simulation step
const DT = 1 / 60;
// muscle: pull `part` toward `target`, push the torso the opposite way (internal force, no free flying)
function muscle(c, part, at, target, k, d, max) {
  const rv = Vec2.sub(part.getLinearVelocityFromWorldPoint(at), c.body.getLinearVelocity());
  let f = Vec2(k * (target.x - at.x) - d * rv.x, k * (target.y - at.y) - d * rv.y);
  const len = f.length();
  if (len > max) f = Vec2.mul(f, max / len);
  part.applyForce(f, at, true);
  c.body.applyForceToCenter(Vec2.neg(f), true);
}

function step() {
  if (phase !== 'playing') return;
  const t = now();

  for (const c of climbers.values()) {
    if (!c.body) continue;
    if (c.bot) botThink(c, t);
    bonkCheck(c, t);
    if (c.wantClosed) { c.wantClosed.forEach((v, i) => setHand(c, i, v)); c.wantClosed = null; }
    const p = c.body.getPosition();
    const weight = c.mass * CONFIG.gravity;
    c.braced = c.braceInput !== false && gripCount(c) > 0 && c.stamina > 0;

    // arms: each hand chases a point the arms player picks (tilt = a 2D pointer around the shoulder),
    // each on its own side so they don't tangle. A gripping hand moves your BODY instead (swing / hang).
    // Bots / old clients without a vertical axis fall back to "reach along the aim angle".
    const a = (c.aim || 0) * CONFIG.armAimDeg * Math.PI / 180;
    for (const h of c.hands) {
      const sh = c.body.getWorldPoint(Vec2(h.side * CONFIG.shoulderX, CONFIG.shoulderY));
      let ox, oy;
      if (typeof c.ay === 'number') {
        ox = (c.aim || 0) * CONFIG.reach + h.side * CONFIG.handSpread; oy = c.ay * CONFIG.reach;
        const L = Math.hypot(ox, oy); if (L > CONFIG.reach) { ox *= CONFIG.reach / L; oy *= CONFIG.reach / L; }
      } else { const ang = a + h.side * 0.35; ox = Math.sin(ang) * CONFIG.reach; oy = Math.cos(ang) * CONFIG.reach; }
      muscle(c, h.hand, h.hand.getPosition(), Vec2(sh.x + ox, sh.y + oy), CONFIG.armK, CONFIG.armD,
        CONFIG.armStrength * weight * (h.joint ? 1 : 0.35));
      if (h.closed && !h.joint && t > h.noGripUntil) tryGrab(c, h);
    }

    // legs: feet chase a point below the hips (lean = swing them sideways, tuck = knees up).
    // A foot resting on a rock props you up like a real leg, but it never grabs.
    const tucked = t < c.tuckUntil;
    const la = (c.legAim || 0) * CONFIG.legAimDeg * Math.PI / 180;
    for (const l of c.legs) {
      const hip = c.body.getWorldPoint(Vec2(l.side * CONFIG.hipX, -CONFIG.hipY));
      const R = tucked ? CONFIG.legReach * 0.4 : CONFIG.legReach;
      const target = Vec2(hip.x + Math.sin(la) * R + l.side * 0.1, hip.y - Math.cos(la) * R + (tucked ? 0.15 : 0));
      muscle(c, l.shin, footPoint(l), target, CONFIG.legK, CONFIG.legD, CONFIG.legStrength * weight * (footContact(l) ? 1 : 0.4));
    }
    if (feetOnRock(c)) c.lastFoot = t;

    // arms tilt steers you through the air: it sets your sideways speed directly (a gentle force
    // took ~0.5 s to build up and felt laggy on top of the network delay)
    // It steers the whole climber (centre of mass), otherwise the arms swinging toward the tilt
    // kick the body the opposite way first and steering feels delayed.
    if (!gripCount(c) && !feetOnRock(c)) {
      const parts = bodiesOf(c);
      let m = 0, mvx = 0;
      for (const b of parts) { m += b.getMass(); mvx += b.getMass() * b.getLinearVelocity().x; }
      const dvx = ((c.aim || 0) * CONFIG.airSpeed - mvx / m) * Math.min(1, CONFIG.airGrip * DT);
      for (const b of parts) { const v = b.getLinearVelocity(); b.setLinearVelocity(Vec2(v.x + dvx, v.y)); }
    }
    if (t < c.pushUntil) {
      const v = c.body.getLinearVelocity(), along = Vec2.dot(v, c.pushDir);
      if (along < c.pushSpeed) c.body.setLinearVelocity(Vec2.add(v, Vec2.mul(c.pushDir, c.pushSpeed - along)));
    }

    // big falls: measured from the highest point since you last had support
    const supported = gripCount(c) > 0 || isStanding(c);
    c.air = !supported;
    if (!supported) c.airPeak = Math.max(c.airPeak ?? p.y, p.y);
    else {
      const drop = (c.airPeak ?? p.y) - p.y;
      if (drop > 3) { c.stats.biggestFall = Math.max(c.stats.biggestFall, drop); emitEvent('fall', { id: c.id, m: Math.round(drop) }); }
      c.airPeak = null;
    }
    c.peakY = Math.max(c.peakY, p.y);
    c.progress = progressAt(p.x, p.y);
    if (p.x >= COURSE.finish.zoneX && p.y >= COURSE.finish.y - 0.3 && phase === 'playing') { phase = 'results'; winner = c.id; emitEvent('win', { id: c.id }); }
  }

  moveObjects();
  strainTwigs(t);
  world.step(DT, 10, 6);

  // carrying people -> stamina drain / grip break. Counted, not measured: joint forces spike
  // every time you catch yourself, which made the rules feel random. Feet on a rock = rest.
  for (const c of climbers.values()) {
    if (!c.body) continue;
    const n = gripCount(c), feet = feetOnRock(c);
    if (!n) { c.carry = 0; c.overSince = 0; c.holdingSince = 0; c.stamina = Math.min(100, c.stamina + CONFIG.staminaRegen * DT * (feet ? 1 : 0.5)); continue; }
    const carry = anchored(c) ? danglingFrom(c) : 0;
    c.carry = carry;
    // over the limit for half a second (fidgeting while someone hangs off you) = ripped off
    if (carry > (c.braced ? CONFIG.maxCarryBraced : CONFIG.maxCarryFidgeting)) {
      c.overSince = c.overSince || t;
      if (t - c.overSince > 500) { c.overSince = 0; releaseAll(c, 'ripped', 400); continue; }
    } else c.overSince = 0;
    let drain = carry * CONFIG.staminaDrain;
    if (n === 1 && !feet && !isStanding(c)) drain += CONFIG.oneHandDrain;
    if (drain > 0) {
      c.stamina -= drain * DT;
      if (c.stamina <= 0) { c.stamina = 0; releaseAll(c, 'exhausted', 1200); continue; }
    } else c.stamina = Math.min(100, c.stamina + CONFIG.staminaRegen * DT);
    if (carry > 0 && c.braced) {
      if (!c.holdingSince) c.holdingSince = t;
      if (t - c.holdingSince > 1500 && !c.savedCounted) { c.stats.saves++; c.savedCounted = true; emitEvent('save', { id: c.id }); }
    } else { c.holdingSince = 0; c.savedCounted = false; }
  }
}

// ---------------------------------------------------------------- bots (for testing with fewer phones)
function botThink(c, t) {
  c.braceInput = true;
  const p = c.body.getPosition();
  // aim for a reachable hold further along the course (some randomness so bots don't move in lockstep)
  if (!c.target || t > c.targetUntil || c.target.brokenUntil > t || progressAt(c.target.x, c.target.y) <= c.progress) {
    const options = level.holds.filter(h => h.brokenUntil <= t && Math.hypot(h.x - p.x, h.y - p.y) < 3.2 && progressAt(h.x, h.y) > c.progress + 0.004)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 3);
    c.target = options[Math.floor(Math.random() * options.length)] || null;
    c.targetUntil = t + 3500;
  }
  // no hold in reach: just head along the course
  const tx = c.target ? c.target.x - p.x : 1.5, ty = c.target ? c.target.y - p.y : 0.5;
  c.aim = Math.max(-1, Math.min(1, tx / 1.5)) * 0.8;
  c.ay = Math.max(-1, Math.min(1, ty / 1.2));
  c.legAim = Math.max(-1, Math.min(1, tx / 2));
  // bots are both players: hands stay closed. Hanging for a bit? Hop, then let go a beat later
  // (the combo) and grab again on the way up. Holding a person too long? Drop them. Bots are not loyal.
  for (const h of c.hands) {
    if (h.grip && h.grip.kind === 'climber' && t - h.since > 2500) h.openUntil = t + 800;
    setHand(c, c.hands.indexOf(h), t > (h.openUntil || 0));
  }
  if (!c.nextMove) c.nextMove = t + 600 + Math.random() * 1200;
  if (t < c.nextMove) return;
  c.nextMove = t + 1100 + Math.random() * 1400;
  const gripping = c.hands.filter(h => h.grip && h.grip.kind === 'hold');
  if (gripping.length) {
    doPush(c, t, 1);
    const letGoIn = 80 + Math.random() * 250;
    for (const h of c.hands) h.openUntil = t + letGoIn + 300;
    setTimeout(() => { if (c.body) c.hands.forEach((h, i) => setHand(c, i, false)); }, letGoIn);
  } else doPush(c, t, 1);
}

// ---------------------------------------------------------------- networking
function roster() {
  return [...climbers.values()].map(c => ({
    id: c.id, name: c.bot ? c.name : teamName(c), color: c.color, bot: !!c.bot,
    members: humans(c).map(p => ({ id: p.id, name: p.name, role: roleOf(p) })),
  }));
}
const pushRoster = () => io.emit('roster', roster());
const r2 = (v) => Math.round(v * 100) / 100;
function handState(h) {
  const hp = h.hand.getPosition(), e = h.upper.getWorldPoint(Vec2(0, CONFIG.upperArm / 2));
  const flags = (h.closed ? 1 : 0) | (h.joint ? 2 : 0) | (h.grip && h.grip.kind === 'climber' ? 4 : 0);
  return [r2(hp.x), r2(hp.y), r2(e.x), r2(e.y), flags];
}
function legState(l) {
  const k = l.thigh.getWorldPoint(Vec2(0, -CONFIG.thigh / 2)), f = footPoint(l);
  return [r2(k.x), r2(k.y), r2(f.x), r2(f.y), footContact(l) ? 1 : 0];
}
// climber: [id, x, y, braced, stamina, aim, air, L hand: hx, hy, ex, ey, flags, R hand: ...,
//           L leg: kx, ky, fx, fy, on a rock, R leg: ...]
function snapshot() {
  const t = now();
  return {
    phase, winner, t,
    elapsed: phase === 'playing' ? (t - roundStart) / 1000 : 0,
    c: [...climbers.values()].filter(c => c.body).map(c => {
      const p = c.body.getPosition();
      return [c.id, +p.x.toFixed(3), +p.y.toFixed(3), c.braced ? 1 : 0, Math.round(c.stamina), +((c.aim || 0).toFixed(2)), c.air ? 1 : 0,
        ...handState(c.hands[0]), ...handState(c.hands[1]), ...legState(c.legs[0]), ...legState(c.legs[1])];
    }),
    // moving objects [id, x, y], snapped holds, and how close each strained twig is to snapping (0-1)
    o: level.objects.map(o => { const p = o.body.getPosition(); return [o.id, r2(p.x), r2(p.y)]; }),
    b: level.holds.filter(h => h.brokenUntil > t).map(h => h.id),
    w: level.holds.filter(h => h.breakMs && h.loadMs > 0).map(h => [h.id, r2(h.loadMs / h.breakMs)]),
    ev: events.splice(0),
  };
}
function results() {
  const list = [...climbers.values()].filter(c => c.stats);
  const top = (k) => list.slice().sort((a, b) => b.stats[k] - a.stats[k])[0];
  const award = (title, c, val) => c && val > 0 ? { title, id: c.id, val } : null;
  return [
    winner && { title: 'King of the Mountain', id: winner, val: 'summit' },
    award('In Sync (pull + push combos)', top('combos'), top('combos')?.stats.combos),
    award('Kickboxer (kicks)', top('kicks'), top('kicks')?.stats.kicks),
    award('Backstabber (friends dropped)', top('drops'), top('drops')?.stats.drops),
    award('Leg Day (pushes)', top('pushes'), top('pushes')?.stats.pushes),
    award('Stepping Stool (boosts)', top('boosts'), top('boosts')?.stats.boosts),
    award('Biggest Fall', top('biggestFall'), Math.round(top('biggestFall')?.stats.biggestFall) + 'm'),
  ].filter(Boolean);
}

io.on('connection', (socket) => {
  socket.emit('config', { CONFIG, TUNABLE });
  if (level) socket.emit('level', levelForClients());
  socket.emit('roster', roster());
  socket.emit('you', socket.id);

  socket.on('join', ({ name } = {}) => {
    if (players.has(socket.id)) return;
    const p = { id: socket.id, name: String(name || 'Climber').slice(0, 14), climberId: null, role: 'arms' };
    players.set(socket.id, p);
    const team = openTeam();
    if (team) joinTeam(p, team); else newClimberFor(p);
    if (process.env.DEBUG) console.log('join', p.name, '->', p.climberId, p.role, socket.handshake.headers['user-agent']?.slice(0, 80));
    pushRoster();
  });
  // lobby: trade arms/legs with your teammate
  socket.on('swapRole', () => {
    const p = players.get(socket.id); if (!p) return;
    const c = climbers.get(p.climberId); if (!c) return;
    for (const x of humans(c)) x.role = x.role === 'arms' ? 'legs' : 'arms';
    c.name = teamName(c); pushRoster();
  });
  // lobby: move to a team with a free seat (or start your own)
  socket.on('switchTeam', () => {
    const p = players.get(socket.id); if (!p) return;
    const old = climbers.get(p.climberId);
    const team = openTeam(old);
    if (!team && old && humans(old).length === 1) return; // already alone: nowhere better to go
    leaveTeam(p);
    if (team) joinTeam(p, team); else newClimberFor(p);
    if (process.env.DEBUG) console.log('join', p.name, '->', p.climberId, p.role, socket.handshake.headers['user-agent']?.slice(0, 80));
    pushRoster();
  });
  // lobby: pick a team explicitly (any team with a free seat), or start a new one
  socket.on('joinTeam', (id) => {
    const p = players.get(socket.id); if (!p) return;
    const c = climbers.get(id);
    if (!c || c.bot || c.id === p.climberId || humans(c).length >= 2) return;
    leaveTeam(p); joinTeam(p, c);
    if (process.env.DEBUG) console.log('joinTeam', p.name, '->', c.id, p.role);
    pushRoster();
  });
  socket.on('newTeam', () => {
    const p = players.get(socket.id); if (!p) return;
    const old = climbers.get(p.climberId);
    if (old && humans(old).length === 1) return; // already alone
    leaveTeam(p); newClimberFor(p);
    pushRoster();
  });
  socket.on('rtt', (ack) => { if (typeof ack === 'function') ack(now()); }); // server clock, for snapshot age
  socket.on('input', (m) => {
    const p = players.get(socket.id); if (!p || !m) return;
    onInput(p, m);
    // phones report their lag numbers with the heartbeat: log them once a second
    if (process.env.DEBUG && m.lag && now() - (p.loggedAt || 0) > 1000) { p.loggedAt = now(); console.log(new Date().toISOString().slice(11, 23), 'lag', p.name, roleOf(p), JSON.stringify(m.lag)); }
  });
  // the ack tells the phone how long the hop took to land, and whether it counted
  socket.on('gesture', (g, power, ack) => {
    const p = players.get(socket.id);
    const r = p ? onGesture(p, g, power) : 'not joined';
    if (typeof ack === 'function') ack(r || 'ok');
  });
  socket.on('start', () => { if (climbers.size >= 1) startRound(); });
  // back to the lobby without a winner (e.g. a round nobody is finishing)
  socket.on('endRound', () => {
    if (phase !== 'playing') return;
    for (const c of climbers.values()) removeClimberBodies(c);
    phase = 'lobby'; winner = null;
  });
  socket.on('addBot', () => {
    const id = 'bot' + (++seq);
    climbers.set(id, { id, bot: true, name: 'Bot ' + seq, color: freeColor(), aim: 0, hands: [], legs: [] });
    pushRoster();
  });
  socket.on('clearBots', () => {
    for (const [id, c] of climbers) if (c.bot) { removeClimberBodies(c); climbers.delete(id); }
    pushRoster();
  });
  socket.on('tune', ({ key, value } = {}) => {
    if (key in TUNABLE && typeof value === 'number') {
      CONFIG[key] = value;
      if (key === 'gravity' && world) world.setGravity(Vec2(0, -value));
      io.emit('config', { CONFIG, TUNABLE });
    }
  });
  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (!p) return;
    leaveTeam(p);
    players.delete(socket.id);
    pushRoster();
  });
});

resetWorld();
setInterval(step, DT * 1000);
let lastPhase = phase;
setInterval(() => {
  io.volatile.emit('s', snapshot());
  if (phase === 'results' && lastPhase !== 'results') io.emit('results', results());
  lastPhase = phase;
}, 1000 / CONFIG.sendRate);

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Tethered running on http://localhost:${PORT}  (spectator: /screen.html)`));
  // HTTPS on the local network (phones need https for motion). `npm run lan` fetches the cert.
  const cert = path.join(__dirname, 'certs/server.pem'), key = path.join(__dirname, 'certs/server.key');
  if (fs.existsSync(cert) && fs.existsSync(key)) {
    const secure = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, app);
    io.attach(secure);
    const ips = Object.values(require('os').networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
    const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
    const ip = ips.find(isPrivate) || ips[0];
    if (ip) lanJoinUrl = `https://${ip.replace(/\./g, '-')}.local-ip.sh:${HTTPS_PORT}/`;
    // a busy port (another copy of the server) shouldn't take the whole game down
    secure.on('error', (e) => { lanJoinUrl = null; console.warn(`HTTPS disabled: ${e.code === 'EADDRINUSE' ? `port ${HTTPS_PORT} is already in use` : e.message}`); });
    secure.listen(HTTPS_PORT, () => console.log(`HTTPS on port ${HTTPS_PORT}. Phones join at ${lanJoinUrl || '(no network)'}`));
  }
}
// _debug: lets test/sim.js poke at the world directly (place climbers, read joints)
module.exports = { server, io, startRound, CONFIG, _debug: { climbers, players, step, get level() { return level; }, onInput, onGesture } };
