# Tuning log

One entry per physics/control change: what changed, why, what was tested, and playtest feedback.

## 2026-10-24 · Kick reach

- **Changed:** the kick now measures from the kicker's feet to the rival's torso **or feet**, using the new `kickRange: 1` setting. It used to measure to the torso only. Kick impulse (4) and cooldown (1.5 s) are unchanged.
- **Why:** feet sit about 1 m below the torso, so kicks only landed when the two torsos were within about 0.66 m. Climbers physically collide at about 0.6 m, so in practice a kick almost never hit a rival standing beside you. The new reach hits up to about 1.3 m between torsos.
- **Feedback:** after a kick, the button now flashes the server's result for 0.9 s: Hit! / Too far / Recharging / No signal. Before, the result only appeared in the diagnostics in settings. A tap from an ARMS player is now answered "arms cannot use leg actions" instead of "arms cannot jump".
- **Automated:** the new `kick-check.cjs` sends kicks through the real socket path: ARMS is blocked, LEGS hits a rival 1.1 m away, a second kick right after is blocked by the cooldown, and a rival 2.5 m away is out of range. The full `npm run test:3d` passes.
- **Real phones:** not tested yet.
- **Open question:** a missed kick still uses up the full 1.5 s cooldown.
