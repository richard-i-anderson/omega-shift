-- High scores for Omega Shift. Apply with:
--   npx wrangler d1 execute omega-shift-scores --remote --file schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  -- Salted SHA-256 of the poster's IP, only for rate limiting.
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_by_score ON scores (score DESC, id ASC);
CREATE INDEX IF NOT EXISTS scores_by_poster ON scores (ip_hash, created_at);
