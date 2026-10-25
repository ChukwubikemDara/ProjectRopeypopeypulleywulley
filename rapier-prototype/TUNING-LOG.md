# Tuning log

One entry per physics/control change: what changed, why, what was tested, and playtest feedback.

## 2026-10-24 · Kick reach

- **Changed:** the kick now measures from the kicker's feet to the rival's torso **or feet**, using the new `kickRange: 1` setting. It used to measure to the torso only. Kick impulse (4) and cooldown (1.5 s) are unchanged.
- **Why:** feet sit about 1 m below the torso, so kicks only landed when the two torsos were within about 0.66 m. Climbers physically collide at about 0.6 m, so in practice a kick almost never hit a rival standing beside you. The new reach hits up to about 1.3 m between torsos.
- **Feedback:** after a kick, the button now flashes the server's result for 0.9 s: Hit! / Too far / Recharging / No signal. Before, the result only appeared in the diagnostics in settings. A tap from an ARMS player is now answered "arms cannot use leg actions" instead of "arms cannot jump".
- **Automated:** the new `kick-check.cjs` sends kicks through the real socket path: ARMS is blocked, LEGS hits a rival 1.1 m away, a second kick right after is blocked by the cooldown, and a rival 2.5 m away is out of range. The full `npm run test:3d` passes.
- **Real phones:** not tested yet.
- **Open question:** a missed kick still uses up the full 1.5 s cooldown.

## 2026-10-25 · Kick detection and visible kick

- **Reported:** on real phones, "the kick isn't working at all".
- **Cause 1, detection:** `motion.js` only measured a shove along the axis straight out of the screen, with a 16 m/s² threshold. With the phone tilted back 30° or more, as people normally hold it, a hard shove fired nothing at all (no kick, no hop). I reproduced this with simulated sensor readings.
- **Fix 1:** measure the shove along the ground, in the direction away from the player, however the phone is tilted. The threshold is now 13 m/s², the same as a hop. Sideways jolts still don't count, and a hop that drifts forward is still a hop.
- **Cause 2, feedback:** a kick only pushed the rival. With nobody in reach, nothing moved, so it looked broken.
- **Fix 2:** every kick swings the real foot about 0.65 m forward for 0.25 s, toward the nearest rival, otherwise the way you're leaning or heading.
- **Automated:** `sensor-check.cjs` shoves at 0, 30, 45, 60 and 80 degrees and adds sideways and drifting-hop cases. `kick-check.cjs` checks the leg swing on a miss.
- **Real phones:** not retested yet.

## 2026-10-25 · Kick button alongside motion

- **Changed:** restored the Kick button for calibrated LEGS/solo players during motion play. Shove gesture remains enabled. Jump/Tuck remain touch-mode buttons; ARMS cannot kick.
- **Why:** user explicitly requested both a discoverable button and the existing gesture. No physics tuning or prologue edits.
- **Automated:** visibility across roles/calibration/phases/touch mode, cooldown, shared gesture lockout and socket kick physics pass.
- **Browser:** verified motion-mode solo Kick remains visible and reports a real out-of-range result. Physical phone retesting remains pending.
