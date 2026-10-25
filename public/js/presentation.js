// Read-only view of existing snapshots. Input and networking remain in phone.js/net.js.
(() => {
  const screen = document.body.classList.contains('screen');
  const $ = id => document.getElementById(id);
  const rail = $('raceRail'), standings = $('raceStandings');
  const markers = new Map(), cards = new Map();
  let last = 0;
  const fraction = y => Math.max(0, Math.min(1, y / (Net.level?.top || 60)));
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - last < 100) return;
    last = now;
    const state = Net.sample();
    if (!state) return;
    const seen = new Set();
    for (const c of state.climbers) {
      seen.add(c.id);
      const name = Net.nameOf(c.id), color = Net.colorOf(c.id);
      if (rail) {
        let dot = markers.get(c.id);
        if (!dot) { dot = document.createElement('span'); rail.append(dot); markers.set(c.id, dot); }
        dot.className = 'race-dot' + (c.id === Net.me ? ' mine' : '');
        dot.style.setProperty('--team', color); dot.style.bottom = `${fraction(c.y) * 100}%`;
        dot.title = `${name}: ${Math.max(0, Math.round(c.y))}m`;
      }
      if (standings) {
        let card = cards.get(c.id);
        if (!card) {
          card = document.createElement('div'); card.className = 'standing';
          card.append(document.createElement('b'), document.createElement('strong'), document.createElement('small'));
          standings.append(card); cards.set(c.id, card);
        }
        card.style.setProperty('--team', color);
        card.children[0].textContent = name;
        card.children[1].textContent = `${Math.max(0, Math.round(c.y))}m`;
        card.children[2].textContent = `${Math.round(fraction(c.y) * 100)}% TO THE SUMMIT`;
      }
      if (c.id === Net.me && $('hudName')) {
        $('hudName').textContent = name;
        $('hudRole').textContent = Net.role === 'both' ? 'ARMS + LEGS' : (Net.role || 'climber').toUpperCase();
        const bar = document.querySelector('.stamina');
        bar?.setAttribute('aria-valuenow', Math.round(c.stamina));
      }
    }
    for (const map of [markers, cards]) for (const [id, el] of map) if (!seen.has(id)) { el.remove(); map.delete(id); }
    if (screen && $('raceClock')) {
      const secs = Math.max(0, Math.floor(state.elapsed || 0));
      $('raceClock').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }
  }
  requestAnimationFrame(tick);
})();
