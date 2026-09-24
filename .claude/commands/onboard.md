---
description: Get up to speed on Omega Shift, its design decisions and current state
argument-hint: "[area to focus on, e.g. collision, levels, deploy]"
allowed-tools: Read, Glob, Grep, Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git remote -v), Bash(npm test:*), Bash(npm run typecheck:*), Bash(npx vitest run:*), Bash(gh run list:*)
---

You're joining work on Omega Shift, an Omega Race-style browser game whose force fields change shape and morph. Get up to speed before changing anything.

## 1. Read the project docs

- `CLAUDE.md`: commands and architecture.
- `docs/DECISIONS.md`: why things are the way they are, past bugs and dead ends, deployment details, and open items. Treat this as the source of truth for decisions already made; don't re-open them unless the user asks.

## 2. Read the core code

Read these in order. Each is short, and together they explain the game's core design (polar force fields):

1. `src/arena/shapes.ts`: shapes as `r(θ)` functions, `N`.
2. `src/arena/field.ts`: `ForceField` (polygon, wall velocity, flash).
3. `src/arena/arena.ts`: keyframe timeline, morphing, orbit track, `validateKeyframes`.
4. `src/physics/collide.ts`: snap-back plus deepest-first contact resolution.
5. `src/game.ts`: state machine and entity lists.
6. `src/config.ts` and `src/levels/levels.ts`: tuning and level data.

Skim everything else only as needed.

## 3. Check the current state

Run these, in parallel where possible:

- `git status` and `git log --oneline -15`: uncommitted work and recent history. Use `git diff` to see what any uncommitted changes are.
- `npm run typecheck` and `npm test`: confirm the baseline is green. The suite takes about 8 s, mostly the stress test.
- `gh run list --limit 3`: status of recent GitHub Pages deploys. Skip this if gh isn't installed or signed in.

## 4. Focus area

If the user gave a focus area, read deeper there: the relevant source, its tests, and the related sections of `docs/DECISIONS.md`. Focus area: $ARGUMENTS

## 5. Report

Give the user a short briefing, at most about 15 lines:

- What the project is and its current state, including test and deploy status and any uncommitted changes.
- The two or three design points most relevant to the focus area, or to the work in general if none was given.
- The open items from `docs/DECISIONS.md` that are still open.
- Anything that contradicts the docs: failing tests, code that disagrees with `CLAUDE.md` or `docs/DECISIONS.md`, or a failed deploy. Say it plainly; don't fix it unasked.

Then ask what to work on. Keep the briefing to what you verified; don't pad it.

When later work in the session makes a decision a future contributor would need to know, add it to `docs/DECISIONS.md`.
