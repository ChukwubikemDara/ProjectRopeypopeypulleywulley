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

