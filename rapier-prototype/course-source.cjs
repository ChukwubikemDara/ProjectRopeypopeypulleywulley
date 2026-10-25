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
// the flag sits on a raised platform at the end, 3.2 m up: too high to hop, so the only way up is riding the bus
const FINISH_DECK = { x0: 47.6, x1: 51, y: TOP.y + 3.2 };
const FINISH = { x: 49.5, y: FINISH_DECK.y };

// solid terrain: convex polygons, counter-clockwise. kind picks how it's drawn
const terrain = [
  { kind: 'rock', pts: [[-3, -3], [23, -3], [23, 0], [-3, 0]] },                      // start ground + under the pipe
  { kind: 'pipe', pts: slab(0, len, -SLAB, 0), friction: 0.9 },                        // pipe floor
  { kind: 'pipe', pts: slab(0, len - 1.2, PIPE_GAP, PIPE_GAP + SLAB), friction: 0.15 }, // pipe ceiling: its outside top is the slippery SHORTCUT
  { kind: 'rock', pts: [[LEDGE.x0, -3], [LEDGE.x1, -3], [LEDGE.x1, LEDGE.y], [LEDGE.x0, LEDGE.y]] }, // checkpoint ledge
  { kind: 'rock', pts: [[TOP.x0, -3], [TOP.x1, -3], [TOP.x1, TOP.y], [TOP.x0, TOP.y]] },             // THE WALL + top ledge
  // the overhang the ladder hangs from, on a tall post standing on the checkpoint ledge. It stops short of THE WALL,
  // so the twig combo has open sky above it; from the top of the overhang you hop across onto the top ledge.
  { kind: 'beam', pts: [[23.6, 16.3], [25.8, 16.3], [25.8, 16.7], [23.6, 16.7]] },
  { kind: 'beam', pts: [[25.4, LEDGE.y], [25.8, LEDGE.y], [25.8, 16.3], [25.4, 16.3]] },
  { kind: 'rock', pts: [[-4, -3], [-1, -3], [-1, 30], [-4, 30]] },                    // left edge of the world
  { kind: 'rock', pts: [[51, -3], [54, -3], [54, 30], [51, 30]] },                    // right edge
  { kind: 'rock', pts: [[FINISH_DECK.x0, TOP.y], [FINISH_DECK.x1, TOP.y], [FINISH_DECK.x1, FINISH_DECK.y], [FINISH_DECK.x0, FINISH_DECK.y]] }, // the finish deck
];
// little ridges on the pipe floor to stand on (the floor is a slope)
for (let s = 2.2; s < len - 1; s += 1.9) terrain.push({ kind: 'ridge', pts: slab(s, s + 0.35, -0.05, 0.28) });
// the obstacle halfway up the pipe: go over it on the ceiling handles
terrain.push({ kind: 'crate', pts: slab(9.0, 10.3, -0.05, 1.35) });

// grab points. kind decides the look (and the twig's special rule)
const holds = [];
const hold = (x, y, kind, extra) => holds.push({ id: holds.length, x: +x.toFixed(3), y: +y.toFixed(3), kind, ...extra });
// inside the pipe: a few things that got stuck to the ceiling, unevenly spaced and at slightly different
// heights. Far enough apart that swinging between them is a commitment; the floor is always there instead.
// [distance along the pipe, height above its floor, what it is]. The frying pan hangs over the crate.
for (const [s, off, prop] of [[2.4, 2.25, 'mitten'], [5.3, 2.35, 'plunger'], [7.9, 2.2, 'duck'], [9.9, 2.3, 'pan'], [12.9, 2.25, 'fish'], [16.1, 2.35, 'umbrella']]) {
  const [x, y] = at(s, off); hold(x, y, 'handle', { prop, roof: +(PIPE_GAP - off).toFixed(2) }); // roof: how far up the pipe roof is
}
// SHORTCUT: the bare, slippery top of the pipe. Nothing to hold on to up there, on purpose.
// THE WALL: one twig halfway up (it snaps if you hang on it too long). No stones at the top: the combo
// from the twig has to land you on the ledge by itself.
hold(TOP.x0 - 0.2, 11.2, 'twig', { breakMs: 2500, regrowMs: 6000 });
// LADDER: rungs hanging from the overhang, reachable from the checkpoint ledge
for (let y = 11.6; y < 16.2; y += 0.45) hold(24.6, y, 'rung');
// a ski jammed into the end of the overhang: swing out from the top of the ladder, grab its tip,
// then haul yourself up onto the beam
hold(23.1, 16.5, 'handle', { prop: 'ski' });

// moving things. The White Loop (Penn State's free campus bus, somehow up a mountain) drives back and forth
// along the top ledge and knocks climbers over. It's a double-decker, too tall to hop over: grab a rail on its
// roof, ride it to the far end, climb onto the roof and hop off onto the finish deck.
const BUS = { w: 2.6, h: 3.6 }; // taller than any hop, even a lucky one
const objects = [
  { id: 'cart', kind: 'cart', look: 'bus', w: BUS.w, h: BUS.h, x0: 31, x1: +(FINISH_DECK.x0 - 1 - BUS.w / 2).toFixed(2), y: TOP.y + BUS.h / 2 + 0.045, speed: 2.6,
    handles: [[-BUS.w / 2 - 0.05, BUS.h / 2 + 0.15], [BUS.w / 2 + 0.05, BUS.h / 2 + 0.15]] }, // rails at the ends of the roof, reachable from beside the bus
];

// the racing line: progress = how far along this you are (0 at the start, 1 at the flag)
const path = [[1, 1], [5, 1], at(len, 1.2), [LEDGE.x1 - 0.6, LEDGE.y + 1.2], [TOP.x0 + 0.5, TOP.y + 1.2], [FINISH_DECK.x0 - 1.5, TOP.y + 1.2], [FINISH_DECK.x0 - 1.5, FINISH.y + 1.2], [FINISH.x, FINISH.y + 1.2]];

const signs = [
  { x: 3.2, y: 4.6, text: 'SHORTCUT ↗', sub: 'slippery · no ceiling to catch you' },
  { x: 24.8, y: 9.9, text: 'CHECKPOINT', sub: 'fall off the wall, land here' },
  { x: 32.5, y: 11.4, text: 'TEAMWORK', sub: 'hang on the twig · legs HOP + arms LET GO' },
];

module.exports = {
  name: 'The Long Way Up',
  bounds: { x0: -2, x1: 52, y0: -1, y1: 20 },
  spawn: { x0: 0.6, x1: 2.6, y: 0 }, // clear of the pipe mouth so nobody starts under its roof
  finish: { x: FINISH.x, y: FINISH.y, zoneX: FINISH.x - 0.8 },
  pipe: { f0: F0, f1: F1, gap: PIPE_GAP, slab: SLAB, dir: D, normal: N, length: +len.toFixed(3) },
  terrain, holds, objects, path, signs,
};
