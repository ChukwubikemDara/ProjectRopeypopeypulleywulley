# Tethered — three 3D race courses

The complete course and gameplay rules from main `8f94284` are adapted to server-side Rapier 3D and the Snowbound presentation. Travel stays centered, with 3D body rotation and swinging. This is the full race, not the earlier pipe-to-ledge slice. The original Planck server remains available as a fallback.

## Run

From the repository root:

```sh
npm ci
npm --prefix rapier-prototype ci
npm run start:3d
```

- Spectator: http://localhost:3010/screen (also `/screen.html`)
- Phone: http://localhost:3010/phone (also `/index.html`)
- Checks: `npm run test:3d`
- Older `lab:3d` and `lab:3d:check` commands remain aliases.
- `npm start` and `npm test` still launch/test the original Planck game.

Physical iPhone motion needs trusted HTTPS. With the ignored local `certs/` directory present, this server also serves HTTPS on port 3450, and the spectator QR uses it automatically. On the current network: https://10-0-0-81.local-ip.sh:3450/phone. The user previously confirmed iPhone Safari motion over HTTPS. Calibration still requires explicit completion and reports actual tilt/acceleration delivery.

## Scenic lobby and motion Kick update

The lobby now frames a scenic section of the selected world, with the existing character model used for two decorative climbers in a different scene for each biome. Snowbound adds smooth layered snow peaks, sculpted snow-covered rocks and clouds; forest adds layered canopy and drifting pollen/leaves; campus adds distant academic roofs, a clock tower, warm foliage and pennants. These props are decorative, without colliders. Course geometry, physics, downward gravity and the scripted prologue are unchanged.

Ambient motion uses ordinary Three.js scene objects and one capped particle draw (100 desktop / 40 phone). Phones omit the decorative character models. Props animate more slowly during play, and reduced-motion preference stops the decorative movement and lobby camera drift. Course swaps dispose the old sky texture and decorative resources; animated transforms explicitly opt out of the static transform freeze. Renderer FPS/draw/geometry metrics are available as canvas data attributes for QA, not a new gameplay overlay.

The menu keeps a real QR and join link visible, puts technical controls under Host settings, preserves keyboard focus while the roster updates, and supports narrow screens. Returning to Menu from results uses the existing host course-selection action, because the server's end-round action only accepts a playing round.

Motion-mode LEGS/solo players again have a Kick button alongside the shove gesture. Jump/Tuck buttons remain touch-mode controls. Calibration, roles, shared motion/button lockout and server cooldowns remain enforced. The prologue instructions were not changed. Browser checks verified the actual Kick control and out-of-range feedback; physical-phone comfort still needs user testing.

The next detail pass gives Snowbound its rope-climbing vignette, Forest a helping-hand scene on a mossy perch, and Campus a waving pair on a terrace. `world-details.js` adds batched flowers, ferns, an ear-twitching hare and a bounded songbird flight in Forest; Campus gains benches, lanterns, planted tubs, drainpipes, stone trim, roof vents and gently waving banners. These are visual stage props, not added obstacles. Instanced flower buffers are disposed with the course; reduced-motion preference pauses wildlife and cloth as well as other ambient animation.

Additional tests: `menu-check.cjs` verifies focus, host permissions and results navigation; `ambience-check.cjs` uses real Three.js objects to verify animation, reduced motion, phone limits, lobby-only actors and sky cleanup. The existing physics/multiplayer suite remains required.

## Phone controls update (milestone 1)

Motion remains primary. LEGS and solo players always have a Kick button. Jump and Tuck buttons appear in touch mode. ARMS never see or send leg actions. Buttons and motion share the existing gesture path, server role checks, cooldowns and a short client lockout, preventing a tap/jostle double trigger.

Choosing “Continue with touch controls” enables sensor-free aiming plus all action buttons. Drag the aim pad (or focus it and use arrows); Center resets it. Aim stays where released so a player can aim, then close a hand pad. Settings can switch back to motion; Enable motion also does so. Touch mode suppresses sensor gestures while retaining the button path.

The status card reports actual server jump readiness, combo timing cues, and missing footing; pads distinguish OPEN / IN REACH / SEARCHING / GRIPPED / CLIMBER, and feet show Planted / Free. The server uses the same jump eligibility calculation for both gameplay and HUD snapshots. Backgrounding the page releases pads and centers touch aim. New controls are browser-tested; current physical iPhone motion still needs a user refresh/feel check after this change.

## Map loading and shared practice (milestone 2)

The host can choose a built race course in Race controls, start shared Base Camp practice, retry the same map, or advance from results to the next available race map. The built catalog now rotates Snowbound → Forest → Campus → Snowbound. Each entry loads distinct collision geometry, holds and scenery.

`courses.cjs` prepares/validates plain course definitions (bounds, convex terrain pieces, finite path segments and unique holds). `Simulation.create(course)` owns that definition and derives collision depth, catch floor, spawn, progress, bounds and finish from it. The server replaces worlds while retaining team identities/roles and tuned settings. Every load has a revision; clients discard the old interpolation buffer and reject stale snapshots. The renderer disposes course-owned meshes, textures, geometries, characters and grip cues before rebuilding. The original mountain course remains data-identical to main.

Practice is optional and shared. It teaches aim → a real grip → an actual rising jump → a synchronized combo → a physical kick against a training snowpal. Checklists are per climber/team, shown on both controllers and the spectator. Actions may be learned out of order, retries never award progress, and nobody must finish a checklist before the host starts a race. Reset stance moves the team to the current lesson station; at the hanging station, hold the pads before resetting so hands can catch real holds.

Use Calibrate & practice together in the phone lobby, or Practice together on the spectator. Skipping tips hides them on that device; Show practice tips restores them. The host can start the race immediately. Spectators are preferred as host, with automatic handoff/reconnect handling. Buttons remain behind calibration/role checks.

Narration uses an original short script, always has captions, and is muted until Enable voice is tapped on that device. Speech uses the browser's optional [Web Speech synthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak); absent/failed speech leaves captions working. Mute, hiding tips, leaving practice and backgrounding the page cancel queued speech. Voice quality and availability depend on the device and still need physical-phone listening checks.

Additional checks cover ordered rotation using a distinct test course, repeated world replacements, retained teams, retry versus next-map semantics, stale packet rejection, map availability and host permissions, all five tutorial skills through two controller roles and real physics, dummy impulse, optional voice/mute/captions, and preserving a practice request through touch fallback.

## Three continuous courses (milestone 3)

Snowbound retains the complete main course. Forest “Branch Management” follows roots into a trunk climb, a horizontal bough, an uphill branch and the crown. Falling from the branch can land on a lower catch bough; open space beneath the upper branches permits a return to the roots. Campus “Old Main, New Heights” connects the lawn and portico to a facade climb, cornice, roof and clock tower. These are continuous course silhouettes, not scene transitions. Gravity and phone controls stay the same.

Each race includes one named risky shortcut in `routes.shortcut`: pipe roof, vine line, or bunting line. The vine/bunting grip strains, snaps after 2.4 seconds and regrows after 6.5 seconds; ordinary rungs remain available. Route metadata also records the main line for later shortcut interactions. No sabotage lever is implemented yet.

`race-courses.cjs` defines the new collision silhouettes and holds. `client/biomes.js` adds course-owned layered trees, canopy, bark, campus windows/columns/clock, and alpine peaks. Scenery stays behind the interaction plane; apparent footholds along the route use the same coordinates as physical terrain. Per-biome sky, ground and light colors keep the existing soft characters readable. Race progress on the new elevated maps discounts positions far below the route, and finish detection still requires the correct elevation.

`biome-check.cjs` checks existing leg hops, real spherical grip joints and coordinated lip-clearing jumps at every new vertical section, fast falls on each terrain section without recovery masking, shortcut snap/regrow, and elevated finish detection. These are isolated section fixtures, not an automated full-course playthrough. `rotation-check.cjs` checks the actual three-course server rotation/retry and retained two-controller roles. Full physical two-phone races, difficulty tuning, and performance measurements on the iPhone remain the next playtest.

## Full course and rules

The source course and config are copied from main `8f94284` into `course-source.cjs` and `main-config.cjs`. Terrain, obstacle height, original hold positions, moving cart, signs, racing line, and finish zone are preserved.

- Start → inclined pipe with floor ridges, original obstacle and ceiling handles; slippery outside shortcut.
- Checkpoint ledge → wall with a loaded twig that snaps after 2.5 seconds and regrows after 6 seconds; alternate hanging ladder and overhang.
- Upper ledge → reversing cart with moving grip handles and collision knockback → finish flag.
- ARMS: tilt positions hands and steers in the air; hold pads to grab nearby course holds, another climber, or their hands; release to let go.
- LEGS: lean swings physical feet, hop jumps from footing/grips, squat tucks, shove kicks nearby rivals. Feet stand on terrain, hold tops, carts and other torsos; hold supports are one-way.
- While hanging, hop and release both pads within 0.4 seconds, either order, for a stronger combo. Cost/cooldown apply. Holding a floating climber is not footing for infinite jumps.
- Braced carriers can hold two dangling climbers. Carrying drains energy; shaky overload rips grips after a half-second grace period. Holding a friend awards a save; dropping an unsupported friend counts as betrayal.
- Hopping from a supported climber boosts the jumper and pushes the supporter down. Kicks drain energy or break an unbraced grip.
- Full-course progress, falls, finish detection, earned awards, restart/end round, bots, team selection/swap and disconnect cleanup.
- Spectator: course/follow cameras, join QR, race controls, live tuning under a disclosure, brief event feed and results. Phone diagnostics stay in settings.

The current main phone controller is served from `client/phone.js`, with timeout-aware gesture feedback adapted to the 3D protocol. Grip transitions remain reliable; tilt uses main's volatile updates capped at about 30/s, plus a reliable heartbeat. State snapshots run at 45/s with interpolation for limbs and the cart. Main’s adaptive pixel ratio/shadow cadence and camera-following shadow coverage are also retained; the finish flag animates.

## 3D adaptations

Torso, hands and feet are physical Rapier bodies. Maximum-reach rope constraints bound the limbs while force-driven muscles respond to tilt. Elbows/knees are posed visually rather than separate upper/lower limb rigid bodies. This is gameplay-rule parity with adapted 3D physics, not identical Planck ragdoll geometry or exact feel.

Depth translation is disabled for every climber part; rotation remains physical. No front/back lanes or checkpoint/assist buttons are exposed. Upright/facing stabilization stays internal. CCD, a solid catch floor and recovery guard protect invalid/embedded states; recovery removes incoming grips before moving a player.

## Verification

`npm run test:3d` covers:

- Main course geometry and racing line, actual twig combo reaching the wall lip, one-way holds, twig snapping/regrowth, cart reversal, moving-handle joints and physical cart contact.
- Stable two-second physical carrying with energy drain/save, betrayal, boosts, overload, no airborne leapfrog, disconnect joint cleanup, full finish and awards.
- Four-phone pairing, role swaps/team selection, bots, bounded live tuning, results, restart/end round and solo fallback.
- Calibration, synthetic sensor interpretation, leg-driven jumps, both combo orders, grip acquisition/stability, centered travel, nine fast falls and recovery.
- Four bots remain finite for 30 simulated seconds. This is a stability check, not a claim that bots can finish the full course.

Main's separate Planck simulation suite also passes. Hardware feel and end-to-end human route difficulty still need a two-phone playtest; there is no claim of an identical engine port or a completed human race.

Debug checkpoint injection remains off unless `LAB_DEBUG=1`; no debug buttons appear in ordinary play. Certificates/private keys are ignored and excluded from source bundles. `TLS_CERT`, `TLS_KEY`, `HTTPS_PORT`, `PUBLIC_URL` and `PORT` can override local setup.
