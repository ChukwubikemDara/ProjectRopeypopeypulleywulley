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

