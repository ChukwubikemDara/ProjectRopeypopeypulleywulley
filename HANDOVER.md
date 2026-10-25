# Handover: Two Left Legs (prompt for the next agent)

Paste this whole file to the next agent as its first message.

---

You're picking up **Two Left Legs** (formerly Tethered). It's a 2v2 Foddian climbing race played on phones. Each team has two phones:

- **ARMS**: tilt to aim the hands, hold the two pads to grip.
- **LEGS**: flick the phone up to hop, lean to swing the feet, and press the Kick button to shove a rival.

The big screen (the spectator page) shows the game. **Rivalry between the two teams is a required part of the hackathon brief**, so race and rivalry features must keep working.

## Ground rules from the user

- Make small, incremental commits. **Don't add a Co-Authored-By / Claude trailer to commits.**
- Ask before committing or pushing unless the user says to push.
- Don't break the game before the hackathon. Run the suite before every commit.
- Remote mode (phones show no 3D view by default) lives on its own revertible branch, `remote-mode`. Non-remote work goes on `prologue-voice` and is merged into `remote-mode`.
- Keep the ngrok tunnel running, and don't write tunnel auto-detect code (the user declined it).

## Repo and branches

The repo root is `/Users/lukky/ProjectRopeypopeypulleywulley`, and the game lives in `rapier-prototype/`.

| branch | what it is |
|---|---|
| `remote-mode` | **current / most complete**. It is `prologue-voice` plus remote mode and the latest map, rivalry and playtest work |
| `prologue-voice` | the non-remote line (prologue, narrator voice, combo card) |
| `narration-polish`, `dev-david`, `main` | older lines; `main` is well behind |
| `backup-before-rewrite` | an old safety backup, don't build on it |

## Running it

```bash
npm install                       # repo root
npm run start:3d                  # game server on :3010 (the host page is /, phones join via the QR/link)
PUBLIC_URL=https://<ngrok-host> npm run start:3d   # so the QR code points phones at the tunnel
ngrok http 3010                   # the tunnel; its web API is on :4041 (an old tunnel on :4040 → :3000 returns 502, ignore it)
npm run test:3d                   # FULL SUITE. Run it from the REPO ROOT, not rapier-prototype/ (138 PASS lines, ends "ALL RAPIER LAB CHECKS PASSED")
node rapier-prototype/tools/playtest.cjs [map] [seconds]  # 4-bot real-time playtest, one JSON report per map
```

The launch config `.claude/launch.json` has a "rapier-tunnel" entry that runs the server with `PUBLIC_URL` set to the current ngrok URL. Update the URL there if ngrok restarts.

## Architecture (rapier-prototype/)

- `server.cjs`: Socket.IO server. It handles the lobby, teams and roles (the first phone on a team is ARMS, the second is LEGS, and a phone alone plays `both`), the phases (lobby → playing → results), map selection and rotation, and the prologue (`practice`).
- `physics.cjs`: Rapier 3D simulation, stepped at 1/90 s, with snapshots sent at 45/s. It handles:
  - grips as spherical joints;
  - hops, the combo (hop plus let go), kicks with a cooldown and moving objects that bonk you;
  - rival grabbing: a closed hand with no hold in reach grabs a touching climber (around `physics.cjs:245`);
  - the events `kick`, `handhold`, `grabbed`, `drop` (betrayal), `fall`, `combo`, `boost`, `bonk`, `snap` and `win`;
  - the stats that feed the awards.
- Courses:
  - `course-source.cjs` holds Snowbound (`mountain`): the pipe props, overhang, checkpoint sign, twig wall and bus finish.
  - `race-courses.cjs` holds Forest and Campus (Campus has the scooter ambush).
  - `courses.cjs` holds `prepareCourse`, `validateCourse`, the rotation (`nextRace`) and the mirrored two-lane prologue `practice`. Its exports are named courses (`mountain`, `forest`, `campus`, `practice`, `all`, `catalog`), not an array.
- `narration.cjs` holds the Narrator (line queue, spacing, fall reactions). `prologue.cjs` holds the Prologue director and RaceVoice. **RaceVoice only reacts to falls during races.**
- `client/`:
  - `render.js` is the Three.js scene (terrain, props, arrows, icicles).
  - The phone controller is made of the controls guide, the combo card (`controls-preview.css`) and the Kick button.
  - The host/big-screen UI includes subtitles and standings.
- Tests: `smoke.cjs` runs every `*-check.cjs`. The new one is `rivalry-check.cjs` (see below).

## State at handover

All the work is committed and pushed on `remote-mode`. The latest commits:

1. Snowbound audit fixes:
   - a hanging post with icicles inside the pipe, so it no longer looks unfinished;
   - the fish prop moved to s 13.5 so it doesn't clash with other holds;
   - the CHECKPOINT sign moved to (23.4, 9.55);
   - floor arrows no longer drawn on top of holds;
   - a walk-under-the-overhang test.
2. The Campus scooter start moved to x0 37.1.
3. The prologue trust zone (`still`) widened to x −36..−4, y −1..9.
4. `roof-surface-check.cjs` got a `mat` stub, because the icicle block in `render.js` uses `mat()`.
5. A new `rivalry-check.cjs` (in the suite) and `tools/playtest.cjs`.

## Rivalry coverage (what's proven by tests)

`rivalry-check.cjs` uses 4 real sockets (2 teams × ARMS/LEGS) plus a spectator. It checks:

- the teams form correctly;
- LEGS can kick the rival in both directions, ARMS can't kick, and kicks have a cooldown;
- both kicks are announced to the big screen;
- grabbing a rival's hand mid-air holds them (a `handhold` event), and letting go counts as a betrayal (a `drop` event, `stats.drops`);
- standings rank teams by progress;
- the first team to the flag wins, all 4 phones get the results, and the Kickboxer award reaches them;
- when a rival disconnects mid-race the race continues and their partner switches to `both`.

Other checks also cover carrying drain, the team boost, shaky-carry grip rips, a moving cart bonking a rival and the scooter ambush.

## 4-bot playtest results (120 s per map, real-time, `tools/playtest.cjs`)

| map | result | rivalry activity | where bots got stuck |
|---|---|---|---|
| Prologue | no finish (expected for bots) | none (separate lanes) | both teams on the return ramp under `gap-bar` (x ≈ ±13.3, y 2.5–4.3). Bots never go backwards. A one-hop escape from the ledge exists and is tested (`prologue-check.cjs:52-54`) |
| Snowbound | no finish; A reached 0.56, B 0.22 | kicks 8/9 and 9/9 landed; 15 and 13 handholds; 9 drops each | A at the ladder base (24.6, 8.9–10.7): the first rung (y 11.6) is 2.7 m above the ledge, slow but passable. B was tangled at spawn (x 6.6–8.5) while being kicked |
| Forest | **A won at 58 s**; B reached 0.89 | kicks 14/18 and 11/15; boost 1 | A sat at the flag (35.3, 15.1) once finished. B was stuck at (32, 17.8, progress 0.82) |
| Campus | **A won at 83 s**; B reached 0.95 | kicks 33/38 and 33/39; 74 handholds each; drops 49 and 36; scooter launched twice and bonked B once | B at (44.5, 18.3), 0.96, near the finish. Both teams were slow around (25–26, 6.8) |

Narration: the prologue played only wake, roles and gap (the bots never reach the later zones). The races played no lines because no fall happened (falls are net height lost).

## What's left / suggested next steps (priority order)

1. **Real-phone test with 4 people.** Nothing can replace this. Check that:
   - the Kick button feels right;
   - the combo card shows up at the combo wall;
   - remote mode makes sense on phones;
   - the tunnel QR code works.
2. **Race narration is thin.** RaceVoice only speaks on falls, so a race can pass in silence. Ideas: lines for the first kick, a betrayal drop, a lead change, a team reaching ~90%, and the win. Hook them into `RaceVoice.event` in `prologue.cjs` using the event types above. Reuse the Narrator spacing rules and add tests next to the existing "races reuse the fall reactions" checks.
3. **Betrayal stats include accidental drops.** Auto-grab latches onto any touching rival when the pads are closed and no hold is in reach, so `drops` is inflated (49 in one Campus run). Fix options:
   - only count a `drop` if the grip was held more than ~0.8 s;
   - or only if the victim then falls more than 1 m.
   Then update the award text/tests in `rivalry-check.cjs` and the "holding hands, carrying drain, betrayal" check.
4. **Forest spot (32, 17.8)** and **Campus spot (44.5, 18.3)**: team B stalled there just short of the finish. Check whether the nearest hold ahead is more than ~3.4 m away or behind terrain: use `node tools/playtest.cjs forest 120` and print `level.holds` near that point. If a human would also struggle, add a twig or handle.
5. **Snowbound ladder base**: consider adding a rung at y ≈ 10.3 at x 24.6, or a box to stand on below rung 7, so the 2.7 m reach is less of a wall. Re-run `snowbound-props-check.cjs`.
6. **Prologue return ramp**: humans may also miss that you go back to the ledge to jump the gap. Consider an arrow or narrator line when a team sits on the ramp for more than 10 s.
7. ~~Port to `prologue-voice`~~: done. Both branches have the map, rivalry, playtest and handover commits, and both pass the suite.

## Gotchas

- `npm run test:3d` fails with "Missing script" if you run it from `rapier-prototype/`.
- `roof-surface-check.cjs` slices `render.js` source between `' for(const t of L.terrain.filter'` and `' if(L.pipe)'` and runs it in a vm. Any new helper used in that range must be stubbed in its context (the `mat` stub was added for exactly this).
- Bots in `playtest.cjs` only move toward holds ahead within 3.4 m, so "stuck" can be a bot limitation. Confirm a spot with a targeted physics check before changing the map.
- The ngrok URL changes whenever ngrok restarts. Update `PUBLIC_URL` and `.claude/launch.json`.
- `course-session-check.cjs` failed once in the full suite (`'race' !== 'practice'` at line 23) and passes when run alone. It's a timing flake: re-run before you chase it.
