# Two Left Legs

(Previously called Tethered.)

Four friends, eight hands, zero trust. A Foddian rage-climber for HackPSU's Mystery Stack
(phone motion · rivalry · 4+ players). Every phone is both the controller and the screen.

## Run it (5 minutes)

```bash
npm install
node server.js            # http://localhost:3000
```

- Laptop spectator / projector: `http://localhost:3000/screen.html` (shows the join QR code)
- Laptop "phone" for testing without motion: `http://localhost:3000/` (keyboard controls below)

### Testing on iPhones (needs HTTPS — iOS only gives motion data to https pages)

```bash
brew install ngrok        # once; free account
ngrok http 3000           # gives you https://xxxx.ngrok-free.app
```

Open `https://xxxx.ngrok-free.app/screen.html` on the laptop and have everyone scan the QR.
Tip: on each iPhone tap Share → **Add to Home Screen** for real full-screen.

### Deploying (for the expo)

It's one Node app (pages + websocket server). Render or Railway both work:
build `npm install`, start `node server.js`. Render's free tier sleeps after 15 min idle —
open the page 1 minute before you demo. Bring a phone hotspot in case the venue Wi-Fi is bad.

## Teams: two phones, one body

Every climber is driven by **two phones**: the **ARMS** can only hold on, the **LEGS** are the only way up.
Tap **Join** on a friend's team in the lobby (swap roles there too). Alone on a climber? You do both jobs.

| ARMS phone | Laptop | Does |
| --- | --- | --- |
| Tilt left/right + tilt top away/toward you | arrows | Moves your hands (each on its own side). Gripping: swings your body. In the air: **steers you left/right** |
| Hold LEFT / RIGHT HAND pad | hold Q / E | Close that hand: grabs a hold, or another climber's hand/body. Let go = open |
| Hold still | (default) | Braced: you can carry people hanging off your hands |

| LEGS phone | Laptop | Does |
| --- | --- | --- |
| Hop / stand up fast | W | **Jump** (the only way up). Pushes off the floor, a rock you stand on, or the wall while hanging |
| Lean left/right | ← / → | Swing your feet (they stand on rocks, but can't hold on) |
| Squat / jerk down | S | Tuck the knees up |
| Shove the phone forward | K | **Kick** the rival climber next to your feet |

## The rules that make it a game

- **Normal move:** feet on a rock, arms let go, legs hop (~1.75 m), arms catch the next hold.
- **Combo:** hanging by the hands with no footing, legs hop against the wall and arms let go within 0.4 s
  (either order) = launch. 2 s cooldown, costs stamina. The **TEAMWORK** gaps need it.
- Anyone hanging off your hands with nothing else to hold is **carried**: it drains stamina, and fidgeting while
  carrying rips you off. Feet resting on a rock rest your arms.
- **Betrayal:** letting go of someone who has nothing else to hold counts as a drop. Kick rivals off the wall.
- First team to the summit (60 m) wins. Awards: combos, kicks, drops, pushes, boosts, biggest fall.

## Code map

| File | What | Owner idea |
| --- | --- | --- |
| `server.js` | Physics (Planck.js), all game rules, rooms, snapshots 30×/s | Server person |
| `config.js` | Every jank/feel number. Also live-tunable from screen.html (press D) | Everyone while playtesting |
| `public/js/motion.js` | Phone sensors → aim / flick / yank / brace. Thresholds tunable via ⚙ on the phone | Input person |
| `public/js/render3d.js` | Three.js scene: boulder cliff, sky, water, foliage, 3D climbers posed from physics, camera, banners | Graphics person |
| `public/js/phone.js` + `index.html` | Join flow, lobby, hand pads, HUD, results | Graphics / UI |
| `public/screen.html` | Spectator: QR, betrayal feed, tuning sliders | 4th person |
| `public/js/sound.js` | Synth sound effects (no files needed) | Anyone |
| `test/sim.js` | `node test/sim.js` — headless check that the rules still work | Run before merging |

## Known gaps / next steps

- Motion thresholds are guesses until tested on real iPhones: tune FLICK and Steadiness from the ⚙ panel.
  If tilt feels backwards, the lobby has a Flip button.
- One game per server (fine for a hackathon). Players who join mid-round get in next round.
- Ideas: final-pitch duel at the summit, slow-mo camera on big falls, real sprites (kenney.nl), voice-line roasts.
