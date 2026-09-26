import { describe, expect, it } from 'vitest';
import { checkName, checkSubmission, cleanName, NAME_CHARS, NAME_LEN, rankEntries } from '../shared/scores';

describe('high-score names', () => {
  it('are up to five capital letters, trimmed, with no gaps inside', () => {
    expect(NAME_LEN).toBe(5);
    expect(cleanName(['A', 'C', 'E', ' ', ' '])).toBe('ACE');
    expect(cleanName('  BOB')).toBe('BOB');
    expect(checkName('ACE')).toBe('ok');
    expect(checkName('ZORRO')).toBe('ok');
    expect(checkName('')).toBe('empty');
    expect(checkName('A B')).toBe('invalid');
    expect(checkName('abc')).toBe('invalid');
    expect(checkName('ABCDEF')).toBe('invalid');
    expect(checkName('R2D2')).toBe('invalid');
    expect(NAME_CHARS).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ ');
  });

  it('refuses rude words, including inside a longer name', () => {
    for (const n of ['FUCK', 'XFUCK', 'SHITS', 'ACUNT', 'WANKR', 'NAZIS']) expect(checkName(n), n).toBe('rude');
    for (const n of ['ASS', 'TITS', 'CUM', 'RAPE', 'ANUS']) expect(checkName(n), n).toBe('rude');
  });

  it("doesn't refuse innocent names that contain a short rude word", () => {
    for (const n of ['CLASS', 'GLASS', 'BASS', 'TITAN', 'CUMIN', 'SPICE', 'GRAPE', 'CANAL', 'JANUS', 'HELLO']) {
      expect(checkName(n), n).toBe('ok');
    }
  });
});

describe('score submissions', () => {
  const ok = { name: 'ACE', score: 12_350, level: 3, seconds: 90 };

  it('accepts a plausible score', () => {
    expect(checkSubmission(ok)).toBeNull();
  });

  it('refuses bad names, odd scores, bad levels and impossible speeds', () => {
    expect(checkSubmission({ ...ok, name: 'FUCK' })).toBe('bad name');
    expect(checkSubmission({ ...ok, name: 'toolong' })).toBe('bad name');
    expect(checkSubmission({ ...ok, score: 12_345 })).toBe('bad score'); // every points value is a multiple of 50
    expect(checkSubmission({ ...ok, score: 0 })).toBe('bad score');
    expect(checkSubmission({ ...ok, score: 1.5 })).toBe('bad score');
    expect(checkSubmission({ ...ok, level: 0 })).toBe('bad level');
    expect(checkSubmission({ ...ok, seconds: -1 })).toBe('bad time');
    expect(checkSubmission({ ...ok, score: 5_000_000, seconds: 60 })).toBe('too fast');
    expect(checkSubmission({ ...ok, level: 40, seconds: 60 })).toBe('too fast');
    expect(checkSubmission(null)).toBe('not an object');
  });

  it('ranks highest first', () => {
    const e = (name: string, score: number) => ({ name, score, level: 1 });
    expect(rankEntries([e('A', 100), e('B', 300), e('C', 200)]).map((x) => x.name)).toEqual(['B', 'C', 'A']);
  });
});
