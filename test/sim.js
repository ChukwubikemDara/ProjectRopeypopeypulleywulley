// Headless smoke test: 4 phones join (= 2 teams of arms + legs), a round starts on the race course,
// and we check the core rules. Run: node test/sim.js
const { server, CONFIG, _debug } = require('../server');
const COURSE = require('../course');
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
const STAND = CONFIG.hipY + CONFIG.thigh + CONFIG.shin + CONFIG.footRadius; // torso height above what you stand on

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
  const holdsOf = (kind) => _debug.level.holds.filter(h => h.kind === kind);
  const release = (...ps) => ps.forEach(p => p.s.emit('input', { aim: 0, ay: 0.6, l: false, r: false, brace: true }));

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
  check(level && level.terrain.length > 5 && level.holds.length > 25 && level.finish, `course sent to clients (${level?.terrain.length} terrain pieces, ${level?.holds.length} holds)`);
  check(level.holds.every(h => !('body' in h)), 'clients get plain data, no physics objects');
  check(last.phase === 'playing', 'round is playing');
  check(last.c.length === 2 && last.c[0].length === 27, '2 climbers spawned with arms + legs');
  const ys = last.c.map(c => c[2]), xs = last.c.map(c => c[1]);
  check(ys.every(y => y > 0.6 && y < 1.4) && xs.every(x => x >= COURSE.spawn.x0 - 0.5 && x <= COURSE.spawn.x1 + 0.5), 'everyone starts standing in the start area: ' + xs.map((x, i) => `(${x.toFixed(1)},${ys[i].toFixed(2)})`).join(' '));

  // ---- the arms can't jump: a jerk from the arms phone does nothing
  events.length = 0;
  const yArms = A().body.getPosition().y;
  a1.s.emit('gesture', 'flick', 1.5); await wait(500);
  check(!events.some(e => e.type === 'push') && Math.abs(A().body.getPosition().y - yArms) < 0.2, 'arms phone jerking does not jump');

  // ---- arms close hands, LEGS hop, the hands catch the first shortcut knob above the start
  const knob = holdsOf('knob').sort((p, q) => p.x - q.x)[0];
  // like a player, it may take a retry or two: try a few take-off spots / arm angles
  for (const [dx, aim] of [[-1.2, 0.5], [-0.5, 0], [-0.8, 0]]) {
    release(a1);
    place(A(), knob.x + dx, STAND + 0.05);
    a2.s.emit('input', { aim: 0.6, brace: true });
    await wait(400);
    a1.s.emit('input', { aim, ay: 1, brace: true, l: true, r: true });
    A().cdPush = 0; a2.s.emit('gesture', 'flick', 1);
    await wait(1000);
    if (A().hands.some(h => h.grip && h.grip.id === knob.id)) break;
  }
  check(A().hands.some(h => h.grip && h.grip.id === knob.id), `legs hop + closed hands catch the knob ${knob.y.toFixed(1)} m up`);

  // ---- legs: push off the floor (open ground at the start). Open all hands first: a closed free
  // hand grabs whoever comes near, and then they're hanging, not standing
  release(a1, b1); await wait(100);
  place(B(), 1.0, STAND + 0.05);
  for (let i = 0; i < 40 && !B().legs.some(l => l.shin && _debug.isStanding(B())); i++) await wait(50);
  await wait(300);
  const y0 = B().body.getPosition().y;
  b2.s.emit('gesture', 'flick', 1);
  const pushTop = await peak(B(), 700);
  check(pushTop > y0 + 1, `legs push launches the body (${y0.toFixed(2)} -> ${pushTop.toFixed(2)})`);
  b2.s.emit('input', { l: true, r: true }); await wait(100);
  check(!B().hands.some(h => h.closed), 'legs player cannot close the hands');

  // ---- THE WALL: a normal hop from the checkpoint can't reach the top, the twig combo can
  const g = CONFIG.gravity, rise = (v) => (v * v) / (2 * g);
  const handReach = CONFIG.shoulderY + CONFIG.upperArm + CONFIG.foreArm + CONFIG.grabRadius;
  const twig = holdsOf('twig')[0];
  const lip = _debug.level.holds.filter(h => h.kind === 'knob' && Math.abs(h.y - 15) < 0.3).sort((p, q) => p.x - q.x)[0];
  const ledgeY = 8;
  const hopReach = ledgeY + STAND + rise(CONFIG.legPushSpeed * 1.15 * (1 + CONFIG.flickJank)) + handReach;
  const comboReach = twig.y - 0.75 + rise(CONFIG.legPushSpeed + CONFIG.comboBonus) + handReach;
  check(hopReach < lip.y, `strongest hop from the checkpoint reaches ${hopReach.toFixed(2)} m < wall top ${lip.y.toFixed(2)} m`);
  check(comboReach > lip.y, `combo from the twig reaches ${comboReach.toFixed(2)} m > wall top ${lip.y.toFixed(2)} m`);

  // the real thing: hang on the twig (feet against the wall), legs hop, arms let go 120 ms later
  release(a1);
  await wait(200);
  place(A(), twig.x - 0.35, twig.y - 0.75);
  A().hands.forEach(h => h.hand.setPosition(Vec2(twig.x, twig.y - 0.05)));
  a1.s.emit('input', { aim: 0.3, ay: 0.9, brace: true, l: true, r: true });
  a2.s.emit('input', { aim: 0.4, brace: false });
  await wait(600);
  check(A().hands.some(h => h.grip && h.grip.id === twig.id), 'A hangs on the twig');
  events.length = 0;
  a2.s.emit('gesture', 'flick', 1); await wait(120); a1.s.emit('input', { aim: 0.3, ay: 0.9, l: false, r: false });
  const handTop = await peak(A(), 1100, (c) => Math.max(...c.hands.map(h => h.hand.getPosition().y)));
  check(events.some(e => e.type === 'combo'), 'feet against the wall still allow the combo (a wall is not footing)');
  check(handTop > lip.y - 0.3, `combo from the twig gets the hands to the wall top (${handTop.toFixed(2)} vs ${lip.y.toFixed(2)})`);

  // ---- the twig snaps if you hang on it too long
  release(a1); await wait(300);
  for (const h of holdsOf('twig')) h.brokenUntil = 0;
  place(A(), twig.x - 0.35, twig.y - 0.75);
  A().hands.forEach(h => h.hand.setPosition(Vec2(twig.x, twig.y - 0.05)));
  a1.s.emit('input', { aim: 0.3, ay: 0.9, brace: true, l: true, r: true });
  events.length = 0;
  await wait(twig.breakMs + 800);
  check(events.some(e => e.type === 'snap') && !A().hands.some(h => h.grip && h.grip.id === twig.id), `the twig snaps after ~${twig.breakMs / 1000} s and drops you`);

  // ---- arms tilt steers in the air (open air above the pipe)
  release(a1, a2);
  await wait(100);
  place(A(), 12, 14);
  a1.s.emit('input', { aim: 1, ay: 0.6, l: false, r: false });
  await wait(30);
  const x0 = A().body.getPosition().x; await wait(400);
  check(A().body.getPosition().x - x0 > 0.4, `arms tilt steers the falling body (${(A().body.getPosition().x - x0).toFixed(2)} m right)`);

  // ---- holds are one-way for feet: flying up past a knob doesn't snag a trailing foot
  {
    let snags = 0;
    for (const k of holdsOf('rung').slice(0, 4)) {
      release(a1, a2);
      place(A(), k.x, k.y - 1.3); await wait(50);
      for (const b of bodies(A())) b.setLinearVelocity(Vec2(0, 7.5));
      let prev = 7.5;
      for (let i = 0; i < 20; i++) { await wait(16); const vy = A().body.getLinearVelocity().y; if (prev > 3 && prev - vy > 1.2) snags++; prev = vy; }
    }
    check(snags === 0, `flying up past holds never snags a foot (${snags} sudden stops)`);
  }

  // ---- holding hands + betrayal: B hangs off A's hand, A lets go -> a drop (on the ladder, open air)
  for (const p of [a1, a2, b1, b2]) p.s.emit('input', { l: false, r: false, brace: true });
  await wait(300);
  const rung = holdsOf('rung')[4];
  place(A(), rung.x, rung.y - 0.8);
  A().hands[0].hand.setPosition(Vec2(rung.x, rung.y - 0.1));
  a1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: false });
  a2.s.emit('input', { aim: 0, brace: false }); b2.s.emit('input', { aim: 0, brace: false });
  await wait(300);
  check(A().hands[0].grip && A().hands[0].grip.kind === 'hold', 'A hangs from a ladder rung with the left hand');
  const ah = A().hands[1].hand.getPosition();
  place(B(), ah.x + 0.9, ah.y - 0.7); // off to the side: bodies not touching, clear of the ladder
  B().hands[0].hand.setPosition(Vec2(ah.x + 0.05, ah.y));
  a1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: true });
  b1.s.emit('input', { aim: 0, ay: 0.9, brace: true, l: true, r: false });
  await wait(600);
  check(A().hands[1].grip?.kind === 'climber' || B().hands[0].grip?.kind === 'climber', 'A and B are holding hands');
  check(A().carry === 1, `A is carrying B (carry=${A().carry})`);
  const s0 = A().stamina; await wait(500);
  check(A().stamina < s0, `carrying drains A's stamina (${s0.toFixed(0)} -> ${A().stamina.toFixed(0)})`);

  // ...and B can't hop off A to fly: holding a climber isn't footing
  events.length = 0;
  B().cdPush = 0; b2.s.emit('gesture', 'flick', 1); await wait(150);
  check(!events.some(e => e.type === 'push' && e.id === B().id), 'no pushing off a climber you are holding in mid-air');

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

  // ---- the cart rolls along the top and bonks a climber standing in its way
  release(a1, b1); await wait(200);
  place(A(), 10, 1.2); // out of the way
  const cart = _debug.level.objects[0];
  const dir = Math.sign(cart.body.getLinearVelocity().x) || 1;
  place(B(), cart.body.getPosition().x + dir * 2.5, 15 + STAND + 0.05);
  events.length = 0;
  for (let i = 0; i < 60 && !events.some(e => e.type === 'bonk'); i++) await wait(50);
  check(events.some(e => e.type === 'bonk' && e.id === B().id), 'the cart bonks a climber in its path');

  // ---- touching the flag wins the race
  release(a1, b1); await wait(100);
  events.length = 0;
  place(A(), COURSE.finish.x + 0.3, COURSE.finish.y + STAND + 0.05);
  await wait(300);
  check(last.phase === 'results' && last.winner === A().id, 'reaching the flag wins the race');

  // ---- bots + run for a while without crashing
  players[0].s.emit('addBot');
  players[0].s.emit('addBot');
  players[0].s.emit('start');
  await wait(4000);
  check(last.c.length === 4, '2 teams + 2 bots in the next round');
  check(last.c.every(c => c.slice(1).every(v => typeof v !== 'number' || Number.isFinite(v))), 'physics stays finite after 4s with bots');
  check(last.o && last.o.length === 1, 'snapshots carry the moving cart');

  // ---- someone leaves: their teammate keeps the climber and does both jobs
  b2.s.disconnect(); await wait(300);
  check(roster.find(c => c.id === B().id)?.members.length === 1 && roster.find(c => c.id === B().id).members[0].role === 'both', 'teammate leaves -> the other does arms + legs');

  console.log(ok ? '\nALL GOOD' : '\nSOMETHING FAILED');
  process.exit(ok ? 0 : 1);
});
