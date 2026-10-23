CREATE TABLE IF NOT EXISTS score_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  runs INTEGER NOT NULL DEFAULT 0 CHECK (runs >= 0)
);
INSERT OR IGNORE INTO score_stats (id, runs) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  floor INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  lv INTEGER NOT NULL,
  secs INTEGER NOT NULL,
  diff TEXT NOT NULL,
  victory INTEGER NOT NULL,
  rank TEXT NOT NULL,
  weapon TEXT NOT NULL,
  pid TEXT NOT NULL,
  date INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_ranking ON scores (score DESC, date ASC, id ASC);

-- Only hashes of the Cloudflare-provided client IP are stored. Expired entries
-- are removed on the next submission; no raw IP is persisted or returned.
CREATE TABLE IF NOT EXISTS score_cooldowns (
  client TEXT PRIMARY KEY,
  next_at INTEGER NOT NULL,
  token TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS score_cooldowns_expiry ON score_cooldowns (next_at);
