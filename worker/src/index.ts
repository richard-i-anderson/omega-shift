import type { ScoreEntry } from '../../shared/scores';
import { handle, hashIp, type ScoreStore } from './logic';

/** The parts of Cloudflare's D1 binding this uses (no types package needed). */
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
  DB: D1Database;
  /** Comma-separated origins allowed to call the API (the game's sites). */
  ALLOWED_ORIGINS: string;
  /** Secret salt for hashing IPs (`wrangler secret put IP_SALT`). */
  IP_SALT: string;
}

function d1Store(db: D1Database): ScoreStore {
  return {
    async top(n) {
      const { results } = await db
        .prepare('SELECT name, score, level FROM scores ORDER BY score DESC, id ASC LIMIT ?')
        .bind(n)
        .all<ScoreEntry>();
      return results;
    },
    async postsSince(ipHash, since) {
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at >= ?')
        .bind(ipHash, since)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },
    async insert(r) {
      await db
        .prepare('INSERT INTO scores (name, score, level, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)')
        .bind(r.name, r.score, r.level, r.createdAt, r.ipHash)
        .run();
    },
    async countAbove(score) {
      const row = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ?').bind(score).first<{ n: number }>();
      return row?.n ?? 0;
    },
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    return handle(req, {
      store: d1Store(env.DB),
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
      now: Math.floor(Date.now() / 1000),
      ipHash: await hashIp(ip, env.IP_SALT ?? ''),
    });
  },
};
