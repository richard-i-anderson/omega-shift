import { describe, expect, it } from 'vitest';
import { WELCOME } from '../src/config';
import { Game } from '../src/game';
import type { Input } from '../src/input';
import { hasGlyph, textWidth } from '../src/render/vectorFont';
import { pageLength, welcomeView, WELCOME_PAGES } from '../src/welcome';

const noInput = { isDown: () => false, wasPressed: () => false, endFrame: () => {} } as unknown as Input;

describe('welcome text', () => {
  it('waits, shows each page in turn, leaves a gap, then starts again', () => {
    expect(welcomeView(0)).toBeNull();
    expect(welcomeView(WELCOME.delay - 0.01)).toBeNull();
    const at = (t: number) => welcomeView(WELCOME.delay + t);
    expect(at(1)?.page).toBe(0);
    expect(at(WELCOME.pageSec + 1)?.page).toBe(1);
    const shown = WELCOME.pageSec * WELCOME_PAGES.length;
    expect(at(shown + 0.1)).toBeNull();
    expect(at(shown + WELCOME.gapSec + 1)?.page).toBe(0);
  });

  it('fades each page in and out, and types it out', () => {
    const at = (t: number) => welcomeView(WELCOME.delay + t)!;
    expect(at(0).alpha).toBe(0);
    expect(at(WELCOME.fadeSec / 2).alpha).toBeCloseTo(0.5);
    expect(at(WELCOME.pageSec / 2).alpha).toBe(1);
    expect(at(WELCOME.pageSec - 0.01).alpha).toBeLessThan(0.05);
    expect(at(1).chars).toBe(Math.floor(WELCOME.typeRate));
  });

  it('every page finishes typing with time left to read it', () => {
    for (const page of WELCOME_PAGES) {
      expect(pageLength(page) / WELCOME.typeRate).toBeLessThan(WELCOME.pageSec / 2);
    }
  });

  it('the font has every character the pages use, and the lines fit the panel', () => {
    const strings = WELCOME_PAGES.flatMap((p) =>
      p.kind === 'story' ? [p.title, ...p.lines] : [p.title, ...p.rows.flatMap((r) => [r.name, r.points, r.text])],
    );
    for (const s of strings) for (const ch of s) expect(hasGlyph(ch), `"${ch}" in "${s}"`).toBe(true);
    for (const p of WELCOME_PAGES) {
      if (p.kind === 'story') for (const l of p.lines) expect(textWidth(l, 13)).toBeLessThan(800);
      // Descriptions start at x 190 and must stay inside the panel's right edge (932).
      else for (const r of p.rows) expect(190 + textWidth(r.text, 11)).toBeLessThan(900);
    }
  });

  it('counts idle time on the title only, and any key resets it', () => {
    const game = new Game(false);
    for (let i = 0; i < 120 * 3; i++) game.update(1 / 120, noInput);
    expect(game.idle).toBeCloseTo(3);
    game.wake();
    expect(game.idle).toBe(0);
  });
});
