// Tiny synth sound effects (no audio files needed). Sfx.unlock() must run inside a tap on iOS.
(function () {
  let ctx = null;
  const Sfx = {
    unlock() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    },
    play(name) { if (ctx && S[name]) S[name](); },
  };

  function tone(freq, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  }
  function noise(dur, vol = 0.3, freq = 1200) {
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(ctx.destination); src.start(t);
  }

  const S = {
    grab: () => { noise(0.06, 0.25, 2500); tone(180, 0.05, 'triangle', 0.1); },
    flick: () => tone(220, 0.18, 'sine', 0.12, 660),
    boost: () => tone(160, 0.35, 'square', 0.1, 900),
    fall: () => tone(700, 0.9, 'sawtooth', 0.08, 90),
    cut: () => { noise(0.12, 0.6, 3500); tone(1200, 0.08, 'square', 0.08, 300); },
    yank: () => { tone(90, 0.25, 'square', 0.2, 50); noise(0.1, 0.3, 400); },
    save: () => { tone(660, 0.12, 'triangle', 0.12); tone(990, 0.2, 'triangle', 0.12, null, 0.1); },
    warn: () => { tone(880, 0.08, 'square', 0.1); tone(880, 0.08, 'square', 0.1, null, 0.14); },
    tie: () => { tone(520, 0.1, 'triangle', 0.12); tone(780, 0.14, 'triangle', 0.12, null, 0.08); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.1, null, i * 0.12)),
  };

  window.Sfx = Sfx;
})();
