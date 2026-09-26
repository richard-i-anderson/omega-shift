import { SCORES } from '../config';
import { checkName, type ScoreEntry, type Submission } from '../../shared/scores';

/**
 * Browser side of the high scores: the global board from the score Worker,
 * and this device's best from localStorage. `Game` never calls this; `main.ts`
 * does, and hands the results to `game.board`.
 */

/** The Worker's base URL, or null if this build has none (global scores offline). */
export function scoresUrl(): string | null {
  const url = import.meta.env.VITE_SCORES_URL;
  return url ? url.replace(/\/+$/, '') : null;
}

async function call(path: string, init?: RequestInit): Promise<{ top: ScoreEntry[]; rank?: number }> {
  const base = scoresUrl();
  if (!base) throw new Error('no score server configured');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SCORES.fetchTimeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { ...init, signal: abort.signal });
    if (!res.ok) throw new Error(`score server: ${res.status}`);
    const body = (await res.json()) as { top?: unknown; rank?: number };
    if (!Array.isArray(body.top)) throw new Error('score server: bad reply');
    return { top: body.top.filter(isEntry), rank: body.rank };
  } finally {
    clearTimeout(timer);
  }
}

function isEntry(e: unknown): e is ScoreEntry {
  const o = e as ScoreEntry;
  return !!o && typeof o.name === 'string' && typeof o.score === 'number' && typeof o.level === 'number';
}

/** The global top 10. Throws if the server can't be reached. */
export async function fetchTop(): Promise<ScoreEntry[]> {
  return (await call('/scores')).top;
}

/** Post a score; resolves to the updated top 10. */
export async function submitScore(s: Submission): Promise<ScoreEntry[]> {
  const body = { name: s.name, score: s.score, level: s.level, seconds: Math.round(s.seconds * 10) / 10 };
  return (
    await call('/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  ).top;
}

/** This device's best, if one was saved (blocked or bad storage just means none). */
export function loadBest(): ScoreEntry | null {
  try {
    const raw = localStorage.getItem(SCORES.storageKey);
    if (!raw) return null;
    const e = JSON.parse(raw) as unknown;
    return isEntry(e) && checkName(e.name) === 'ok' ? e : null;
  } catch {
    return null;
  }
}

export function saveBest(e: ScoreEntry): void {
  try {
    localStorage.setItem(SCORES.storageKey, JSON.stringify({ name: e.name, score: e.score, level: e.level }));
  } catch {
    // Storage blocked: the best just isn't remembered.
  }
}
