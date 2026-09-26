import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '../shared/scores';
import { corsOrigin, handle, hashIp, RATE_LIMIT, TOP_N, type Context, type ScoreStore } from '../worker/src/logic';

const SITE = 'https://richard-i-anderson.github.io';

/** An in-memory stand-in for the D1 table. */
function fakeStore(): ScoreStore & { rows: (ScoreEntry & { createdAt: number; ipHash: string })[] } {
  const rows: (ScoreEntry & { createdAt: number; ipHash: string })[] = [];
  return {
    rows,
    async top(n) {
      return [...rows].sort((a, b) => b.score - a.score).slice(0, n).map(({ name, score, level }) => ({ name, score, level }));
    },
    async postsSince(ipHash, since) {
      return rows.filter((r) => r.ipHash === ipHash && r.createdAt >= since).length;
    },
    async insert(r) {
      rows.push(r);
    },
    async countAbove(score) {
      return rows.filter((r) => r.score > score).length;
    },
  };
}

function ctx(store: ScoreStore, over: Partial<Context> = {}): Context {
  return { store, allowedOrigins: [SITE, 'http://localhost:5173'], now: 1_000_000, ipHash: 'ip-a', ...over };
}

const post = (body: unknown, origin = SITE) =>
  new Request('https://scores.example/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const entry = (name: string, score: number, level = 2) => ({ name, score, level, seconds: 120 });

describe('score worker', () => {
  it('stores a valid score and returns the top 10 and its rank', async () => {
    const store = fakeStore();
    const res = await handle(post(entry('ACE', 5000)), ctx(store));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ top: [{ name: 'ACE', score: 5000, level: 2 }], rank: 1 });
    const res2 = await handle(post(entry('BOB', 9000)), ctx(store, { ipHash: 'ip-b' }));
    expect(((await res2.json()) as { rank: number }).rank).toBe(1);
    const res3 = await handle(post(entry('CAT', 100)), ctx(store, { ipHash: 'ip-c' }));
    expect(((await res3.json()) as { rank: number }).rank).toBe(3);
  });

  it('GET returns at most the top 10, highest first', async () => {
    const store = fakeStore();
    for (let i = 1; i <= 15; i++) await store.insert({ name: 'AAA', score: i * 100, level: 1, createdAt: 0, ipHash: 'x' });
    const res = await handle(new Request('https://scores.example/scores', { headers: { Origin: SITE } }), ctx(store));
    const { top } = (await res.json()) as { top: ScoreEntry[] };
    expect(top).toHaveLength(TOP_N);
    expect(top[0].score).toBe(1500);
    expect(top.map((e) => e.score)).toEqual([...top.map((e) => e.score)].sort((a, b) => b - a));
  });

  it('refuses rude names and implausible scores, and stores nothing', async () => {
    const store = fakeStore();
    for (const bad of [entry('FUCK', 5000), entry('ACE', 5001), entry('ACE', 9_000_000), 'not json']) {
      const res = await handle(post(bad), ctx(store));
      expect([400, 422]).toContain(res.status);
    }
    expect(store.rows).toHaveLength(0);
  });

  it('rate-limits each player', async () => {
    const store = fakeStore();
    for (let i = 0; i < RATE_LIMIT.posts; i++) expect((await handle(post(entry('ACE', 1000)), ctx(store))).status).toBe(200);
    expect((await handle(post(entry('ACE', 1000)), ctx(store))).status).toBe(429);
    // Someone else, or the same player after the window, is fine.
    expect((await handle(post(entry('BOB', 1000)), ctx(store, { ipHash: 'ip-b' }))).status).toBe(200);
    expect((await handle(post(entry('ACE', 1000)), ctx(store, { now: 1_000_000 + RATE_LIMIT.windowSec + 1 }))).status).toBe(200);
  });

  it('only answers CORS for the game\'s own sites, and handles the preflight', async () => {
    expect(corsOrigin(SITE, [SITE])).toBe(SITE);
    expect(corsOrigin('https://evil.example', [SITE])).toBeNull();
    expect(corsOrigin(null, [SITE])).toBeNull();
    const pre = await handle(new Request('https://scores.example/scores', { method: 'OPTIONS', headers: { Origin: SITE } }), ctx(fakeStore()));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    const other = await handle(post(entry('ACE', 1000), 'https://evil.example'), ctx(fakeStore()));
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('404s other paths', async () => {
    expect((await handle(new Request('https://scores.example/'), ctx(fakeStore()))).status).toBe(404);
  });

  it('hashes IPs with the salt, never storing the address', async () => {
    const a = await hashIp('1.2.3.4', 'salt');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('1.2.3.4');
    expect(await hashIp('1.2.3.4', 'other')).not.toBe(a);
  });
});
