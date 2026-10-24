// The race course, from the whiteboard sketch. Pure data: the server turns it into physics, the
// clients draw it. Meters, y up. Left to right:
//   START -> the tilted PIPE (ceiling handles, floor ridges, an obstacle) or the SHORTCUT over its top
//   -> the CHECKPOINT ledge -> THE WALL (one twig that snaps; needs the combo) or the LADDER
//   -> the top ledge with a rolling CART -> FINISH flag.

// pipe: floor line from F0 up to F1, ceiling 2.6 m above it (measured square to the floor)
const F0 = [5, 0], F1 = [22, 8], PIPE_GAP = 2.6, SLAB = 0.4;
const len = Math.hypot(F1[0] - F0[0], F1[1] - F0[1]);
const D = [(F1[0] - F0[0]) / len, (F1[1] - F0[1]) / len]; // along the pipe
const N = [-D[1], D[0]];                                    // square to it, pointing "up"
const at = (s, off) => [+(F0[0] + D[0] * s + N[0] * off).toFixed(3), +(F0[1] + D[1] * s + N[1] * off).toFixed(3)];
// a slab along the pipe: from s0 to s1, between offsets o0 and o1 above the floor line
const slab = (s0, s1, o0, o1) => [at(s0, o0), at(s1, o0), at(s1, o1), at(s0, o1)];

const LEDGE = { x0: 22, x1: 27.5, y: 8 };     // soft checkpoint, right where the pipe comes out
const TOP = { x0: 27.5, x1: 50, y: 15 };       // the big block: its left face is THE WALL
const FINISH = { x: 49, y: TOP.y };

// solid terrain: convex polygons, counter-clockwise. kind picks how it's drawn
const terrain = [
  { kind: 'rock', pts: [[-3, -3], [23, -3], [23, 0], [-3, 0]] },                      // start ground + under the pipe
  { kind: 'pipe', pts: slab(0, len, -SLAB, 0), friction: 0.9 },                        // pipe floor
  { kind: 'pipe', pts: slab(-1.2, len - 1.2, PIPE_GAP, PIPE_GAP + SLAB), friction: 0.15 }, // pipe ceiling: its outside top is the slippery SHORTCUT
  { kind: 'rock', pts: [[LEDGE.x0, -3], [LEDGE.x1, -3], [LEDGE.x1, LEDGE.y], [LEDGE.x0, LEDGE.y]] }, // checkpoint ledge
  { kind: 'rock', pts: [[TOP.x0, -3], [TOP.x1, -3], [TOP.x1, TOP.y], [TOP.x0, TOP.y]] },             // THE WALL + top ledge
  { kind: 'beam', pts: [[23.6, 16.3], [28.1, 16.3], [28.1, 16.7], [23.6, 16.7]] },    // overhang the ladder hangs from
  { kind: 'beam', pts: [[27.7, TOP.y], [28.1, TOP.y], [28.1, 16.3], [27.7, 16.3]] },  // its post
  { kind: 'rock', pts: [[-4, -3], [-1, -3], [-1, 30], [-4, 30]] },                    // left edge of the world
  { kind: 'rock', pts: [[51, -3], [54, -3], [54, 30], [51, 30]] },                    // right edge
];
// little ridges on the pipe floor to stand on (the floor is a slope)
for (let s = 2.2; s < len - 1; s += 1.9) terrain.push({ kind: 'ridge', pts: slab(s, s + 0.35, -0.05, 0.28) });
// the obstacle halfway up the pipe: go over it on the ceiling handles
terrain.push({ kind: 'crate', pts: slab(9.0, 10.3, -0.05, 1.35) });

// grab points. kind decides the look (and the twig's special rule)
const holds = [];
const hold = (x, y, kind, extra) => holds.push({ id: holds.length, x: +x.toFixed(3), y: +y.toFixed(3), kind, ...extra });
// ceiling handles inside the pipe: monkey bars
for (let s = 1.5; s < len - 1.2; s += 1.6) { const [x, y] = at(s, PIPE_GAP - 0.3); hold(x, y, 'handle'); }
// SHORTCUT: a few knobs on the slippery top of the pipe
for (const s of [-0.6, 3.2, 7.2, 11.2, 14.6]) { const [x, y] = at(s, PIPE_GAP + SLAB + 0.25); hold(x, y, 'knob'); }
// THE WALL: one twig halfway up (it snaps if you hang on it too long), then the lip at the top
hold(TOP.x0 - 0.2, 11.2, 'twig', { breakMs: 2500, regrowMs: 6000 });
hold(TOP.x0 - 0.05, TOP.y + 0.05, 'knob');
hold(TOP.x0 + 0.9, TOP.y + 0.1, 'knob');
// LADDER: rungs hanging from the overhang, reachable from the checkpoint ledge
for (let y = 11.6; y < 16.2; y += 0.45) hold(24.6, y, 'rung');
// a knob on the beam to haul yourself over the top of the ladder
hold(26.6, 16.85, 'knob');
// top ledge: a couple of knobs so a stumble near the cart isn't the end
hold(36, TOP.y + 0.12, 'knob');
hold(44, TOP.y + 0.12, 'knob');

// moving things. The cart rolls back and forth along the top ledge and knocks climbers over;
// its handles are grab points that move with it.
const objects = [
  { id: 'cart', kind: 'cart', w: 1.8, h: 0.75, x0: 31, x1: 47, y: TOP.y + 0.42, speed: 2.6,
    handles: [[-0.65, 0.55], [0.65, 0.55]] },
];

// the racing line: progress = how far along this you are (0 at the start, 1 at the flag)
const path = [[1, 1], [5, 1], at(len, 1.2), [LEDGE.x1 - 0.6, LEDGE.y + 1.2], [TOP.x0 + 0.5, TOP.y + 1.2], [FINISH.x, FINISH.y + 1.2]];

const signs = [
  { x: 3.2, y: 4.6, text: 'SHORTCUT ↗', sub: 'slippery · no ceiling to catch you' },
  { x: 24.8, y: 9.9, text: 'CHECKPOINT', sub: 'fall off the wall, land here' },
  { x: 32.5, y: 11.4, text: 'TEAMWORK', sub: 'hang on the twig · legs HOP + arms LET GO' },
];

module.exports = {
  name: 'The Long Way Up',
  bounds: { x0: -2, x1: 52, y0: -1, y1: 20 },
  spawn: { x0: 0.8, x1: 3.6, y: 0 },
  finish: { x: FINISH.x, y: FINISH.y, zoneX: FINISH.x - 0.8 },
  pipe: { f0: F0, f1: F1, gap: PIPE_GAP, slab: SLAB, dir: D, normal: N, length: +len.toFixed(3) },
  terrain, holds, objects, path, signs,
};
