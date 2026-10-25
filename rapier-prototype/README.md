# Tethered / Snowbound — complete 3D course

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
