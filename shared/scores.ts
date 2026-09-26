/**
 * High-score rules shared by the game (instant feedback) and the score
 * Worker (the real check): what a name may be, and what a plausible
 * submission looks like. No DOM or Worker APIs here.
 */

export interface ScoreEntry {
  name: string;
  score: number;
  /** The round reached, from 1. */
  level: number;
}

/** Name slots. Each is a letter or blank; blanks are trimmed off the ends. */
export const NAME_LEN = 5;
/** What ↑/↓ cycle through in a name slot: A–Z, then blank. */
export const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';

/**
 * Refused wherever they appear in a name. Only strings that are rude on
 * their own, so they don't catch innocent names (e.g. "ASS" is not here, or
 * CLASS and GLASS would be refused; it's in `BLOCKED_EXACT`).
 */
const BLOCKED_ANYWHERE = [
  'FUCK', 'FUK', 'FCUK', 'SHIT', 'CUNT', 'NIGG', 'NIGA', 'WANK', 'TWAT', 'SLUT', 'WHORE', 'PISS', 'COCK',
  'DICK', 'PUSSY', 'JIZZ', 'BITCH', 'BOLLO', 'FAGG', 'KIKE', 'CHINK', 'NAZI', 'KKK', 'PENIS', 'VAGIN',
  'DILDO', 'TITTY', 'BONER', 'RETAR', 'PAKI', 'GOOK', 'DYKE', 'TRANY', 'SPUNK', 'NONCE', 'PEDO', 'PORN',
  'CLIT',
];

/**
 * Refused only as the whole name, because they're inside innocent words:
 * CLASS, TITAN, CUMIN, SPICE, GRAPE, CANAL, JANUS.
 */
const BLOCKED_EXACT = [
  'ASS', 'ARSE', 'ARSES', 'FAG', 'FAGS', 'CUM', 'TIT', 'TITS', 'SEX', 'SEXY', 'BOOB', 'BOOBS', 'NOB', 'NOBS',
  'KNOB', 'KNOBS', 'BALLS', 'SPIC', 'SPICS', 'RAPE', 'RAPED', 'RAPES', 'RAPER', 'ANAL', 'ANUS', 'HOMO', 'HOMOS',
  'WOP', 'WOPS', 'FANNY',
];

export type NameCheck = 'ok' | 'empty' | 'invalid' | 'rude';

/** The name made from the slots: blanks trimmed off both ends. */
export function cleanName(slots: readonly string[] | string): string {
  return (typeof slots === 'string' ? slots : slots.join('')).trim();
}

/** Whether `name` (already cleaned) may go on the board. */
export function checkName(name: string): NameCheck {
  if (!name) return 'empty';
  if (name.length > NAME_LEN || !/^[A-Z]+$/.test(name)) return 'invalid';
  if (BLOCKED_EXACT.includes(name) || BLOCKED_ANYWHERE.some((w) => name.includes(w))) return 'rude';
  return 'ok';
}

/**
 * Every points value in the game is a multiple of this (see SCORE and
 * BONUS.points in src/config.ts), so any other score was made up.
 */
export const SCORE_STEP = 50;
export const MAX_SCORE = 10_000_000;
export const MAX_LEVEL = 999;
/**
 * The fastest a real game can score, as points up front plus points per
 * second of play. Generous: a smart bomb clearing a full wave is about 40 000
 * points at once.
 */
export const SCORE_ALLOWANCE = { base: 60_000, perSecond: 3_000 };
/** A round takes at least this long (the level card alone is 3 s). */
export const MIN_SECONDS_PER_LEVEL = 3;

export interface Submission extends ScoreEntry {
  /** Seconds the game lasted. */
  seconds: number;
}

/** Why a submission is refused, or null if it's plausible. */
export function checkSubmission(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'not an object';
  const { name, score, level, seconds } = s as Record<string, unknown>;
  if (typeof name !== 'string' || checkName(name) !== 'ok') return 'bad name';
  if (!Number.isInteger(score) || (score as number) < SCORE_STEP || (score as number) > MAX_SCORE) return 'bad score';
  if ((score as number) % SCORE_STEP !== 0) return 'bad score';
  if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > MAX_LEVEL) return 'bad level';
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return 'bad time';
  if ((score as number) > SCORE_ALLOWANCE.base + SCORE_ALLOWANCE.perSecond * seconds) return 'too fast';
  if (((level as number) - 1) * MIN_SECONDS_PER_LEVEL > seconds) return 'too fast';
  return null;
}

/** Highest first; equal scores keep their order (the earlier one ranks higher). */
export function rankEntries<T extends ScoreEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.score - a.score);
}
