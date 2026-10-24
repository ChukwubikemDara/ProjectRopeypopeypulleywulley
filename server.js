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

