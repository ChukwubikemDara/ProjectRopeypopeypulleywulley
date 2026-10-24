// Headless smoke test: 4 phones join (= 2 teams of arms + legs), a round starts, and we check the core rules.
// Run: node test/sim.js
const { server, CONFIG, _debug } = require('../server');
const { io: connect } = require('socket.io-client');
const { Vec2 } = require('planck');

const PORT = 3999;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };
const gripFlags = (c, i) => c[11 + i * 5]; // snapshot hand flags: 1 closed, 2 gripping, 4 on a climber

const bodies = (c) => [c.body, ...c.hands.flatMap(h => [h.upper, h.fore, h.hand]), ...c.legs.flatMap(l => [l.thigh, l.shin])];
// move a climber (torso + all limbs) to a spot, at rest
function place(c, x, y) {
  const p = c.body.getPosition(), d = Vec2(x - p.x, y - p.y);
  for (const b of bodies(c)) { b.setPosition(Vec2.add(b.getPosition(), d)); b.setLinearVelocity(Vec2(0, 0)); }
}
async function peak(c, ms, fn = (c) => c.body.getPosition().y) {
  let m = -Infinity;
  for (let i = 0; i < ms / 16; i++) { await wait(16); m = Math.max(m, fn(c)); }
  return m;
}

server.listen(PORT, async () => {
  const players = [];
  let level = null, last = null, roster = null;
  const events = [];
  for (let i = 0; i < 4; i++) {
    const s = connect(`http://localhost:${PORT}`, { transports: ['websocket'] });
    const p = { s, id: null };
    s.on('you', id => (p.id = id));
    if (i === 0) {
      s.on('level', l => (level = l));
      s.on('roster', r => (roster = r));
      s.on('s', st => { last = st; events.push(...st.ev); });
    }
    await new Promise(r => s.on('connect', r));
    s.emit('join', { name: 'P' + i });
    players.push(p);
    await wait(50);
  }
  await wait(200);
  const P = (p) => _debug.players.get(p.id);
  const C = (p) => _debug.climbers.get(P(p).climberId);

  // ---- teams
  check(roster.length === 2 && roster.every(c => c.members.length === 2), `4 phones make 2 climbers of 2 (${roster.map(c => c.members.length).join('+')})`);
  check(roster.every(c => c.members.map(m => m.role).sort().join() === 'arms,legs'), 'each team has an arms and a legs player');
  const [a1, a2, b1, b2] = players; // join order: team A = P0 (arms) + P1 (legs), team B = P2 + P3
  check(C(a1) === C(a2) && C(b1) === C(b2) && C(a1) !== C(b1), 'players paired into teams in join order');
  a1.s.emit('swapRole'); await wait(100);
  check(P(a1).role === 'legs' && P(a2).role === 'arms', 'swapRole trades arms and legs');
  a1.s.emit('swapRole'); await wait(100);
  const A = () => C(a1), B = () => C(b1);

  players[0].s.emit('start');
  await wait(1500);
  check(level && level.holds.length > 50, `level built with ${level?.holds.length} holds`);
  check(last.phase === 'playing', 'round is playing');
  check(last.c.length === 2 && last.c[0].length === 27, '2 climbers spawned with arms + legs');
  const ys = last.c.map(c => c[2]);
  check(ys.every(y => y > 0.6 && y < 1.4), 'everyone standing on their legs: ' + ys.map(y => y.toFixed(2)).join(', '));
  check(A().legs.every(l => !l.plant) && A().hands.every(h => !h.joint), 'feet stand on the floor without holding on to it');

  // ---- the arms can't jump: a jerk from the arms phone does nothing
  events.length = 0;
  const yArms = A().body.getPosition().y;
  a1.s.emit('gesture', 'flick', 1.5); await wait(500);
  check(!events.some(e => e.type === 'push') && Math.abs(A().body.getPosition().y - yArms) < 0.2, 'arms phone jerking does not jump');

  // ---- arms close hands, LEGS hop, the hands grab the starter row
  for (const p of [a1, b1]) { p.s.emit('input', { aim: 0, ay: 1, brace: true, l: true, r: true }); }
  await wait(100);
  for (const p of [a2, b2]) p.s.emit('gesture', 'flick', 1);
  await wait(1500);
  const gripping = last.c.filter(c => (gripFlags(c, 0) | gripFlags(c, 1)) & 2).length;
  check(gripping >= 1, `${gripping}/2 grabbed a hold after the legs hopped with hands closed`);

  // ---- legs: push off the floor
  const bLegs = B();
  b1.s.emit('input', { l: false, r: false });
  for (let i = 0; i < 60 && !bLegs.legs.some(l => l.plant); i++) await wait(50); // let them land first
  const y0 = bLegs.body.getPosition().y;
  events.length = 0;
  b2.s.emit('gesture', 'flick', 1);
  const traj = [];
  const pushTop = await peak(bLegs, 700, (c) => { const y = c.body.getPosition().y; traj.push(y.toFixed(2) + '/' + c.body.getLinearVelocity().y.toFixed(1)); return y; });
  check(pushTop > y0 + 1, `legs push launches the body (${y0.toFixed(2)} -> ${pushTop.toFixed(2)})`);
  if (pushTop <= y0 + 1) console.log('  traj', traj.slice(0, 14).join(' '), '\n  holders', [...(_debug.climbers.values())].map(o => o.hands.map(h => h.grip ? h.grip.kind + ':' + h.grip.id : '-').join('|')).join(' ; '), '\n  debug: events', events.map(e => e.type).join(','), 'planted', bLegs.legs.map(l => !!l.plant), 'grips', bLegs.hands.map(h => !!h.joint), 'feet', bLegs.legs.map(l => l.shin.getWorldPoint(Vec2(0, -CONFIG.shin / 2)).y.toFixed(2)), 'torsoContacts', (() => { let n = 0; for (let ce = bLegs.body.getContactList(); ce; ce = ce.next) if (ce.contact.isTouching()) n++; return n; })());
  // the legs player's moves can't move the hands, and the arms player's thumbs don't plant feet
  b2.s.emit('input', { l: true, r: true }); await wait(100);
  check(!bLegs.hands.some(h => h.closed), 'legs player cannot close the hands');

  // ---- gap math: a normal hop (standing on the top rock) can't cross, the hanging combo can
  const g = CONFIG.gravity, rise = (v) => (v * v) / (2 * g);
  const handReach = CONFIG.shoulderY + CONFIG.upperArm + CONFIG.foreArm + CONFIG.grabRadius;
  const standing = CONFIG.hipY + CONFIG.thigh + CONFIG.shin; // torso above the rock you stand on
  const [gb, gt] = CONFIG.duoGaps[0];
  const gapHeight = Math.min(...level.holds.filter(h => h.y >= gt).map(h => h.y)) - Math.max(...level.holds.filter(h => h.y <= gb).map(h => h.y));
  const hopReach = standing + rise(CONFIG.legPushSpeed * 1.15 * (1 + CONFIG.flickJank)) + handReach;
  const comboReach = -0.75 + rise(CONFIG.legPushSpeed + CONFIG.comboBonus) + handReach; // from hanging 0.75 m below the hold
  check(hopReach < gapHeight, `strongest normal hop reaches ${hopReach.toFixed(2)}m < gap ${gapHeight.toFixed(2)}m`);
  check(comboReach > gapHeight, `hanging combo reaches ${comboReach.toFixed(2)}m > gap ${gapHeight.toFixed(2)}m`);

  // ---- the real thing: hang under the first gap, legs hop, arms let go 120 ms later
  const below = level.holds.filter(h => h.y <= gb).sort((p, q) => q.y - p.y)[0];
  const nextUp = Math.min(...level.holds.filter(h => h.y >= gt).map(h => h.y));
  for (const p of [a1, a2]) p.s.emit('input', { l: false, r: false, brace: false });
  await wait(200);
  place(A(), below.x, below.y - 0.75);
  A().hands.forEach(h => h.hand.setPosition(Vec2(below.x, below.y - 0.05)));
  a1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: true });
  a2.s.emit('input', { aim: 0, brace: false });
  await wait(700);
  check(A().hands.every(h => h.grip && h.grip.kind === 'hold'), 'A hangs under the gap with both hands');
  events.length = 0;
  a2.s.emit('gesture', 'flick', 1); await wait(120); a1.s.emit('input', { aim: 0, ay: 0.9, l: false, r: false });
  const handTop = await peak(A(), 1100, (c) => Math.max(...c.hands.map(h => h.hand.getPosition().y)));
  check(events.some(e => e.type === 'combo'), 'legs hop then arms let go within the window = combo');
  check(handTop > nextUp - 0.5, `combo dyno gets the hands to the far side (${handTop.toFixed(2)} vs next hold ${nextUp.toFixed(2)})`);

  // ---- arms tilt steers in the air
  for (const p of [a1, a2]) p.s.emit('input', { l: false, r: false, aim: 0 });
  await wait(100);
  place(A(), 6, 12);
  a1.s.emit('input', { aim: 1, ay: 0.6, l: false, r: false });
  await wait(30);
  const x0 = A().body.getPosition().x; await wait(400);
  check(A().body.getPosition().x - x0 > 0.4, `arms tilt steers the falling body (${(A().body.getPosition().x - x0).toFixed(2)} m right)`);

  // ---- jumping past holds: a trailing foot must not snag under a hold (holds are one-way for feet)
  {
    let snags = 0;
    for (const h of level.holds.filter(h => h.y > 1.5 && h.y < 2.5)) {
      for (const p of [a1, a2]) p.s.emit('input', { aim: 0, ay: 0.6, l: false, r: false, brace: true });
      place(A(), h.x, 1.0); await wait(400);
      A().cdPush = 0; a2.s.emit('gesture', 'flick', 1);
      let prev = 0;
      for (let i = 0; i < 30; i++) { await wait(16); const vy = A().body.getLinearVelocity().y; if (prev > 3 && prev - vy > 1.2) snags++; prev = vy; }
    }
    check(snags === 0, `jumping up past holds never snags a foot (${snags} sudden stops)`);
  }

  // ---- holding hands + betrayal: B hangs off A's hand, A lets go -> a drop
  for (const p of [a1, a2, b1, b2]) p.s.emit('input', { l: false, r: false, brace: true });
  await wait(300);
  const hold = level.holds.find(h => h.y > 3 && h.x > 2 && h.x < 10);
  place(A(), hold.x, hold.y - 0.8);
  A().hands[0].hand.setPosition(Vec2(hold.x, hold.y - 0.1));
  a1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: false });
  a2.s.emit('input', { aim: 0, brace: false }); b2.s.emit('input', { aim: 0, brace: false });
  await wait(300);
  check(A().hands[0].grip && A().hands[0].grip.kind === 'hold', 'A hangs from a hold with the left hand');
  const ah = A().hands[1].hand.getPosition();
  place(B(), ah.x + 0.7, ah.y - 0.7); // off to the side: bodies not touching
  B().hands[0].hand.setPosition(Vec2(ah.x + 0.05, ah.y));
  a1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: true });
  b1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: false });
  await wait(600);
  check(A().hands[1].grip?.kind === 'climber' || B().hands[0].grip?.kind === 'climber', 'A and B are holding hands');
  check(A().carry === 1, `A is carrying B (carry=${A().carry})`);
  const s0 = A().stamina; await wait(500);
  check(A().stamina < s0, `carrying drains A's stamina (${s0.toFixed(0)} -> ${A().stamina.toFixed(0)})`);
  events.length = 0;
  a1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: false });
  b1.s.emit('input', { aim: 0, brace: true, l: false, r: false });
  await wait(300);
  check(events.some(e => e.type === 'drop' && e.id === A().id && e.victim === B().id), 'A letting go of B counts as a betrayal drop');

  // ---- kick: A's legs player kicks B standing by A's feet
  place(B(), A().legs[0].shin.getWorldPoint(Vec2(0, -CONFIG.shin / 2)).x + 0.45, A().body.getPosition().y - 0.9);
  await wait(50);
  events.length = 0;
  A().cdKick = 0;
  a2.s.emit('gesture', 'kick', 1.2);
  await wait(200);
  check(events.some(e => e.type === 'kick' && e.id === A().id && e.target === B().id), 'legs player kicks the rival next to their feet');

  // ---- bots + run for a while without crashing
  players[0].s.emit('addBot');
  players[0].s.emit('addBot');
  players[0].s.emit('start');
  await wait(4000);
  check(last.c.length === 4, '2 teams + 2 bots in the next round');
  check(last.c.every(c => c.slice(1).every(v => typeof v !== 'number' || Number.isFinite(v))), 'physics stays finite after 4s with bots');

  // ---- someone leaves: their teammate keeps the climber and does both jobs
  b2.s.disconnect(); await wait(300);
  check(roster.find(c => c.id === B().id)?.members.length === 1 && roster.find(c => c.id === B().id).members[0].role === 'both', 'teammate leaves -> the other does arms + legs');

  console.log(ok ? '\nALL GOOD' : '\nSOMETHING FAILED');
  process.exit(ok ? 0 : 1);
});
