// Phone motion -> game inputs. The same sensors mean different things for each job:
//   ARMS: tilt left/right + tilt top away/toward you -> a 2D pointer where your hands go
//         (gripping? pointing down pulls your body up). Jerk UP = pull-up, jerk DOWN = yank.
//   LEGS: lean left/right swings the feet. Hop / stand up fast = PUSH off (strength counts),
//         squat / jerk DOWN = tuck the knees, shove the phone forward = KICK.
//   Holding still -> brace (arms: carry people; legs: feet stay planted).
// Tilt comes from deviceorientation (gyro-fused: smooth, no drift, not thrown off by jerks).
// Jerks come from devicemotion along real-world vertical, so phone angle and OS sign quirks don't matter.
// Laptop testing: arrows = pointer / lean, W = up gesture, S = down gesture, K = kick,
// hold Q / E = close left / right hand, hold Shift = fidget.
(function () {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const Motion = {
    // tuning (change live from the phone's debug panel)
    FLICK: 13,        // m/s^2 vertical jerk to count as an up / down gesture
    KICK: 16,         // m/s^2 along the screen axis (shove away from your chest) to count as a kick
    LOCKOUT: 450,     // ms after a gesture where we ignore the bounce-back
    STILL: 1.6,       // movement energy below this = braced
    TILT_X: 30,       // degrees of left/right tilt for full aim
    TILT_Y: 25,       // degrees of forward/back tilt for full reach
    flipAim: false,   // the lobby's "feels backwards" button

    enabled: false, aim: 0, ay: 0.6, brace: true, energy: 0, vertical: 0,
    neutralBeta: null, // forward/back angle you hold the phone at = "neutral reach"
    onGesture: null,
    _g: { x: 0, y: -9.8, z: 0 }, _lock: 0, _keys: {},

    // MUST be called from a tap (iOS rule)
    async enable() {
      try {
        const reqs = [];
        if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) reqs.push(DeviceOrientationEvent.requestPermission());
        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) reqs.push(DeviceMotionEvent.requestPermission());
        const res = await Promise.all(reqs);
        if (res.some(r => r !== 'granted')) return false;
      } catch (e) { console.warn('motion permission', e); return false; }
      addEventListener('devicemotion', onMotion);
      addEventListener('deviceorientation', onOrientation);
      Motion.enabled = true;
      return true;
    },
    // "this is how I hold it": current forward/back tilt becomes neutral reach
    center() { Motion.neutralBeta = Motion._beta ?? Motion.neutralBeta; },
  };

  // tilt -> pointer. gamma = left/right (-90..90), beta = front/back (90 = upright, 0 = flat)
  function onOrientation(e) {
    if (e.beta === null || e.gamma === null) return;
    Motion._beta = e.beta;
    if (Motion.neutralBeta === null) Motion.neutralBeta = e.beta;
    let aim = e.gamma / Motion.TILT_X;
    if (Motion.flipAim) aim = -aim;
    Motion.aim = Math.max(-1, Math.min(1, aim));
    // tilt the top away from you (beta drops) = reach up; toward you = pull down. Neutral reaches up a bit.
    Motion.ay = Math.max(-1, Math.min(1, 0.6 + (Motion.neutralBeta - e.beta) / Motion.TILT_Y));
  }

  function onMotion(e) {
    const ag = e.accelerationIncludingGravity, a = e.acceleration;
    if (!ag || ag.x === null) return;
    // low-pass the gravity direction
    const g = Motion._g, k = 0.12;
    g.x += (ag.x - g.x) * k; g.y += (ag.y - g.y) * k; g.z += (ag.z - g.z) * k;
    const gl = Math.hypot(g.x, g.y, g.z) || 1;
    // no orientation events (some Android browsers)? fall back to gravity for left/right aim
    if (Motion._beta === undefined) {
      let aim = (g.x / gl) / 0.55;
      if (!isIOS) aim = -aim;
      if (Motion.flipAim) aim = -aim;
      Motion.aim = Math.max(-1, Math.min(1, aim));
    }

    if (!a || a.x === null) return;
    // vertical (world up/down) component of user acceleration
    const v = (a.x * g.x + a.y * g.y + a.z * g.z) / gl;
    Motion.vertical = v;
    const mag = Math.hypot(a.x, a.y, a.z);
    Motion.energy += (mag - Motion.energy) * 0.15;
    Motion.brace = Motion.energy < Motion.STILL;

    const t = performance.now();
    if (t < Motion._lock) return;
    // shove along the screen's axis (away from your chest) that isn't mostly vertical = kick
    if (Math.abs(a.z) > Motion.KICK && Math.abs(a.z) > Math.abs(v) * 1.5) return fire('kick', t, Math.abs(a.z) / Motion.KICK);
    if (v > Motion.FLICK) fire('flick', t, v / Motion.FLICK);
    else if (v < -Motion.FLICK) fire('yank', t, -v / Motion.FLICK);
  }

  function fire(g, t, power = 1) {
    Motion._lock = t + Motion.LOCKOUT;
    if (Motion.onGesture) Motion.onGesture(g, Math.round(power * 100) / 100);
  }

  // ---- keyboard fallback for laptop testing
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    Motion._keys[e.key] = Motion._keys[k] = true;
    if (e.repeat) return;
    if (k === 'w') fire('flick', 0);
    if (k === 's') fire('yank', 0);
    if (k === 'k') fire('kick', 0);
  });
  addEventListener('keyup', (e) => { Motion._keys[e.key] = Motion._keys[e.key.toLowerCase()] = false; });
  setInterval(() => {
    if (Motion.enabled) return;
    const K = Motion._keys;
    Motion.aim = (K.ArrowRight || K.d ? 1 : 0) - (K.ArrowLeft || K.a ? 1 : 0);
    Motion.ay = K.ArrowUp ? 1 : K.ArrowDown ? -1 : 0.6;
    Motion.brace = !K.Shift;
  }, 30);

  window.Motion = Motion;
})();
