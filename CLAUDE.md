# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Omega Shift": a browser game in the style of Omega Race (1981), where the force fields (the outer boundary and the inner score box) change shape from level to level and, on one level, morph continuously during play. TypeScript + HTML canvas, bundled with Vite, no game engine or runtime dependencies.

`docs/DECISIONS.md` records why things are the way they are (design reasoning, past bugs, deployment, open items); read it before revisiting a design choice, and add to it when you make one. `/onboard` walks a new agent through the docs, code and current state.

## Commands

```sh
npm run dev          # dev server at http://localhost:5173
npm test             # vitest, all tests (the stress test takes a few seconds)
npx vitest run tests/collide.test.ts        # one file
npx vitest run -t "concave corner"          # tests matching a name
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + static bundle in dist/
```

In play, `M` toggles sound (remembered in `localStorage`). Open `http://localhost:5173/?debug` for debug keys: `1`–`9` jump to a level, `` ` `` toggles an overlay showing the orbit track, wall normals, and wall velocity.

## Architecture

**Force fields are polar radius arrays.** Every field is a star-shaped closed curve around the arena centre, stored as radii sampled at `N` fixed angles (`src/arena/shapes.ts`). Shapes are `r(θ)` functions (`ShapeSpec`: circle, ellipse, rect, diamond, cross, ngon, star, maltese; the last two are star-shaped polygons). Most of the design follows from this:
- Morphing between any two shapes is linear interpolation of the radius arrays (`Arena` keyframe timeline in `src/arena/arena.ts`, also used for the between-level transition).
- The enemy orbit track is `(inner(θ) + outer(θ)) / 2`, so it works for every shape and follows morphs automatically.
- `validateKeyframes` checks the corridor width and the inner-field size per keyframe. Because blends are linear, keyframes that pass guarantee every in-between shape passes too. A new shape must be star-shaped around the centre (every boundary point visible from it).
- **Chambers:** where the inner field reaches past the outer one, the corridor is closed, splitting the arena into isolated chambers (`Arena.chambers`, `chamberAt`; the Maltese level). Chambered keyframes need radial dividing walls and can't be part of a morph. Track-followers turn back at a chamber's end wall (droids as a formation), hunters only chase or shoot within their chamber, and `H` hyperspaces the ship to the next chamber clockwise (on connected levels, to a random spot).
- **Score outside:** a level with `scoreAt` has no room for the score in the middle (the bar and pillar). Its inner field is a zero-radius circle and the score glides out to a panel at `scoreAt` as the arena morphs in.
- `ForceField` (`src/arena/field.ts`) keeps the polygon points, per-vertex radial velocity (from the change since the last step), and per-edge flash state. The polygon is **counter-clockwise in math orientation** (interior on the left of each edge), which collision relies on.

**Collision** (`src/physics/collide.ts`) treats each field as a polygon: the outer one keeps bodies in, the inner one keeps them out. If a body's centre has crossed the polygon (checked exactly along its ray via `polyRadiusAt`), it's moved to the nearest point on the boundary first (nearest point, not along the ray, so radial chamber walls push sideways). If it's still outside the arena after both fields, `collideArena` retries, then moves it to the nearest open track point. Then contacts in a small angular window are resolved **deepest-first**, iterating to handle corners. Velocity is reflected relative to the wall's velocity at the contact point, which is how morphing walls shove things. `tests/stress.test.ts` checks that nothing escapes the corridor or its chamber on any level; run it after touching collision, shapes, or `N`.

**Simulation** runs at a fixed 120 Hz (`src/loop.ts`), rendering once per animation frame. The world is a fixed 1024×768 logical space, letterboxed to the window (`src/main.ts`). `Game` (`src/game.ts`) is the state machine (`title → levelClear → playing → … → gameOver`; `levelClear` doubles as the "get ready" card while the arena morphs to the next level) and owns every entity list. `Game` doesn't touch the DOM, so tests drive it headlessly with a fake `Input` (`tests/game.test.ts`).

**Enemies** (`src/entities/enemies.ts`) are one `Enemy` shape with a `kind`. Droids follow the track; one at a time they're promoted to command ships (track-following, shoot, lay photon mines), which eventually become free-flying death ships (chase the player, bounce off walls, lay vapor mines). Mines stay put but get pushed by moving walls.

**Events and sound:** `Game` never calls audio. It pushes `GameEvent`s (`src/events.ts`) onto `game.events`, and `main.ts` drains them into `AudioEngine` (`src/audio/engine.ts`) once per frame, so tests can assert on what fired. Enemy code reports through `EnemyWorld.emit`. Force-field hits are recorded by `collideArena` on `arena.hits` when its caller passes a `source` (`'ship' | 'shot' | 'enemy' | 'mine'`) and the hit is hard enough to flash; `Game` moves them into `events` each step. The background pulse needs no events: `ambientDanger(game)` (`src/audio/danger.ts`, pure) picks it from the most dangerous enemy alive. All sounds are synthesised (`src/audio/synth.ts`: oscillators, noise, envelopes, sweeps) from patches in the `SOUND` block of `src/config.ts`; the AudioContext is created on the first key press or click. `tests/sound.test.ts` checks the events and runs the engine against a fake AudioContext.

**Tuning and content:** all gameplay numbers are in `src/config.ts`. Levels are data in `src/levels/levels.ts`; after the last level the list repeats with a higher speed scale. A new level only needs a new entry there, and the level-validation test covers it automatically.
