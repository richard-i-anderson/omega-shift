import { checkSubmission, type ScoreEntry, type Submission } from '../../shared/scores';

/**
 * The score API, separate from Cloudflare's bindings so tests can run it
 * against a fake store. `index.ts` adapts D1 to `ScoreStore`.
 *
 *   GET  /scores  → { top: ScoreEntry[] }
 *   POST /scores  { name, score, level, seconds } → { top, rank }
 */

export const TOP_N = 10;
/** Each player (by salted IP hash) may post at most this many scores per window. */
export const RATE_LIMIT = { posts: 5, windowSec: 600 };

export interface ScoreStore {
  top(n: number): Promise<ScoreEntry[]>;
  /** Scores posted from this IP hash since `since` (epoch s). */
  postsSince(ipHash: string, since: number): Promise<number>;
  insert(row: ScoreEntry & { createdAt: number; ipHash: string }): Promise<void>;
  /** How many stored scores are strictly higher than `score`. */
  countAbove(score: number): Promise<number>;
}

export interface Context {
  store: ScoreStore;
  allowedOrigins: readonly string[];
  /** Epoch seconds. */
  now: number;
  ipHash: string;
}

/** The CORS origin to echo back, if the request's origin is allowed. */
export function corsOrigin(origin: string | null, allowed: readonly string[]): string | null {
  return origin && allowed.includes(origin) ? origin : null;
}

function json(body: unknown, status: number, origin: string | null): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

export async function handle(req: Request, ctx: Context): Promise<Response> {
  const origin = corsOrigin(req.headers.get('Origin'), ctx.allowedOrigins);
  const { pathname } = new URL(req.url);
  if (pathname !== '/scores') return json({ error: 'not found' }, 404, origin);
  if (req.method === 'OPTIONS') return json(null, 204, origin);
  if (req.method === 'GET') return json({ top: await ctx.store.top(TOP_N) }, 200, origin);
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400, origin);
  }
  const why = checkSubmission(body);
  if (why) return json({ error: why }, 422, origin);
  const s = body as Submission;
  if ((await ctx.store.postsSince(ctx.ipHash, ctx.now - RATE_LIMIT.windowSec)) >= RATE_LIMIT.posts) {
    return json({ error: 'too many scores, try later' }, 429, origin);
  }
  const rank = (await ctx.store.countAbove(s.score)) + 1;
  await ctx.store.insert({ name: s.name, score: s.score, level: s.level, createdAt: ctx.now, ipHash: ctx.ipHash });
  return json({ top: await ctx.store.top(TOP_N), rank }, 200, origin);
}

/** A salted SHA-256 of the IP, hex: enough to rate-limit, without storing the address. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
