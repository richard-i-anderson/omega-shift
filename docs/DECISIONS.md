# Decisions and history

Why things are the way they are. `CLAUDE.md` covers commands and architecture; this file covers the reasoning, the dead ends, and what's still open. Add to it when you make a decision a future contributor would otherwise have to rediscover.

## Product

- **The brief:** a game very like Omega Race (1981), but the force fields (the outer boundary and the central score box) change shape: rectangle, circle, cross and so on, with at least one level where they morph during play.
- **Name: "Omega Shift", not "Omega Race".** Omega Race is an existing arcade title, so the game, the repo (`omega-shift`) and the public URL use a distinct name. The local folder is still called `OmegaRace`, which is fine.
- **Gameplay follows the original:** rotate/thrust/fire ship with momentum; droids circle the arena and are promoted to command ships (shoot, lay photon mines), which become death ships (chase, lay vapor mines). Walls bounce the ship, and the side you hit flashes.
- **v1 scope:** the core game plus five shape levels (four more were added later: BAR, PILLAR, STAR, MALTESE; see below). Deliberately deferred: sound, a high-score table, an attract mode, and touch controls (the game is keyboard-only, so it doesn't work on phones).

## Technology

- **TypeScript + HTML canvas + Vite, no game engine.** The folder started as an empty IntelliJ Kotlin/Gradle/JDK 17 project. The user chose a browser stack over Kotlin + LibGDX, and the IntelliJ Gradle settings were removed. Canvas is enough for vector graphics, and a static bundle is trivial to host.
- **Fixed 120 Hz physics, rendering once per animation frame.** Together with the collision snap-back (below), a fixed step is enough to stop fast bullets tunnelling through walls, without swept collision.
- **Fixed 1024×768 logical world, letterboxed.** Level shapes are written in those coordinates.

## Force-field design

- **Fields are polar radius arrays** (star-shaped around the centre, sampled at N fixed angles). This was chosen over vertex-matched polygons because it makes three things trivial: morphing between *any* two shapes (just lerp the radii), an enemy track for every shape (the midline), and a corridor-safety guarantee (checking the keyframes is enough, because blends are linear). The cost is that shapes must be star-shaped around the centre, so no spirals or C-shapes.
- **N = 720, not 256.** At 256 samples, a rectangle's corner falls between two samples and is visibly cut off (a chamfer of roughly 15 px). 720 reduces it to about 5 px. `tests/stress.test.ts` passed at both values; re-run it if N changes.
- **Collision resolves the deepest contact first, and iterates.** The first version resolved edges in window order, so a neighbouring edge's shared vertex could win with a diagonal normal. Bounces off flat walls came out wrong, and the snap-back didn't hold. Resolving the true closest point first, up to three times, fixed this and still handles corners that touch two edges.
- **Bounces are relative to the wall's velocity.** That's what lets a morphing wall shove the ship instead of passing through it.
- **Wall flash lights the whole straight side** (as in the original), or a short arc on curves. The "straight" threshold is tied to `DTHETA` on purpose. With a fixed threshold, raising N made a circle's per-edge turn fall below the threshold, and a single hit lit half the ring.

- **Chambers come from the inner field overlapping the outer one**, not from a new kind of wall. Wherever the inner radius exceeds the outer, the corridor is closed; the open stretches between are chambers. This keeps everything a pair of polar arrays. The Maltese cross's arms have radial sides and a hub (r 40) smaller than the score circle (r 90), so each arm is sealed off.
- **Chambered keyframes must have radial (step) dividing walls, and can't be part of a morph.** Validation then stays per-sample: every sample is either open by `minGap` or closed, and each chamber is at least `minGap` wide along the track. Two continuous shapes that cross would leave arbitrarily narrow wedges, and blending into or out of a chamber pinches corridors shut, so the in-play morph guarantee wouldn't hold. Between-level transitions do pinch; the only thing alive then is the ship, and `Game` jumps it clear if its corridor gets narrower than the ship.
- **Snap-back moves a crossed body to the nearest boundary point, not along its ray.** Along the ray was fine for walls that only move radially, but a body that crosses a radial chamber wall would be snapped to the hub, inside the score circle, and ping-pong between the fields. The nearest-point search window is sized by the ray penetration, which bounds the true distance. `collideArena` retries once, then puts the body on the nearest open track point as a last resort.
- **`chamberAt` treats the interval between a closed and an open sample as the open side's.** That interval holds the (near-radial) dividing wall; looking only at the left sample misclassified bodies in front of it.
- **Score outside the arena:** the bar and pillar leave no room for an inner field, so these levels set `scoreAt`. Their inner field is a zero-radius circle (not drawn, and `polyRadiusAt` returns 0 for it rather than 0/0), and the score readout glides from the centre to a panel outside the outer field during the transition. The inner-radius check is skipped for them.
- **An "I" can't have right-angle serifs:** the underside of a serif isn't visible from the centre. The user chose a plain thin bar (PILLAR) over angled serifs.
- **Hyperspace (H):** on a chambered level it goes to the next chamber clockwise (predictable, so you can plan a route), landing on the chamber's safest stretch; on a connected level, a random track point, like arcade hyperspace. Both have a 1.5 s cooldown and 0.75 s of invulnerability on arrival, and stop the ship. Chosen by the user.
- **Enemies in chambers:** a wave's droids are shared between the chambers the ship isn't in, so the player has to hyperspace to reach them. Track-followers turn back at a chamber's end wall, and the droids in a chamber turn together as a formation (turning individually made them pass through each other). Hunters only chase or shoot at a ship in their own chamber.
- **Track-followers move at a constant speed along the track**, not a constant angular speed, which bunched enemies on thin shapes (the bar's track is long and flat far from the centre). Wave droids are spaced 50 px apart along the track for the same reason.

## Testing

- **Unit tests** cover the shape maths, the morph timeline, level validation, and collision (flat walls, moving walls, the inside corners of the cross, snap-back).
- **`tests/stress.test.ts`** runs 200 fast bodies per level for 60 simulated seconds and asserts none escape the corridor or leave the chamber they started in. This is the main guard for any change to physics, shapes or N. With nine levels the suite takes about 17 s.
- **`tests/game.test.ts`** drives `Game` headlessly with a fake `Input`: five minutes of random play, plus a check that clearing a wave morphs the arena into the next level.
- **The long simulation tests have a 60 s timeout.** Each takes about 1.5 s on a laptop (the whole suite about 8 s), but they went over Vitest's 5 s default on GitHub's runners, which broke the first deploy.
- **Visual checks** have been headless Chrome screenshots (`--headless=new --screenshot`), sometimes via a temporary preview page that renders every level; that page was deleted afterwards. The Claude in Chrome extension was declined, so don't suggest it.

## Deployment

- **Live site:** https://richard-i-anderson.github.io/omega-shift/. **Repo:** https://github.com/richard-i-anderson/omega-shift (public, because Pages on a free plan needs a public repo).
- **`.github/workflows/deploy.yml`** runs on every push to `main`: `npm ci` → `npm test` → `npm run build` → publish `dist/` to Pages. A failing test blocks the deploy. Pages is set to build type "workflow".
- **Vite `base: './'`** keeps asset paths relative, so the build works in the `/omega-shift/` subpath (and on any other static host).
- **Commits use the GitHub noreply address**, configured in this repo only, so the user's real emails stay out of public history. Don't change it.
- **Pushing:** the user's git credential helper is the macOS keychain, which may not have a GitHub login. Push with `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`, or ask the user to run `gh auth setup-git` once (it changes their global git config, so ask first). Pushing workflow files needs the gh token's `workflow` scope; it has been granted.

## Open items

- **Not yet played with a real keyboard.** Speeds, fire rates, promotion timers and point values in `src/config.ts` are first guesses and need playtesting.
- **Morphs checked visually** (headless screenshots of CROSS→MALTESE and RING→BAR mid-transition, and the Maltese chambers over time), but new levels' tuning (droid counts, speed scales) is untested in real play.
- **`actions/deploy-pages@v4`** gives a Node 20 deprecation warning. It still works, but should move to a newer version at some point.
- **Deferred features:** sound, high-score table, attract mode, touch controls.
