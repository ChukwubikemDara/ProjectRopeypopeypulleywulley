// Phone page: join flow, lobby, HUD, sending inputs.
(function () {
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  const socket = Net.socket;
  let joined = false, wakeLock = null;

  try { $('name').value = localStorage.getItem('tethered-name') || ''; } catch (e) {}
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone) $('joinNote').textContent = '';

  // ---------- join (this tap unlocks motion, audio and wake lock on iOS)
  $('joinBtn').addEventListener('click', async () => {
    Sfx.unlock();
    const name = $('name').value.trim() || 'Climber';
    try { localStorage.setItem('tethered-name', name); } catch (e) {}
    const hasMotion = 'DeviceMotionEvent' in window && ('ontouchstart' in window);
    // no motion? still let them in: the hand pads work, they just can't tilt or jerk
    const motionOk = !hasMotion || await Motion.enable();
    keepAwake();
    setTimeout(() => Motion.center(), 400); // however you're holding it now = neutral reach
    socket.emit('join', { name });
    joined = true;
    show('join', false); show('lobby', true);
    if (!motionOk) $('waitNote').textContent = location.protocol === 'https:'
      ? 'Motion was blocked. Close this tab, reopen it and tap Allow.'
      : 'Motion needs https:// (use the ngrok link). Hands still work.';
  });

  async function keepAwake() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (joined && document.visibilityState === 'visible') keepAwake(); });

  // ---------- lobby
  $('startBtn').addEventListener('click', () => socket.emit('start'));
  $('againBtn').addEventListener('click', () => socket.emit('start'));
  $('botBtn').addEventListener('click', () => socket.emit('addBot'));
  $('flipAim').addEventListener('click', () => { Motion.flipAim = !Motion.flipAim; });
  $('centerAim').addEventListener('click', () => Motion.center());
  $('swapRole').addEventListener('click', () => socket.emit('swapRole'));
  $('switchTeam').addEventListener('click', () => socket.emit('newTeam'));
  $('players').addEventListener('click', (e) => { const b = e.target.closest('[data-join]'); if (b) socket.emit('joinTeam', b.dataset.join); });

  const ROLES = {
    arms: { title: 'You are the ARMS 💪', how: 'You can only <b>hold on</b>. <b>Tilt</b> moves your hands (top away = reach up) and steers you left/right in the air. <b>Hold the thumb pads</b> to grab, let go to drop. Only your legs can jump.',
      hint: '<b>tilt</b> = hands + steer in the air · <b>hold a pad</b> = grab<br>let go right as your legs <b>HOP</b> = jump<br>hanging with no footing? hop + let go together = <b>COMBO</b>' },
    legs: { title: 'You are the LEGS 🦵', how: 'You are the <b>only one who can jump</b>, but your feet can\'t hold on. <b>Hop / stand up fast</b> = PUSH. <b>Lean</b> swings your feet. <b>Squat</b> = tuck knees. <b>Shove the phone forward</b> = KICK.',
      hint: 'watch the big screen!<br><b>HOP</b> = jump (only you can) · <b>lean</b> = swing feet<br><b>squat</b> = tuck · <b>shove forward</b> = kick' },
    both: { title: 'You are ARMS + LEGS', how: 'Solo climber: thumbs grab, tilt points your hands, hop to jump. Get a friend to join your team and split the body.',
      hint: '<b>tilt</b> = hands + steer · <b>hold a pad</b> = grab<br><b>hop</b> = jump (let go first!) · <b>shove forward</b> = kick' },
  };
  function applyRole() {
    const R = ROLES[Net.role] || ROLES.both;
    $('roleTitle').textContent = R.title;
    $('roleHow').innerHTML = R.how;
    $('hint').innerHTML = R.hint;
    const legs = Net.role === 'legs';
    show('armsHud', !legs); show('legsHud', legs);
    const team = Net.roster.find(c => c.id === Net.me);
    $('teamPill').textContent = team ? (team.members.length > 1 ? 'TEAM OF 2' : 'SOLO') : '';
    $('teamPill').style.background = team ? team.color : '';
    $('swapRole').disabled = !team || team.members.length < 2;
    $('switchTeam').disabled = !team || team.members.length < 2;
  }
  Net.on('you', applyRole);
  Net.on('roster', (r) => {
    $('players').innerHTML = r.map(c => {
      const who = c.bot ? '<span class="fine">bot</span>' : c.members.map(m => `<span class="member${m.id === Net.player ? ' me' : ''}">${esc(m.name)} <em>${m.role === 'both' ? 'arms+legs' : m.role}</em></span>`).join('');
      const canJoin = !c.bot && c.id !== Net.me && c.members.length < 2;
      return `<li class="team-row${c.id === Net.me ? ' mine' : ''}"><i style="background:${c.color}"></i><div>${who}</div>${canJoin ? `<button class="join" data-join="${c.id}">Join</button>` : ''}</li>`;
    }).join('');
    const humansN = r.reduce((n, c) => n + c.members.length, 0);
    $('count').textContent = `${r.length} climber${r.length === 1 ? '' : 's'} · ${humansN} phone${humansN === 1 ? '' : 's'}`;
    applyRole();
  });

  // ---------- phases
  function inRound() {
    const st = Net.sample();
    return st && st.phase === 'playing' && st.climbers.some(c => c.id === Net.me);
  }
  Net.on('phase', enterPhase);
  // a restart mid-round keeps phase 'playing', so 'phase' never fires; the start event does
  Net.on('event', (ev) => { if (ev.type === 'start') enterPhase('playing'); });
  function enterPhase(p) {
    if (!joined) return;
    show('results', false);
    if (p === 'lobby') { show('hud', false); show('lobby', true); $('waitNote').textContent = ''; return; }
    if (p === 'playing') setTimeout(() => {
      const playing = inRound();
      show('lobby', !playing); show('hud', playing);
      $('waitNote').textContent = playing ? '' : 'Round in progress — you\'re in the next one.';
      if (playing) { $('hint').classList.remove('gone'); setTimeout(() => $('hint').classList.add('gone'), 6000); }
    }, 250);
  }
  Net.on('results', (awards) => {
    if (!joined) return;
    show('hud', false); show('lobby', false); show('results', true);
    const win = awards.find(a => a.val === 'summit');
    $('winnerName').innerHTML = win ? `<i style="background:${Net.colorOf(win.id)}"></i>${esc(Net.nameOf(win.id))} reached the summit` : '';
    $('awards').innerHTML = awards.filter(a => a.val !== 'summit')
      .map(a => `<li><b>${esc(a.title)}</b><span><i style="background:${Net.colorOf(a.id)}"></i>${esc(Net.nameOf(a.id))} · ${a.val}</span></li>`).join('') || '<li class="fine">No betrayals. Suspicious.</li>';
    Sfx.play('win');
  });

  // ---------- inputs
  Motion.onGesture = (g, power) => {
    if (Net.role === 'arms') return; // the arms only tilt and grip
    flashGesture(g);
    socket.emit('gesture', g, power);
  };
  // hands: hold a pad (or Q / E on a laptop) to close that hand. Each pad tracks its own
  // touches so both thumbs work at once.
  const pads = { l: false, r: false };
  const handsNow = () => ({ l: pads.l || !!Motion._keys.q, r: pads.r || !!Motion._keys.e });
  let sentHands = { l: false, r: false };
  function sendInput(force) {
    if (!joined) return;
    const h = handsNow();
    // send right away when the hands or the tilt change (tilt is what steers you mid-jump)
    const aim = +Motion.aim.toFixed(2), ay = +Motion.ay.toFixed(2);
    const tiltMoved = Math.abs(aim - (sentHands.aim ?? 9)) > 0.03 || Math.abs(ay - (sentHands.ay ?? 9)) > 0.03;
    if (!force && h.l === sentHands.l && h.r === sentHands.r && !tiltMoved) return;
    sentHands = { ...h, aim, ay };
    socket.emit('input', { aim: +Motion.aim.toFixed(2), ay: +Motion.ay.toFixed(2), brace: Motion.brace, l: h.l, r: h.r });
  }
  for (const [id, side] of [['padL', 'l'], ['padR', 'r']]) {
    const el = $(id);
    const set = (on) => (e) => { e.preventDefault(); pads[side] = on; sendInput(); };
    el.addEventListener('touchstart', set(true), { passive: false });
    el.addEventListener('mousedown', set(true));
    ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(ev => el.addEventListener(ev, set(false), { passive: false }));
  }
  addEventListener('keydown', () => sendInput());
  addEventListener('keyup', () => sendInput());
  setInterval(() => sendInput(true), 100);          // heartbeat (brace, etc.)
  (function tiltLoop() { requestAnimationFrame(tiltLoop); sendInput(); })(); // tilt changes go out each frame

  // ---------- HUD + motion check, every frame
  let lastGesture = 0;
  function flashGesture(g) {
    lastGesture = performance.now();
    const legs = Net.role === 'legs';
    $('gestureTest').textContent = { flick: '⬆ HOP!', yank: '⬇ tuck!', kick: '👟 KICK!' }[g] || g;
    if (legs && g === 'flick') { $('pushText').textContent = 'PUSH!'; $('pushBox').classList.add('fire'); setTimeout(() => { $('pushText').textContent = 'HOP TO JUMP'; $('pushBox').classList.remove('fire'); }, 350); }
  }
  function frame() {
    requestAnimationFrame(frame);
    // lobby pointer check: arms see the 2D hand target, legs see left/right lean
    $('aimDot').style.left = (50 + Motion.aim * 45) + '%';
    $('aimDot').style.top = (Net.role === 'legs' ? 50 : 50 - Motion.ay * 42) + '%';
    $('aimText').textContent = Net.role === 'legs' ? 'lean' : (Motion.ay < -0.2 ? 'hands ↓' : Motion.ay > 0.8 ? 'reach ↑' : 'hands');
    for (const id of ['steady', 'hudSteady']) {
      $(id).textContent = Motion.brace ? 'STEADY' : 'SHAKY';
      $(id).classList.toggle('bad', !Motion.brace);
    }
    if (performance.now() - lastGesture > 900) $('gestureTest').textContent = Net.role === 'arms' ? 'tilt to move the dot' : 'hop · squat · shove';

    const st = Net.sample();
    const me = st && st.climbers.find(c => c.id === Net.me);
    if (me && Net.level) {
      $('height').textContent = Math.max(0, Math.round(me.y));
      $('stamina').style.width = me.stamina + '%';
      $('stamina').classList.toggle('low', me.stamina < 30);
    }
    const h = handsNow();
    ['padL', 'padR'].forEach((id, i) => {
      const hand = me && me.hands[i];
      $(id).classList.toggle('closed', i ? h.r : h.l);
      $(id).classList.toggle('grip', !!(hand && hand.grip && !hand.onClimber));
      $(id).classList.toggle('friend', !!(hand && hand.onClimber));
    });
    ['footL', 'footR'].forEach((id, i) => $(id).classList.toggle('planted', !!(me && me.legs && me.legs[i].planted)));
    if (!$('debug').classList.contains('hidden')) {
      $('readout').textContent = `vertical ${Motion.vertical.toFixed(1)} · energy ${Motion.energy.toFixed(2)} · aim ${Motion.aim.toFixed(2)},${Motion.ay.toFixed(2)} · ${Net.role} · motion ${Motion.enabled ? 'on' : 'keyboard'}`;
    }
  }
  frame();

  // ---------- sounds + danger warning
  function danger(text) {
    $('danger').firstChild.textContent = text;
    $('danger').classList.remove('show'); void $('danger').offsetWidth; $('danger').classList.add('show');
    Sfx.play('warn');
  }
  Net.on('event', (ev) => {
    const me = Net.me;
    // someone just grabbed onto you: they're hanging off you now
    if ((ev.type === 'grabbed' || ev.type === 'handhold') && ev.target === me) return danger(`${Net.nameOf(ev.id)} IS ON YOU · HOLD STILL`);
    const mine = ev.id === me || ev.victim === me || ev.target === me || ev.by === me;
    if (!mine) return;
    if (ev.type === 'combo' && ev.id === me) { $('comboFlash').classList.remove('show'); void $('comboFlash').offsetWidth; $('comboFlash').classList.add('show'); }
    const map = { grab: 'grab', handhold: 'tie', grabbed: 'tie', flick: 'flick', pull: 'flick', push: 'flick', combo: 'boost', kick: 'yank', boost: 'boost', throw: 'boost', fall: 'fall',
      drop: 'cut', shake: 'yank', yank: 'yank', save: 'save', slip: 'fall' };
    if (map[ev.type]) Sfx.play(map[ev.type]);
    if ((ev.type === 'yank' && ev.target === me) || (ev.type === 'drop' && ev.victim === me)) { if (navigator.vibrate) navigator.vibrate(120); }
  });

  // ---------- debug panel
  $('gear').addEventListener('click', () => show('debug', $('debug').classList.contains('hidden')));
  $('closeDebug').addEventListener('click', () => show('debug', false));
  bindSlider('tFlick', 'FLICK'); bindSlider('tStill', 'STILL'); bindSlider('tKick', 'KICK');
  function bindSlider(id, key) {
    const el = $(id), out = el.nextElementSibling;
    el.value = Motion[key]; out.textContent = Motion[key];
    el.addEventListener('input', () => { Motion[key] = +el.value; out.textContent = el.value; });
  }

  Net.on('disconnect', () => { $('waitNote').textContent = 'Lost connection… reconnecting'; });
  Net.on('connect', () => { if (joined) { socket.emit('join', { name: $('name').value.trim() || 'Climber' }); $('waitNote').textContent = ''; } });

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();
