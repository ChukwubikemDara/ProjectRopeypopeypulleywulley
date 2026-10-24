// Shared networking + snapshot interpolation. Used by both the phone and spectator pages.
(function () {
  const listeners = {};
  const Net = {
    socket: io({ transports: ['websocket', 'polling'] }),
    me: null,              // the climber you control (shared with a teammate in 2v2)
    player: null, role: null, // your socket id, and 'arms' | 'legs' | 'both'
    level: null, config: null, tunable: null,
    roster: [], results: null, phase: 'lobby',
    buffer: [],            // [{at, snap}] for interpolation
    delay: 50,             // ms we render behind the server (smooths jitter; ~2 snapshots at 45/s)
    clockOffset: null,     // server clock - our clock (set by the phone's ping), to measure snapshot age
    snapAge: 0,            // how old snapshots are when they arrive (ms): grows if the network queues them
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    fire(type, data) { (listeners[type] || []).forEach(fn => fn(data)); },
    nameOf(id) { const p = Net.roster.find(r => r.id === id); return p ? p.name : '?'; },
    colorOf(id) { const p = Net.roster.find(r => r.id === id); return p ? p.color : '#fff'; },

    // positions of every climber at (now - delay), linearly interpolated between snapshots
    sample() {
      const b = Net.buffer;
      if (!b.length) return null;
      const t = performance.now() - Net.delay;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].at > t) i--;
      const B = b[i], A = b[i - 1] || B;
      const span = B.at - A.at || 1;
      const k = Math.max(0, Math.min(1, (t - A.at) / span));
      const prev = new Map(A.snap.c.map(c => [c[0], c]));
      const climbers = B.snap.c.map(c => {
        const p = prev.get(c[0]) || c;
        const L = (i) => p[i] + (c[i] - p[i]) * k;
        // c = [id, x, y, braced, stamina, aim, air, L: hx, hy, ex, ey, flags, R: hx, hy, ex, ey, flags]
        const hand = (o) => ({ x: L(o), y: L(o + 1), ex: L(o + 2), ey: L(o + 3), closed: !!(c[o + 4] & 1), grip: !!(c[o + 4] & 2), onClimber: !!(c[o + 4] & 4) });
        const hands = [hand(7), hand(12)];
        // legs: kx, ky, fx, fy, planted
        const leg = (o) => ({ kx: L(o), ky: L(o + 1), fx: L(o + 2), fy: L(o + 3), planted: !!c[o + 4] });
        const legs = c.length > 17 ? [leg(17), leg(22)] : null;
        return {
          id: c[0], x: L(1), y: L(2), braced: !!c[3], stamina: c[4], aim: c[5], air: !!c[6],
          hands, legs, gripping: hands.some(h => h.grip),
        };
      });
      return { climbers, phase: B.snap.phase, winner: B.snap.winner, elapsed: B.snap.elapsed };
    },
  };

  const s = Net.socket;
  s.on('you', id => { Net.player = id; });
  s.on('level', l => { Net.level = l; Net.fire('level', l); });
  s.on('config', ({ CONFIG, TUNABLE }) => { Net.config = CONFIG; Net.tunable = TUNABLE; Net.fire('config', CONFIG); });
  s.on('roster', r => {
    Net.roster = r;
    // find your climber + job from the team list
    const mine = r.find(c => (c.members || []).some(m => m.id === Net.player));
    const role = mine ? mine.members.find(m => m.id === Net.player).role : null;
    const changed = (mine ? mine.id : null) !== Net.me || role !== Net.role;
    Net.me = mine ? mine.id : null; Net.role = role;
    Net.fire('roster', r);
    if (changed) Net.fire('you', { climber: Net.me, role });
  });
  s.on('results', r => { Net.results = r; Net.fire('results', r); });
  s.on('connect', () => Net.fire('connect'));
  s.on('disconnect', () => Net.fire('disconnect'));
  s.on('s', snap => {
    if (Net.clockOffset !== null) Net.snapAge += ((Date.now() + Net.clockOffset - snap.t) - Net.snapAge) * 0.1;
    Net.buffer.push({ at: performance.now(), snap });
    if (Net.buffer.length > 30) Net.buffer.shift();
    if (snap.phase !== Net.phase) { Net.phase = snap.phase; Net.fire('phase', snap.phase); }
    for (const ev of snap.ev) Net.fire('event', ev);
  });

  window.Net = Net;
})();
